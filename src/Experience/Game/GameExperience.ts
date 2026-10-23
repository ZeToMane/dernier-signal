import Arduino from "../Arduino/Arduino";
import AudioEngine from "../Audio/AudioEngine";
import { GameEngine, type ChartData, type ChartNote } from "./GameEngine";
import { LaneInput } from "./LaneInput";

const LANES = [
    { sample: "arpege" },
    { sample: "drum" },
    { sample: "pad" },
] as const;
/** La corne joue l'arpège (lane) quand on souffle, en plus de la touche D. */
const HORN_LANE = 0;
/** Le sablier joue le kick (drum lane), en plus de la touche F. */
const HOURGLASS_LANE = 1;
/** L'étoile joue le pad / fréquence (lane) en s'ouvrant, en plus de la touche J. La cacher ne fait qu'armer. */
const STAR_LANE = 2;

/** |hit - note| under this (seconds) counts. Early hits are scheduled on the note. */
const HIT_WINDOW = 0.12;
/**
 * Ouvrir la main en rythme est moins précis qu'une touche : fenêtre élargie pour l'étoile.
 * Sans risque de capter la mauvaise note : une seule note pad par boucle (~6 s).
 */
const STAR_HIT_WINDOW = 0.25;
/**
 * Délai capteur → jeu de l'étoile (mesures toutes les 15 ms, lissées sur 4, + série), en secondes.
 * Retranché de l'instant du hit pour juger le geste réel, pas sa détection.
 */
const STAR_LATENCY = 0.04;
/** Souffler en rythme est aussi approximatif ; une seule note arpège par boucle. */
const HORN_HIT_WINDOW = 0.25;
/**
 * Délai micro → jeu, en secondes : tranches de 30 ms, souffle validé à la 3e au-dessus
 * du seuil (Horn.ts), + série. Mesuré ≈ 60–90 ms après le début du souffle.
 */
const HORN_LATENCY = 0.08;

const hitWindow = (lane: number) =>
    lane === STAR_LANE ? STAR_HIT_WINDOW : lane === HORN_LANE ? HORN_HIT_WINDOW : HIT_WINDOW;
/**
 * Accuracy = share of hits among the last N judgments (hits, misses, stray presses).
 * ~3 loops (10 notes each): one mistake costs ~3 points instead of 10, so it doesn't swing.
 */
const ACCURACY_SAMPLES = 30;
/**
 * Final gauge (all lanes active): each caught note adds its lane's points, misses cost nothing.
 * Rare notes weigh more so the 3 players count alike (per loop: 8 kicks, 1 pad, 1 arpège).
 */
const GAUGE_POINTS = [3, 1, 3];
/** Points to fill the gauge (~5–6 points per loop when playing decently → ~30–40 s). */
const GAUGE_TARGET = 30;
/**
 * A miss (or stray press) takes points back, so the gauge feels at stake. But never more than
 * MISS_MAX_DROP under its best level, and the penalty fades to 0 over MISS_FADE s: a struggling
 * group still finishes (simulated: every level of play fills it in < 2 min, a good one in ~20 s).
 */
const MISS_PENALTY = 0.5;
const MISS_MAX_DROP = 3;
const MISS_FADE = 60;

type Phase = "idle" | "loop" | "drop";

type PendingNote = ChartNote & {
    /** AudioContext time the note must sound. */
    at: number;
    hit: boolean;
};

export class GameExperience {
    readonly audio = new AudioEngine();
    readonly engine = new GameEngine(this.audio);

    readonly arduino = new Arduino();

    private readonly input = new LaneInput((lane) => this.onLane(lane));
    private readonly ready: Promise<void>;
    private chart: ChartData | null = null;
    private pending: PendingNote[] = [];
    private phase: Phase = "idle";
    /** Only lanes whose trace is revealed (one per found object) are judged. */
    private activeLanes = 0;
    private judgments: boolean[] = [];
    private gaugePoints = 0;
    private gaugePeak = 0;
    /** AudioContext time the gauge started (all lanes active). */
    private gaugeStart = 0;
    private starting = false;
    private dropRequested = false;
    private onChartReady:
        | ((chart: ChartData, loopDuration: number) => void)
        | null = null;
    private onHit:
        | ((lane: number, noteTime: number, absSongTime: number) => void)
        | null = null;

    constructor() {
        // Notes en attente assez tôt pour accepter un hit en avance sur la plus large fenêtre.
        this.engine.scheduleAheadTime = Math.max(HIT_WINDOW, STAR_HIT_WINDOW, HORN_HIT_WINDOW) + 0.08;

        this.ready = this.load();
        this.bindUnlock();
        this.bindArduino();
    }

    /** Opens the board picker — must be called from a click. */
    async connectArduino() {
        if (this.arduino.connected) return;
        await this.arduino.connect();
    }

    /** Seconds since the current BGM started, or null before unlock. */
    songTime(): number | null {
        if (this.phase === "idle") return null;
        return this.audio.currentTime - this.engine.startTime;
    }

