export default class EventEmitter {
    private callbacks: Record<string, Array<(...args: any[]) => void>> = {};

    on(event: string, callback: (...args: any[]) => void) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
        return this;
    }

    trigger(event: string, args: any[] = []) {
        if (!this.callbacks[event]) return;
        this.callbacks[event].forEach((cb) => cb(...args));
    }
}
