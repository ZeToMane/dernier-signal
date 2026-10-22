import AudioEngine from "../Audio/AudioEngine";
import { GameEngine, type ChartData, type ChartNote } from "./GameEngine";
import { LaneInput } from "./LaneInput";

const LANES = [
    { sample: "arpege" },
    { sample: "drum" },
    { sample: "pad" },
] as const;

/** |hit - note| under this (seconds) counts. Early hits are scheduled on the note. */
const HIT_WINDOW = 0.12;

type Phase = "idle" | "loop" | "drop";

type PendingNote = ChartNote & {
    /** AudioContext time the note must sound. */
    at: number;
    hit: boolean;
};

export class GameExperience {
    readonly audio = new AudioEngine();
    readonly engine = new GameEngine(this.audio);

    private readonly input = new LaneInput((lane) => this.onLane(lane));
    private readonly ready: Promise<void>;
    private chart: ChartData | null = null;
    private pending: PendingNote[] = [];
    private phase: Phase = "idle";
    private starting = false;
    private dropRequested = false;
    private onChartReady:
        | ((chart: ChartData, loopDuration: number) => void)
        | null = null;
    private onHit:
        | ((lane: number, noteTime: number, absSongTime: number) => void)
        | null = null;

    constructor() {
        this.engine.scheduleAheadTime = HIT_WINDOW + 0.08;

        this.ready = this.load();
        this.bindUnlock();
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
            if (now <= note.at + HIT_WINDOW) return true;
            return false;
        });
    }

    dispose() {
        this.input.dispose();
        this.engine.stopLevel();
    }

    private async load() {
        await this.audio.preloadManifest({
            loop: "/assets/loops/LOOP.mp3",
            drop: "/assets/loops/DROP.mp3",
            arpege: "/assets/sounds/ARPEGE.mp3",
            drum: "/assets/sounds/DRUM.mp3",
            pad: "/assets/sounds/PAD.mp3",
            // Sound design one-shots (HUD appearances, glitches…).
            beep: "/assets/sounds/beep.mp3",
            blip: "/assets/sounds/blip.mp3",
            blipBurst: "/assets/sounds/blipblipblipblip.mp3",
            click: "/assets/sounds/click.mp3",
            click2: "/assets/sounds/click2.mp3",
            tic: "/assets/sounds/tic.mp3",
            ticBurst: "/assets/sounds/tictictictic.mp3",
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

    private onLane(lane: number) {
        if (this.phase !== "loop") return;

        const now = this.audio.currentTime;
        let best: PendingNote | null = null;
        let bestDistance = Infinity;

        for (const note of this.pending) {
            if (note.hit || note.lane !== lane) continue;
            const distance = Math.abs(now - note.at);
            if (distance <= HIT_WINDOW && distance < bestDistance) {
                best = note;
                bestDistance = distance;
            }
        }

        if (!best) return;

        best.hit = true;
        this.onHit?.(lane, best.time, best.at - this.engine.startTime);
        const sample = LANES[lane]?.sample;
        if (!sample) return;
        // Future hit: lock the sample to the chart. Late hit: play now.
        this.audio.scheduleSound(sample, Math.max(best.at, now));
    }
}