    /** Called once the chart + loop duration are known (for HUD sync). */
    whenChartReady(
        callback: (chart: ChartData, loopDuration: number) => void,
    ) {
        this.onChartReady = callback;
        if (this.chart && this.engine.trackDuration > 0) {
            callback(this.chart, this.engine.trackDuration);
        }
    }

    /** Fired on each successful lane hit (for HUD peak collapse). */
    whenHit(
        callback: (lane: number, noteTime: number, absSongTime: number) => void,
    ) {
        this.onHit = callback;
    }

    /**
     * Start LOOP when signal object 1 is found — not on the base "fête" HUD.
     * Safe to call repeatedly; no-ops once music has started.
     */
    startLoop() {
        void this.begin();
    }

    /** 0–100: final gauge, filled by caught notes once every lane is active. */
    get gauge() {
        return Math.min(100, (this.gaugePoints / GAUGE_TARGET) * 100);
    }

    /** Judgments counted in `accuracy` (max ACCURACY_SAMPLES). */
    get judged() {
        return this.judgments.length;
    }

    /** 0–100, over the last ACCURACY_SAMPLES judgments (0 before any). */
    get accuracy() {
        if (this.judgments.length === 0) return 0;
        const hits = this.judgments.filter(Boolean).length;
        return (hits / this.judgments.length) * 100;
    }

    /** Number of playable lanes (= signal objects found, max 3). */
    setActiveLanes(count: number) {
        const lanes = Math.max(0, Math.min(LANES.length, count));
        // New lane = new game: accuracy only reflects play with the current lanes.
        if (lanes !== this.activeLanes) {
            this.judgments = [];
            this.gaugePoints = 0;
            this.gaugePeak = 0;
            this.gaugeStart = this.audio.currentTime;
        }
        this.activeLanes = lanes;
    }

    /** Debug stand-in for signal validation: LOOP gives way to the looping DROP. */
    playDrop() {
        this.dropRequested = true;
        if (this.phase === "loop") this.switchToDrop();
        else if (this.phase === "idle") void this.begin();
    }

    update() {
        if (this.phase !== "loop") return;

        const now = this.audio.currentTime;
        this.pending = this.pending.filter((note) => {
            if (note.hit) return false;
            // Garde la note le temps qu'un hit compensé (capteur) puisse encore l'atteindre.
            if (now <= note.at + hitWindow(note.lane) + Math.max(STAR_LATENCY, HORN_LATENCY)) return true;
            if (note.lane < this.activeLanes) this.judge(false);
            return false;
        });
    }

    private judge(hit: boolean) {
        if (!hit && this.activeLanes === LANES.length) {
            const elapsed = this.audio.currentTime - this.gaugeStart;
            const penalty = MISS_PENALTY * Math.max(0, 1 - elapsed / MISS_FADE);
            this.gaugePoints = Math.max(
                0,
                this.gaugePeak - MISS_MAX_DROP,
                this.gaugePoints - penalty,
            );
        }
        this.judgments.push(hit);
        if (this.judgments.length > ACCURACY_SAMPLES) this.judgments.shift();
    }

    dispose() {
        this.input.dispose();
        void this.arduino.disconnect();
        this.engine.stopLevel();
    }

    private bindArduino() {
        this.arduino.hourglass.on("kick", () => this.onLane(HOURGLASS_LANE));
        this.arduino.horn.on("blow", () => {
            const result = this.onLane(HORN_LANE, HORN_LATENCY);
            this.logLaneTiming("corne / arpège", HORN_LANE, result);
        });
        this.arduino.star.on("hit", () => {
            const result = this.onLane(STAR_LANE, STAR_LATENCY);
            this.logLaneTiming("étoile / pad", STAR_LANE, result);
        });
        // Board already granted on this origin (e.g. via arduino.html): reopen silently.
        this.arduino.reconnect().catch(() => {});
    }

    private logLaneTiming(
        label: string,
        lane: number,
        result: ReturnType<GameExperience["onLane"]>,
    ) {
        if (result.ignored) {
            console.log(
                `%c[${label}] IGNORÉ`,
                "color:#ff5d63;font-weight:bold",
                `| ${result.reason} (phase=${this.phase}, lanes=${this.activeLanes}/3)`,
            );
            return;
        }

        const ms = Math.round(result.distanceMs);
        const windowMs = Math.round(hitWindow(lane) * 1000);
        if (result.success) {
            const earlyLate = result.deltaMs < 0 ? "en avance" : "en retard";
            console.log(
                `%c[${label}] RÉUSSI`,
                "color:#2fe0a0;font-weight:bold",
                `| écart ${ms} ms (${earlyLate}) — fenêtre ±${windowMs} ms | ` +
                    `song=${result.songTime.toFixed(2)}s note=${result.noteTime.toFixed(2)}s jauge=${this.gauge.toFixed(0)}%`,
            );
            return;
        }

        const nearest =
            result.nearestMs === null
                ? "aucune note à portée (trop tard ou trop tôt)"
                : `note la plus proche à ${Math.round(result.nearestMs)} ms ` +
                  `(hors fenêtre ±${windowMs} ms)`;
        console.log(
            `%c[${label}] RATÉ`,
            "color:#ff5d63;font-weight:bold",
            `| ${nearest} | song=${result.songTime.toFixed(2)}s accuracy=${this.accuracy.toFixed(0)}% jauge=${this.gauge.toFixed(0)}%`,
        );
    }

