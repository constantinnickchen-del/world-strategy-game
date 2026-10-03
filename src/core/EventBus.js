/**
 * Minimal synchronous publish/subscribe bus.
 *
 * The simulation never touches the DOM; it only emits events. UI, audio,
 * autosave etc. subscribe. Listener errors are isolated so one broken
 * subscriber cannot stop the simulation.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /** @returns {() => void} unsubscribe function */
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${type}" failed`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}
