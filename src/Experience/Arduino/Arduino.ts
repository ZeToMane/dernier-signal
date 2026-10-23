import EventEmitter from "../Utils/EventEmitter";
import Horn from "./Horn";
import Star from "./Star";
import Hourglass from "./Hourglass";

const BAUD_RATE = 115200;
/** After a reload the previous page may still hold the port for a moment: retry. */
const RECONNECT_TRIES = 10;
const RECONNECT_DELAY_MS = 400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Web Serial bridge to the board (see arduino/dernier-signal/dernier-signal.ino).
 * Events: "connected", "disconnected", "micro" (amplitude), "light" (raw), "tilt" (contact), "kick".
 */
export default class Arduino extends EventEmitter {
    horn: Horn;
    star: Star;
    hourglass: Hourglass;

    connected = false;
    private port: SerialPort | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private reconnecting: Promise<boolean> | null = null;

    constructor() {
        super();
        this.horn = new Horn(this);
        this.star = new Star(this);
        this.hourglass = new Hourglass(this);

        // Release the port when leaving / reloading, so the next page can open it right away.
        window.addEventListener("pagehide", () => void this.disconnect());
        // Board (already granted) plugged back in: reopen it.
        navigator.serial?.addEventListener("connect", () => void this.reconnect());
    }

    static get supported() {
        return "serial" in navigator;
    }

    /**
     * Reopens a port the user already granted, without any prompt.
     * Retries for a few seconds: the port can still be held by the page being reloaded.
     */
    reconnect() {
        this.reconnecting ??= this.tryReconnect().finally(() => {
            this.reconnecting = null;
        });
        return this.reconnecting;
    }

    private async tryReconnect() {
        if (!navigator.serial) return false;
        for (let attempt = 0; attempt < RECONNECT_TRIES; attempt++) {
            if (this.connected) return true;
            const [port] = await navigator.serial.getPorts();
            if (port) {
                try {
                    await this.open(port);
                    return true;
                } catch {
                    // Still busy: try again below.
                }
            }
            await wait(RECONNECT_DELAY_MS);
        }
        return false;
    }

    /** Must be called from a user gesture (click). */
    async connect() {
        if (!navigator.serial) throw new Error("Web Serial non supporté (Chrome / Edge requis)");
        await this.open(await navigator.serial.requestPort());
    }

    async disconnect() {
        await this.reader?.cancel();
    }

    /** Single-char command, e.g. "V" to blink the board LED. */
    send(command: string) {
        this.writer?.write(new TextEncoder().encode(command));
    }

    private async open(port: SerialPort) {
        await port.open({ baudRate: BAUD_RATE });
        // The board only talks while DTR is set (see the sketch); make sure it is.
        await port.setSignals({ dataTerminalReady: true }).catch(() => {});
        this.port = port;
        this.writer = port.writable!.getWriter();
        this.connected = true;
        // The UNO R4 doesn't reboot on open: ask it to reset its state.
        this.send("R");
        this.trigger("connected");
        this.read();
    }

    private async read() {
        const decoder = new TextDecoder();
        let buffer = "";
        this.reader = this.port!.readable!.getReader();

        try {
            while (true) {
                const { value, done } = await this.reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop()!;
                for (const line of lines) this.parse(line.trim());
            }
        } catch {
            // Board unplugged: fall through to cleanup.
        }

        this.reader.releaseLock();
        this.writer?.releaseLock();
        await this.port?.close().catch(() => {});
        this.reader = null;
        this.writer = null;
        this.port = null;
        this.connected = false;
        this.trigger("disconnected");
    }

    private parse(line: string) {
        if (line === "K") return this.trigger("kick");

        const [key, raw] = line.split(":");
        const value = Number(raw);
        if (Number.isNaN(value)) return;

        if (key === "M") this.trigger("micro", [value]);
        else if (key === "L") this.trigger("light", [value]);
        else if (key === "T") this.trigger("tilt", [value === 1]);
    }
}