    private async load() {
        await this.audio.preloadManifest({
            loop: "/assets/loops/LOOP.mp3",
            drop: "/assets/loops/DROP.mp3",
            arpege: "/assets/sounds/ARPEGE.mp3",
            drum: "/assets/sounds/DRUM.mp3",
            pad: "/assets/sounds/PAD.mp3",
        });

        const res = await fetch("/assets/charts/chart.json");
        if (!res.ok) throw new Error(`Chart introuvable (${res.status}).`);
        const chart = (await res.json()) as ChartData;
        chart.offset = 0;
        this.engine.trackDuration = this.audio.getBufferDuration("loop");
        const loop = this.engine.trackDuration;
        chart.notes = [...chart.notes]
            .filter((n) => n.time >= 0 && n.time < loop)
            .sort((a, b) => a.time - b.time);
        this.chart = chart;

        this.onChartReady?.(chart, loop);
    }

    private bindUnlock() {
        // Unlock AudioContext on first gesture only — music waits for signal stage 1.
        const onGesture = () => {
            void this.audio.unlockAudio();
        };
        window.addEventListener("pointerdown", onGesture, { once: true });
        window.addEventListener("keydown", onGesture, { once: true });
    }

    private async begin() {
        if (this.phase !== "idle" || this.starting) return;
        this.starting = true;

        await this.audio.unlockAudio();
        await this.ready;
        if (!this.chart) {
            this.starting = false;
            return;
        }

        if (this.dropRequested) {
            this.switchToDrop();
            return;
        }

        this.engine.startLevel(this.chart, "loop", (note, at) => {
            this.pending.push({ ...note, at, hit: false });
        });
        this.phase = "loop";
    }

    private switchToDrop() {
        this.engine.stopLevel();
        this.pending = [];
        const startAt = this.audio.playBGM("drop");
        if (startAt !== null) this.engine.startTime = startAt;
        this.phase = "drop";
    }

    /** `latency` (s) : délai de détection du capteur, retranché de l'instant du hit. */
    private onLane(lane: number, latency = 0) {
        const songTime =
            this.phase === "idle" ? 0 : this.audio.currentTime - this.engine.startTime;

        if (this.phase !== "loop") {
            return {
                ignored: true as const,
                reason: "musique pas en loop",
                success: false,
                distanceMs: 0,
                deltaMs: 0,
                nearestMs: null as number | null,
                songTime,
                noteTime: 0,
            };
        }
        if (lane >= this.activeLanes) {
            return {
                ignored: true as const,
                reason: `lane ${lane} inactive (il faut Objet ${lane + 1})`,
                success: false,
                distanceMs: 0,
                deltaMs: 0,
                nearestMs: null as number | null,
                songTime,
                noteTime: 0,
            };
        }

        const now = this.audio.currentTime - latency;
        let best: PendingNote | null = null;
        let bestDistance = Infinity;
        let nearestDistance = Infinity;

        for (const note of this.pending) {
            if (note.hit || note.lane !== lane) continue;
            const distance = Math.abs(now - note.at);
            if (distance < nearestDistance) nearestDistance = distance;
            if (distance <= hitWindow(lane) && distance < bestDistance) {
                best = note;
                bestDistance = distance;
            }
        }

        // Pressing with no note in reach counts as a miss — no spamming to 100%.
        this.judge(best !== null);

        if (!best) {
            return {
                ignored: false as const,
                reason: "",
                success: false,
                distanceMs: 0,
                deltaMs: 0,
                nearestMs:
                    nearestDistance === Infinity ? null : nearestDistance * 1000,
                songTime,
                noteTime: 0,
            };
        }

        best.hit = true;
        if (this.activeLanes === LANES.length) {
            this.gaugePoints += GAUGE_POINTS[lane] ?? 1;
            this.gaugePeak = Math.max(this.gaugePeak, this.gaugePoints);
        }
        this.onHit?.(lane, best.time, best.at - this.engine.startTime);
        const sample = LANES[lane]?.sample;
        if (sample) {
            // Future hit: lock the sample to the chart. Late hit: play now.
            this.audio.scheduleSound(sample, Math.max(best.at, this.audio.currentTime));
        }

        return {
            ignored: false as const,
            reason: "",
            success: true,
            distanceMs: bestDistance * 1000,
            deltaMs: (now - best.at) * 1000,
            nearestMs: bestDistance * 1000,
            songTime,
            noteTime: best.time,
        };
    }
}
