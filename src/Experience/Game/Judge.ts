/**
 * Judge — decides what each hit is worth.
 *
 * Two entry points:
 *   - onHit(device, perfMs): call when an object sends an event.
 *       -> finds the nearest unhandled note of THAT device within the good window
 *       -> grades it perfect / good, or reports a "stray" (a hit with no note nearby)
 *   - update(): call every frame.
 *       -> notes nobody hit in time become "miss"
 *
 * "Success" for the game is the ROLLING accuracy: the average score of the last
 * `rollingWindow` judged notes. A rolling window (instead of an average over the
 * whole round) lets a group that starts badly still recover and win.
 *
 * Time maths: delta = hitTime - note.time
 *   delta < 0 -> early,  delta > 0 -> late.
 * hitTime already includes the per-device latency compensation (Conductor.hitTime).
 */

import type { Conductor, NoteInstance } from "./Conductor";
import { Emitter } from "./Emitter";

export type Grade = "perfect" | "good" | "miss";

export interface Judgement {
    note: NoteInstance;
    grade: Grade;
    /** hitTime - note.time, in seconds. null for a miss (nothing was played). */
    delta: number | null;
}

export interface JudgeConfig {
    /** |delta| <= this -> perfect (seconds). */
    perfectWindow: number;
    /** |delta| <= this -> good (seconds). Also the maximum matching distance. */
    goodWindow: number;
    /**
     * A note is declared missed only once a hit arriving now could no longer match it,
     * plus this margin, to leave time for events still travelling over USB/serial.
     */
    lateEventGrace: number;
    /** Number of recent judged notes used for the rolling accuracy. */
    rollingWindow: number;
    /** Score of each grade, in [0, 1]. */
    weights: Record<Grade, number>;
    /**
     * If true, a hit with no note nearby counts as a miss in the rolling accuracy
     * (stops button-mashing). Default false: a noisy sound sensor reacting to the
     * room would otherwise punish the players.
     */
    strayCountsAsMiss: boolean;
}

export type JudgeConfigInput = Partial<Omit<JudgeConfig, "weights">> & {
    weights?: Partial<Record<Grade, number>>;
};

export const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
    perfectWindow: 0.06,
    goodWindow: 0.12,
    lateEventGrace: 0.03,
    rollingWindow: 16,
    weights: { perfect: 1, good: 0.7, miss: 0 },
    strayCountsAsMiss: false,
};

export interface DeviceCounts {
    perfect: number;
    good: number;
    miss: number;
}

export interface JudgeStats {
    perfect: number;
    good: number;
    miss: number;
    strays: number;
    combo: number;
    bestCombo: number;
    byDevice: Record<string, DeviceCounts>;
}

export interface JudgeEvents {
    judgement: Judgement;
    stray: { device: string; time: number };
}

/** The only parts of the Conductor the Judge needs (also easy to fake in tests). */
export type JudgeSource = Pick<
    Conductor,
    "songTime" | "hitTime" | "notesBetween"
>;

export class Judge extends Emitter<JudgeEvents> {
    readonly config: JudgeConfig;

    private readonly settled = new Set<string>();
    private recent: number[] = [];
    private stats_: JudgeStats = emptyStats();
    private roundStart = 0; // song time at reset(): earlier notes are ignored
    private scanFrom = 0; // every note before this time is already settled

    constructor(
        private readonly source: JudgeSource,
        config: JudgeConfigInput = {},
        private readonly nowMs: () => number = () => performance.now(),
    ) {
        super();
        this.config = {
            ...DEFAULT_JUDGE_CONFIG,
            ...config,
            weights: { ...DEFAULT_JUDGE_CONFIG.weights, ...config.weights },
        };
        if (this.config.perfectWindow > this.config.goodWindow) {
            throw new Error("Judge: perfectWindow must be <= goodWindow.");
        }
    }

    /**
     * Start a fresh round. Call it AFTER the loop has started: notes before the
     * current song time are ignored from now on.
     */
    reset(): void {
        this.settled.clear();
        this.recent = [];
        this.stats_ = emptyStats();
        this.roundStart = Math.max(0, this.source.songTime());
        this.scanFrom = this.roundStart;
    }

