import EventEmitter from "../Utils/EventEmitter";
import Horn from "./Horn";
import Star from "./Star";
import Hourglass from "./Hourglass";

const BAUD_RATE = 115200;

/**
 * Web Serial bridge to the board (see arduino/dernier-signal/dernier-signal.ino).
 * Events: "connected", "disconnected", "micro" (amplitude), "light" (raw), "kick".
 */
export default class Arduino extends EventEmitter {
    horn: Horn;
    star: Star;
    hourglass: Hourglass;

    connected = false;
    private port: SerialPort | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

    constructor() {
        super();
        this.horn = new Horn(this);
        this.star = new Star(this);
        this.hourglass = new Hourglass(this);
    }

    static get supported() {
        return "serial" in navigator;
    }

    /** Reopens a port the user already granted, without any prompt. */
    async reconnect() {
        if (!navigator.serial) return false;
        const [port] = await navigator.serial.getPorts();
        if (!port) return false;
        await this.open(port);
        return true;
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
        this.port = port;
        this.writer = port.writable!.getWriter();
        this.connected = true;
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
    }
}
