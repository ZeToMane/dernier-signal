/**
 * Minimal typed event emitter.
 *
 *   interface Events { score: number }
 *   class Thing extends Emitter<Events> { run() { this.emit('score', 10); } }
 *   const off = thing.on('score', n => console.log(n));   // off() to unsubscribe
 *
 * A listener that throws is logged and skipped, so one broken listener
 * (say, a UI component) can never stop the game loop.
 */

type Handler<T> = (payload: T) => void;

export class Emitter<Events extends { [K in keyof Events]: unknown }> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const set = (this.handlers[event] ??= new Set<Handler<Events[K]>>());
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers[event];
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`Emitter: a "${String(event)}" listener threw`, err);
      }
    }
  }
}