    // ---------------------------------------------------------------------------
    // Inputs
    // ---------------------------------------------------------------------------

    /** An object fired. `perfMs` = performance.now() taken when the event was received. */
    onHit(device: string, perfMs: number): Judgement | null {
        const { goodWindow, perfectWindow } = this.config;
        const hitTime = this.source.hitTime(perfMs, device);

        let best: NoteInstance | null = null;
        let bestAbs = Infinity;
        for (const n of this.source.notesBetween(
            hitTime - goodWindow,
            hitTime + goodWindow,
        )) {
            if (n.device !== device) continue;
            if (n.time < this.roundStart || this.settled.has(n.id)) continue;
            const abs = Math.abs(hitTime - n.time);
            if (abs < bestAbs) {
                best = n;
                bestAbs = abs;
            }
        }

        if (!best) {
            this.stats_.strays++;
            if (this.config.strayCountsAsMiss)
                this.pushRecent(this.config.weights.miss);
            this.emit("stray", { device, time: hitTime });
            return null;
        }

        const grade: Grade = bestAbs <= perfectWindow ? "perfect" : "good";
        return this.settle(best, grade, hitTime - best.time);
    }

    /** Call every frame. Returns the notes that just became misses. */
    update(): Judgement[] {
        const { goodWindow, lateEventGrace } = this.config;
        const perfNow = this.nowMs();
        const songNow = this.source.songTime();

        const missed: Judgement[] = [];
        let earliestPending = songNow;

        for (const n of this.source.notesBetween(this.scanFrom, songNow)) {
            if (n.time < this.roundStart || this.settled.has(n.id)) continue;
            // The hit time an event received right now would get for this device:
            const h = this.source.hitTime(perfNow, n.device);
            if (h > n.time + goodWindow + lateEventGrace) {
                missed.push(this.settle(n, "miss", null));
            } else {
                earliestPending = Math.min(earliestPending, n.time);
            }
        }

        this.scanFrom = Math.max(this.scanFrom, earliestPending);
        return missed;
    }

    // ---------------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------------

    /** Rolling accuracy in [0, 1] over the last `rollingWindow` judged notes. */
    accuracy(): number {
        if (this.recent.length === 0) return 0;
        return this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
    }

    /** How many judged notes the rolling accuracy is currently based on. */
    sampleCount(): number {
        return this.recent.length;
    }

    get windowSize(): number {
        return this.config.rollingWindow;
    }

    /** Accuracy over the whole round, for an end-of-round summary. */
    lifetimeAccuracy(): number {
        const { perfect, good, miss } = this.stats_;
        const total = perfect + good + miss;
        if (total === 0) return 0;
        const w = this.config.weights;
        return (perfect * w.perfect + good * w.good + miss * w.miss) / total;
    }

    /** Live stats (read-only view). */
    get stats(): Readonly<JudgeStats> {
        return this.stats_;
    }

    /** True once a note has been graded (hit or missed): the renderer can hide it. */
    isSettled(noteId: string): boolean {
        return this.settled.has(noteId);
    }

    // ---------------------------------------------------------------------------

    private settle(
        note: NoteInstance,
        grade: Grade,
        delta: number | null,
    ): Judgement {
        this.settled.add(note.id);

        const s = this.stats_;
        s[grade]++;
        const dev = (s.byDevice[note.device] ??= {
            perfect: 0,
            good: 0,
            miss: 0,
        });
        dev[grade]++;

        if (grade === "miss") {
            s.combo = 0;
        } else {
            s.combo++;
            s.bestCombo = Math.max(s.bestCombo, s.combo);
        }

        this.pushRecent(this.config.weights[grade]);

        const judgement: Judgement = { note, grade, delta };
        this.emit("judgement", judgement);
        return judgement;
    }

    private pushRecent(weight: number): void {
        this.recent.push(weight);
        if (this.recent.length > this.config.rollingWindow) this.recent.shift();
    }
}

function emptyStats(): JudgeStats {
    return {
        perfect: 0,
        good: 0,
        miss: 0,
        strays: 0,
        combo: 0,
        bestCombo: 0,
        byDevice: {},
    };
}
