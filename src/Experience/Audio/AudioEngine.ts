/**
 * AudioEngine — owns ALL sound for the experience, on top of the Web Audio API.
 *
 * Responsibilities
 *  - load / decode samples
 *  - play one-shot samples instantly (triggered by the ESP32 objects)
 *  - run ONE background loop, and expose it as the game clock (songTime)
 *  - schedule the drop exactly on a loop boundary
 *
 * The rest of the app should never touch AudioContext directly.
 */

export interface PlayOptions {
    /** AudioContext time at which to start. Default: now. */
    when?: number;
    /** Linear gain for this voice, 0..1+. Default: 1. */
    gain?: number;
    /** Pitch/speed. Default: 1. */
    playbackRate?: number;
}

export interface LoopOptions {
    /** AudioContext time at which the loop starts. Default: now + LOOP_START_LEAD. */
    when?: number;
    gain?: number;
}

/** Small safety delay so the start is never scheduled "in the past". */
const LOOP_START_LEAD = 0.1;
/** If a boundary is closer than this, we use the following one. */
const MIN_SCHEDULE_LEAD = 0.05;

export class AudioEngine {
    readonly ctx: AudioContext;

    // Buses: sources -> (sfxBus | musicBus) -> master -> destination
    private readonly master: GainNode;
    private readonly musicBus: GainNode;
    private readonly sfxBus: GainNode;

    private readonly buffers = new Map<string, AudioBuffer>();

    // Loop state
    private loopSource: AudioBufferSourceNode | null = null;
    private loopGain: GainNode | null = null;
    private loopBuffer: AudioBuffer | null = null;
    private loopStartTime = 0; // AudioContext time at which the loop's position 0 plays

    constructor() {
        this.ctx = new AudioContext({ latencyHint: "interactive" });

        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();

        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(this.ctx.destination);
    }

    // ---------------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------------

    /**
     * Browsers keep the AudioContext suspended until a user gesture.
     * Call this from a click/keydown handler (e.g. your setup screen button).
     */
    async unlock(): Promise<void> {
        if (this.ctx.state !== "running") {
            await this.ctx.resume();
        }
    }

    /** Fetch + decode one file and register it under `id`. */
    async load(id: string, url: string): Promise<void> {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(
                `AudioEngine: failed to fetch "${url}" (${res.status})`,
            );
        const data = await res.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(data);
        this.buffers.set(id, buffer);
    }

    /** Load many files in parallel: { kick: '/audio/kick.wav', ... } */
    async loadAll(manifest: Record<string, string>): Promise<void> {
        await Promise.all(
            Object.entries(manifest).map(([id, url]) => this.load(id, url)),
        );
    }

    has(id: string): boolean {
        return this.buffers.has(id);
    }

    // ---------------------------------------------------------------------------
    // One-shot samples (triggered by the objects)
    // ---------------------------------------------------------------------------

    /** Play a sample. Polyphonic: calling it again never cuts the previous one. */
    playSample(id: string, opts: PlayOptions = {}): AudioBufferSourceNode {
        const buffer = this.getBuffer(id);
        const { when = 0, gain = 1, playbackRate = 1 } = opts;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = playbackRate;

        const voice = this.ctx.createGain();
        voice.gain.value = gain;

        src.connect(voice);
        voice.connect(this.sfxBus);

        // Free the nodes once the sound is over.
        src.onended = () => {
            src.disconnect();
            voice.disconnect();
        };

        // when = 0 (or in the past) means "as soon as possible".
        src.start(when);
        return src;
    }

    // ---------------------------------------------------------------------------
    // Background loop = the game clock
    // ---------------------------------------------------------------------------

    /**
     * Start the looping background track. Returns the AudioContext time at which
     * the loop begins. The buffer should be a clean loop (WAV/OGG, whole bars):
     * MP3 adds padding and creates a gap at every wrap.
     */
    startLoop(id: string, opts: LoopOptions = {}): number {
        this.stopLoop();

        const buffer = this.getBuffer(id);
        const { gain = 1 } = opts;
        const when = opts.when ?? this.ctx.currentTime + LOOP_START_LEAD;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true; // playbackRate stays 1: the songTime maths relies on it

        const g = this.ctx.createGain();
        g.gain.value = gain;

        src.connect(g);
        g.connect(this.musicBus);
        src.start(when);

        this.loopSource = src;
        this.loopGain = g;
        this.loopBuffer = buffer;
        this.loopStartTime = when;

        return when;
    }

