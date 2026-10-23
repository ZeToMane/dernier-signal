import EventEmitter from "../Utils/EventEmitter";
import type Arduino from "./Arduino";

/** Calm time below half the threshold before a new blow can count. */
const REARM_MS = 150;
/**
 * Consecutive readings (30 ms each) above the threshold to count as a blow.
 * A blow saturates the mic for 120 ms+, while thuds and the spike the module
 * gives right after a blow (rebound from saturation) last a single reading.
 */
const BLOW_SAMPLES = 3;

/**
 * La corne : a blow = the mic amplitude stays above the threshold for BLOW_SAMPLES readings.
 * A long blow only counts once. Events: "blow".
 * Mesures (corne, musique + bruits sourds) : bruit ≤ ~150, souffle ≈ 600–750.
 */
export default class Horn extends EventEmitter {
    level = 0;
    threshold = 300;

    private armed = true;
    private calmSince = 0;
    private above = 0;

    constructor(arduino: Arduino) {
        super();
        arduino.on("micro", (amplitude: number) => this.onMicro(amplitude));
    }

    private onMicro(amplitude: number) {
        this.level = amplitude;
        const now = performance.now();

        if (this.armed) {
            this.above = amplitude > this.threshold ? this.above + 1 : 0;
            if (this.above >= BLOW_SAMPLES) {
                this.armed = false;
                this.above = 0;
                this.calmSince = 0;
                this.trigger("blow");
            }
        } else if (amplitude < this.threshold / 2) {
            if (!this.calmSince) this.calmSince = now;
            else if (now - this.calmSince > REARM_MS) this.armed = true;
        } else {
            this.calmSince = 0;
        }
    }
}
