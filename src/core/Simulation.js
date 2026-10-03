/**
 * Advances the game state day by day and dispatches daily/monthly/yearly
 * hooks of all registered systems. Pure logic – no DOM, no timers – so it
 * runs identically in the browser, in Node tests and (later) in a Web Worker.
 */
import { fromDayNumber } from './calendar.js';
import { Rng } from './random.js';
import { DEFAULT_SYSTEMS } from '../systems/index.js';

export class Simulation {
  /**
   * @param {{systems?: object[], bus?: import('./EventBus.js').EventBus|null}} [opts]
   */
  constructor({ systems = DEFAULT_SYSTEMS, bus = null } = {}) {
    this.systems = systems;
    this.bus = bus;
    this.timings = Object.fromEntries(systems.map((s) => [s.id, 0]));
    this.profile = false;
  }

  /** Builds the context object handed to systems. */
  context(state, date = fromDayNumber(state.time.day)) {
    return { rng: new Rng(state.rng), bus: this.bus, date };
  }

  run(system, hook, state, ctx) {
    if (!system[hook]) return;
    if (!this.profile) {
      system[hook](state, ctx);
      return;
    }
    const t0 = performance.now();
    system[hook](state, ctx);
    this.timings[system.id] += performance.now() - t0;
  }

  /** Simulates exactly one day. Returns flags describing which periods started. */
  advanceDay(state) {
    state.time.day += 1;
    const date = fromDayNumber(state.time.day);
    const newMonth = date.day === 1;
    const newYear = newMonth && date.month === 1;
    const ctx = this.context(state, date);
    for (const s of this.systems) this.run(s, 'daily', state, ctx);
    if (newMonth) for (const s of this.systems) this.run(s, 'monthly', state, ctx);
    if (newYear) for (const s of this.systems) this.run(s, 'yearly', state, ctx);
    if (this.bus) {
      this.bus.emit('day', { day: state.time.day, date });
      if (newMonth) this.bus.emit('month', { day: state.time.day, date });
      if (newYear) this.bus.emit('year', { day: state.time.day, date });
    }
    return { newMonth, newYear, date };
  }

  /** Simulates several days (used by tests and fast-forward). */
  advanceDays(state, days) {
    for (let i = 0; i < days; i++) this.advanceDay(state);
  }
}
