/**
 * Conductor — turns the AudioEngine clock into "game time".
 *
 * It answers three questions for the rest of the game:
 *   1. "What time is it in the music?"          -> songTime() / displayTime()
 *   2. "At what song time did the player act?"  -> hitTime(perfMs, device)
 *   3. "Which notes are around that time?"      -> visibleNotes() / closestNote()
 *
 * It does NOT judge hits (that's the Judge) and it does NOT draw anything.
 * It only knows about time and about the chart.
 *
 * Time vocabulary used everywhere:
 *   - song time    : seconds since the loop started, on the AUDIO clock.
 *   - loop time    : seconds inside one loop, in [0, loopDuration).
 *   - display time : song time shifted by visualOffset, used for DRAWING.
 */

import type { AudioEngine } from "../Audio/AudioEngine";

/**
 * The only parts of AudioEngine the Conductor needs.
 * (Keeping it narrow makes the Conductor easy to test with a fake clock.)
 */
export type ClockSource = Pick<
    AudioEngine,
    "songTime" | "perfToSongTime" | "loopDuration" | "startLoop" | "stopLoop"
>;

/** One note of the chart, expressed INSIDE a single loop. */
export interface ChartNote {
    /** Position inside the loop, in seconds: 0 <= t < loopDuration. */
    t: number;
    /** Which object must play it: 'button' | 'breath' | 'sound' ... */
    device: string;
    /** Optional sample to play when it is hit. */
    sample?: string;
}

/** A chart note placed on the absolute song timeline (one per loop repetition). */
export interface NoteInstance {
    /** `${loop}:${index}` — stable, so the Judge can remember which notes were handled. */
    id: string;
    loop: number;
    index: number;
    device: string;
    sample?: string;
    /** Absolute time on the song clock, in seconds. */
    time: number;
}

export interface Calibration {
    /**
     * Seconds subtracted from song time when DRAWING.
     * Compensates audio output latency vs. screen latency, so the notes look
     * aligned with what the player hears. One value for the whole installation.
     */
    visualOffset: number;
    /**
     * Seconds subtracted from a hit's time, per device.
     * Compensates sensor + ESP32 + USB latency (and the player's own reaction
     * habit). A button and a breath sensor won't have the same value.
     */
    inputOffset: Record<string, number>;
}

export class Conductor {
    private chart: ChartNote[] = [];
    private calibration: Calibration = { visualOffset: 0, inputOffset: {} };

    constructor(private readonly clock: ClockSource) {}

    // ---------------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------------

    /** The chart is written for ONE loop and repeats automatically. */
    setChart(notes: ChartNote[]): void {
        this.chart = [...notes].sort((a, b) => a.t - b.t);
        this.validateChart();
    }

    setCalibration(partial: Partial<Calibration>): void {
        this.calibration = {
            visualOffset: partial.visualOffset ?? this.calibration.visualOffset,
            inputOffset: {
                ...this.calibration.inputOffset,
                ...partial.inputOffset,
            },
        };
    }

    getCalibration(): Calibration {
        return {
            visualOffset: this.calibration.visualOffset,
            inputOffset: { ...this.calibration.inputOffset },
        };
    }

    /** Starts the background loop: from now on, the audio clock IS the game clock. */
    start(loopId: string): number {
        const startedAt = this.clock.startLoop(loopId);
        this.validateChart(); // loopDuration is known only once a loop exists
        return startedAt;
    }

    stop(): void {
        this.clock.stopLoop();
    }

    // ---------------------------------------------------------------------------
    // The clocks
    // ---------------------------------------------------------------------------

    get loopDuration(): number {
        return this.clock.loopDuration;
    }

    /** Raw audio clock: seconds since the loop started (negative during pre-roll). */
    songTime(): number {
        return this.clock.songTime();
    }

    /** Clock used for DRAWING (notes falling). */
    displayTime(): number {
        return this.clock.songTime() - this.calibration.visualOffset;
    }

