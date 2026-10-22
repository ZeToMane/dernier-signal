import EventEmitter from "../Utils/EventEmitter";
import type Arduino from "./Arduino";

const SMOOTHING = 0.2;

/**
 * L'étoile : room light from the photoresistor.
 * `value` is smoothed and mapped to 0–1 between the `min` / `max` calibration.
 * Events: "change" (value).
 */
export default class Star extends EventEmitter {
    raw = 0;
    min = 0;
    max = 1023;
    value = 0;

    private smoothed = -1;

    constructor(arduino: Arduino) {
        super();
        arduino.on("light", (raw: number) => this.onLight(raw));
    }

    /** Current reading becomes the dark (0) or bright (1) reference. */
    calibrate(edge: "min" | "max") {
        this[edge] = this.smoothed < 0 ? this.raw : this.smoothed;
    }

    private onLight(raw: number) {
        this.raw = raw;
        this.smoothed = this.smoothed < 0 ? raw : this.smoothed + (raw - this.smoothed) * SMOOTHING;

        const range = this.max - this.min || 1;
        this.value = Math.min(1, Math.max(0, (this.smoothed - this.min) / range));
        this.trigger("change", [this.value]);
    }
}
