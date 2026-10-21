import AudioEngine from "../Audio/AudioEngine";

export interface ChartNote {
    time: number; // Time in seconds relative to the start of the audio file
    lane: number;
}

export interface ChartData {
    bpm: number;
    offset: number; // Shift (in seconds) applied to every note against the audio
    notes: ChartNote[];
}

export class GameEngine {
    audio: AudioEngine;
    chart: ChartData | null = null;

    startTime: number = 0;
    noteIndex: number = 0;
    loopCount: number = 0;
    trackDuration: number = 0;

    scheduleAheadTime: number = 0.1; // 100ms lookahead
    tickMs: number = 25;
    gameLoopId: number | null = null;

    // FIX: stored on the instance so restarting a level updates them
    onSpawnVisual: ((note: ChartNote, absoluteHitTime: number) => void) | null =
        null;
    hitSfxId: string = "hitSfx";

    constructor(audioEngine: AudioEngine) {
        this.audio = audioEngine;
    }

    startLevel(
        chart: ChartData,
        bgmId: string,
        onSpawnVisual: (note: ChartNote, absoluteHitTime: number) => void,
        hitSfxId: string = "hitSfx", // FIX: no longer hardcoded
    ): void {
        this.chart = chart;
        this.noteIndex = 0;
        this.loopCount = 0;
        this.onSpawnVisual = onSpawnVisual;
        this.hitSfxId = hitSfxId;

        // 1. Ask the audio engine exactly how long this file is down to the microsecond
        this.trackDuration = this.audio.getBufferDuration(bgmId);

        if (this.trackDuration === 0) {
            console.error("Track duration is 0. Did you preload the audio?");
            return;
        }

        // 2. Start the music and use the exact scheduled start time it returns
        // FIX: previously read audio.currentTime right after playBGM(), which was imprecise
        const startAt = this.audio.playBGM(bgmId);
        if (startAt === null) return;
        this.startTime = startAt;

        if (this.gameLoopId !== null) return;

        // 3. Start the scheduler tick
        this.gameLoopId = window.setInterval(() => {
            if (!this.chart || this.chart.notes.length === 0) return;

            // Time elapsed since the song started (keeps growing across loops, never wrapped)
            const currentSongTime = this.audio.currentTime - this.startTime;

            // While the next note falls inside our lookahead window...
            // FIX: everything is compared in "unwrapped" time (loops * trackLength + note time).
            // Before, the wrapped time (% trackDuration) was compared with a note time
            // that had no loop offset, which caused notes to be scheduled in a flood at loop ends.
            while (true) {
                const note = this.chart.notes[this.noteIndex];

                // Note time on the full, unwrapped timeline
                const noteSongTime =
                    this.loopCount * this.trackDuration +
                    note.time +
                    this.chart.offset;

                if (noteSongTime >= currentSongTime + this.scheduleAheadTime) {
                    break;
                }

                // Calculate exact hardware time: Start + (Loops * TrackLength) + NoteTime
                const absoluteHitTime = this.startTime + noteSongTime;

                // Schedule audio and visual triggers
                this.audio.scheduleSound(this.hitSfxId, absoluteHitTime);
                this.onSpawnVisual?.(note, absoluteHitTime);

                this.noteIndex++;

                // When we hit the end of the JSON array, reset the index and increment the loop counter
                // FIX: done right after scheduling the last note, inside the loop, so the
                // first notes of the next loop can be scheduled in the same lookahead window
                if (this.noteIndex >= this.chart.notes.length) {
                    this.noteIndex = 0;
                    this.loopCount++;
                }
            }
        }, this.tickMs);
    }

    stopLevel(): void {
        if (this.gameLoopId !== null) {
            window.clearInterval(this.gameLoopId);
            this.gameLoopId = null;
        }
        this.audio.stopBGM();
    }
}
