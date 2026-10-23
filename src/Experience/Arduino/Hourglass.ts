import EventEmitter from "../Utils/EventEmitter";
import type Arduino from "./Arduino";

/**
 * Le sablier : each flip (either way) fires a kick.
 * Events: "kick", "change" (contact).
 */
export default class Hourglass extends EventEmitter {
    count = 0;
    /** Raw tilt state: true = contact, false = open. */
    contact = false;

    constructor(arduino: Arduino) {
        super();
        arduino.on("kick", () => {
            this.count++;
            this.trigger("kick");
        });
        arduino.on("tilt", (contact: boolean) => {
            if (contact === this.contact) return;
            this.contact = contact;
            this.trigger("change", [contact]);
        });
    }
}
