import EventEmitter from "../Utils/EventEmitter";
import type Arduino from "./Arduino";

/** Calm time below half the threshold before a new blow can count. */
const REARM_MS = 150;

/**
 * La corne : a blow = the mic amplitude crosses the threshold.
 * A long blow only counts once. Events: "blow".
 */
export default class Horn extends EventEmitter {
    level = 0;
    threshold = 200;

    private armed = true;
    private calmSince = 0;

    constructor(arduino: Arduino) {
        super();
        arduino.on("micro", (amplitude: number) => this.onMicro(amplitude));
    }

    private onMicro(amplitude: number) {
        this.level = amplitude;
        const now = performance.now();

        if (this.armed) {
            if (amplitude > this.threshold) {
                this.armed = false;
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
