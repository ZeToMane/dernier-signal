export default class AudioEngine {
    private audioCtx: AudioContext;
    private buffers: Map<string, AudioBuffer>;
    private bgmSource: AudioBufferSourceNode | null = null;
    private bgmGain: GainNode;

    constructor() {
        // Create the AudioContext (starts suspended in most modern browsers)
        this.audioCtx = new AudioContext();
        this.buffers = new Map<string, AudioBuffer>();

        // Setup a main gain node for background music to allow volume control
        this.bgmGain = this.audioCtx.createGain();
        this.bgmGain.connect(this.audioCtx.destination);
    }

    /**
     * MUST be called inside a user interaction event (like click or touch).
     * Browsers require a user gesture to resume the AudioContext.
     */
    public async unlockAudio(): Promise<void> {
        if (this.audioCtx.state === "suspended") {
            await this.audioCtx.resume();
        }
    }

    /**
     * Returns the ultra-precise hardware audio clock time.
     */
    public get currentTime(): number {
        return this.audioCtx.currentTime;
    }

    /**
     * Preload multiple audio samples via a manifest.
     * @param manifest A dictionary of { id: url }
     */
    public async preloadManifest(
        manifest: Record<string, string>,
    ): Promise<void> {
        const promises = Object.entries(manifest).map(async ([id, url]) => {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer =
                    await this.audioCtx.decodeAudioData(arrayBuffer);
                this.buffers.set(id, audioBuffer);
            } catch (error) {
                console.error(
                    `Failed to load audio for ${id} at ${url}:`,
                    error,
                );
            }
        });

        await Promise.all(promises);
    }

    /**
     * Plays a background track in an infinite loop.
     * Calling this while BGM is already playing will swap the track.
     * @param id The id of the preloaded audio buffer.
     * @returns The exact audioCtx time at which the track starts (or null on failure).
     */
    // FIX: now returns the exact start time so GameEngine can use it as its reference
    public playBGM(id: string, volume: number = 0.5): number | null {
        const buffer = this.buffers.get(id);
        if (!buffer) {
            console.warn(`Audio buffer '${id}' not found. Did you preload it?`);
            return null;
        }

        // Stop current BGM if it's playing
        this.stopBGM();

        this.bgmGain.gain.value = volume;

        this.bgmSource = this.audioCtx.createBufferSource();
        this.bgmSource.buffer = buffer;
        this.bgmSource.loop = true;
        this.bgmSource.connect(this.bgmGain);

        // FIX: schedule the start slightly in the future instead of start(0),
        // so the start time is known exactly and doesn't drift from what we read afterwards
        const startAt = this.audioCtx.currentTime + 0.1;
        this.bgmSource.start(startAt);

        return startAt;
    }

    /**
     * Stops the currently playing background music.
     */
    public stopBGM(): void {
        if (this.bgmSource) {
            // FIX: stop() can throw if the source was already stopped
            try {
                this.bgmSource.stop();
            } catch (error) {
                console.warn("BGM source was already stopped.", error);
            }
            this.bgmSource.disconnect();
            this.bgmSource = null;
        }
    }

    /**
     * Schedules a short sound/sample at an exact time in the future.
     * @param id Preloaded audio id
     * @param when Timestamp (against audioCtx.currentTime) to play the sound
     */
    public scheduleSound(id: string, when: number): void {
        const buffer = this.buffers.get(id);
        if (!buffer) {
            // FIX: warn like playBGM does instead of failing silently
            console.warn(`Audio buffer '${id}' not found. Did you preload it?`);
            return;
        }

        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioCtx.destination);
        source.start(when);
    }

    // Inside AudioEngine
    public getBufferDuration(id: string): number {
        const buffer = this.buffers.get(id);
        if (!buffer) {
            console.warn(`Buffer ${id} not found.`);
            return 0;
        }
        return buffer.duration; // Returns exact duration in seconds
    }
}