    /** Stop the loop now, or at `when`. Optional short fade to avoid a click. */
    stopLoop(when?: number, fadeSeconds = 0): void {
        const src = this.loopSource;
        const g = this.loopGain;
        if (!src || !g) return;

        const t = Math.max(when ?? this.ctx.currentTime, this.ctx.currentTime);
        if (fadeSeconds > 0) {
            g.gain.setValueAtTime(g.gain.value, t);
            g.gain.linearRampToValueAtTime(0, t + fadeSeconds);
            src.stop(t + fadeSeconds);
        } else {
            src.stop(t);
        }

        src.onended = () => {
            src.disconnect();
            g.disconnect();
        };

        this.loopSource = null;
        this.loopGain = null;
        // loopBuffer / loopStartTime are kept so songTime() keeps working
        // until the next startLoop() (handy while the drop is about to play).
    }

    /** Duration of one loop, in seconds (0 if no loop was started). */
    get loopDuration(): number {
        return this.loopBuffer?.duration ?? 0;
    }

    /**
     * Seconds since the loop started, on the AUDIO clock.
     * Negative during the short pre-roll before the loop begins.
     * This is the single clock for falling notes and judgement.
     */
    songTime(): number {
        return this.ctx.currentTime - this.loopStartTime;
    }

    /** Position inside the current loop, in [0, loopDuration). */
    loopPosition(): number {
        const d = this.loopDuration;
        if (d === 0) return 0;
        const t = this.songTime();
        return ((t % d) + d) % d;
    }

    /** How many full loops have elapsed (0 during the first pass). */
    loopCount(): number {
        const d = this.loopDuration;
        return d === 0 ? 0 : Math.floor(this.songTime() / d);
    }

    /**
     * Convert a performance.now() timestamp (e.g. when a serial message was
     * received) into song time. Both clocks are read back-to-back, so the
     * conversion is accurate to a fraction of a millisecond.
     * Output latency and sensor latency are NOT included: that's the job of
     * your calibration offset.
     */
    perfToSongTime(perfMs: number): number {
        const audioNow = this.ctx.currentTime;
        const perfNow = performance.now();
        return audioNow + (perfMs - perfNow) / 1000 - this.loopStartTime;
    }

    /** AudioContext time of the next loop boundary that is far enough ahead. */
    nextLoopBoundary(): number {
        const d = this.loopDuration;
        if (d === 0) return this.ctx.currentTime;

        const now = this.ctx.currentTime;
        const elapsed = Math.max(now - this.loopStartTime, 0);
        let boundary = this.loopStartTime + Math.ceil(elapsed / d) * d;
        if (boundary - now < MIN_SCHEDULE_LEAD) boundary += d;
        return boundary;
    }

    // ---------------------------------------------------------------------------
    // The drop
    // ---------------------------------------------------------------------------

    /**
     * Start the drop track exactly on the next loop boundary and stop the loop
     * at the same instant. Returns the boundary time (AudioContext time).
     */
    scheduleDropAtNextLoop(
        dropId: string,
        opts: { gain?: number } = {},
    ): number {
        const buffer = this.getBuffer(dropId);
        const at = this.nextLoopBoundary();

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;

        const g = this.ctx.createGain();
        g.gain.value = opts.gain ?? 1;

        src.connect(g);
        g.connect(this.musicBus);
        src.start(at);
        src.onended = () => {
            src.disconnect();
            g.disconnect();
        };

        this.loopSource?.stop(at); // same instant: no gap, no overlap
        return at;
    }

    // ---------------------------------------------------------------------------
    // Volume & diagnostics
    // ---------------------------------------------------------------------------

    setVolumes(v: { master?: number; music?: number; sfx?: number }): void {
        const t = this.ctx.currentTime;
        if (v.master !== undefined)
            this.master.gain.setTargetAtTime(v.master, t, 0.01);
        if (v.music !== undefined)
            this.musicBus.gain.setTargetAtTime(v.music, t, 0.01);
        if (v.sfx !== undefined)
            this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.01);
    }

    /** Browser-reported latencies (seconds). Useful for a debug overlay. */
    get latency(): { base: number; output: number } {
        return {
            base: this.ctx.baseLatency ?? 0,
            output: this.ctx.outputLatency ?? 0,
        };
    }

    async dispose(): Promise<void> {
        this.stopLoop();
        await this.ctx.close();
        this.buffers.clear();
    }

    // ---------------------------------------------------------------------------

    private getBuffer(id: string): AudioBuffer {
        const buffer = this.buffers.get(id);
        if (!buffer)
            throw new Error(`AudioEngine: sample "${id}" is not loaded`);
        return buffer;
    }

    /** Temps absolu du contexte audio (AudioContext time). */
    get currentTime(): number {
        return this.ctx.currentTime;
    }

    /** Durée en secondes d'un échantillon chargé. */
    duration(id: string): number {
        return this.getBuffer(id).duration;
    }
}