    /** How many full loops have elapsed (0 during the first pass). */
    loopCount(): number {
        const d = this.clock.loopDuration;
        return d > 0 ? Math.floor(this.clock.songTime() / d) : 0;
    }

    /** Position inside the current loop, in [0, loopDuration). */
    loopPosition(): number {
        const d = this.clock.loopDuration;
        if (d <= 0) return 0;
        const t = this.clock.songTime();
        return ((t % d) + d) % d;
    }

    /**
     * Convert the timestamp of an object event (a performance.now() value taken
     * when the serial message was received) into song time, compensated for that
     * device's latency. This is the time you compare to a note's `time`.
     */
    hitTime(perfMs: number, device: string): number {
        return (
            this.clock.perfToSongTime(perfMs) -
            (this.calibration.inputOffset[device] ?? 0)
        );
    }

    // ---------------------------------------------------------------------------
    // Chart queries
    // ---------------------------------------------------------------------------

    /** All notes (all devices) with from <= time <= to, in chronological order. */
    notesBetween(from: number, to: number): NoteInstance[] {
        const d = this.clock.loopDuration;
        if (d <= 0 || this.chart.length === 0 || to < from) return [];

        const firstLoop = Math.max(0, Math.floor(from / d));
        const lastLoop = Math.floor(to / d);
        const out: NoteInstance[] = [];

        for (let loop = firstLoop; loop <= lastLoop; loop++) {
            for (let i = 0; i < this.chart.length; i++) {
                const n = this.chart[i];
                const time = loop * d + n.t;
                if (time < from) continue;
                if (time > to) break; // chart is sorted, nothing later in this loop fits
                out.push({
                    id: `${loop}:${i}`,
                    loop,
                    index: i,
                    device: n.device,
                    sample: n.sample,
                    time,
                });
            }
        }
        return out;
    }

    /**
     * Notes to draw right now: from `lookBehind` seconds past the hit line to
     * `lookAhead` seconds before it. Based on DISPLAY time.
     */
    visibleNotes(lookAhead: number, lookBehind = 0.3): NoteInstance[] {
        const now = this.displayTime();
        return this.notesBetween(now - lookBehind, now + lookAhead);
    }

    /** Seconds until `note` reaches the hit line (negative once it has passed). */
    timeUntil(note: NoteInstance): number {
        return note.time - this.displayTime();
    }

    /**
     * The note of `device` closest to `time` (a value from hitTime()), within
     * ±maxDelta seconds. `isTaken` lets the Judge skip notes already hit/missed.
     */
    closestNote(
        device: string,
        time: number,
        maxDelta: number,
        isTaken?: (id: string) => boolean,
    ): NoteInstance | null {
        let best: NoteInstance | null = null;
        let bestDelta = Infinity;

        for (const n of this.notesBetween(time - maxDelta, time + maxDelta)) {
            if (n.device !== device) continue;
            if (isTaken?.(n.id)) continue;
            const delta = Math.abs(n.time - time);
            if (delta < bestDelta) {
                best = n;
                bestDelta = delta;
            }
        }
        return best;
    }

    // ---------------------------------------------------------------------------

    private validateChart(): void {
        const d = this.clock.loopDuration;
        if (d <= 0) return;
        for (const n of this.chart) {
            if (n.t < 0 || n.t >= d) {
                console.warn(
                    `Conductor: note at t=${n.t}s (${n.device}) is outside the loop [0, ${d.toFixed(3)}).`,
                );
            }
        }
    }
}

/**
 * Calibration helper.
 *
 * During a calibration screen, notes arrive at known times and the player taps
 * along. For each tap, collect:  delta = rawHitSongTime - note.time
 * (raw = WITHOUT any inputOffset). Positive delta = late.
 * The median is a robust estimate of that device's latency: one bad tap
 * won't skew it the way an average would.
 */
export function estimateOffset(deltas: number[]): number {
    if (deltas.length === 0) return 0;
    const sorted = [...deltas].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}
