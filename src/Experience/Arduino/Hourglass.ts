import EventEmitter from "../Utils/EventEmitter";
import type Arduino from "./Arduino";

/**
 * Le sablier : flipping it fires a kick (debounced on the board).
 * Events: "kick".
 */
export default class Hourglass extends EventEmitter {
    count = 0;

    constructor(arduino: Arduino) {
        super();
        arduino.on("kick", () => {
            this.count++;
            this.trigger("kick");
        });
    }
}
