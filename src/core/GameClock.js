/**
 * Real-time -> game-time driver.
 *
 * Converts elapsed wall-clock time into a number of simulated days using a
 * fixed-step accumulator. Rendering is decoupled: the clock only tells the
 * caller how many days to simulate. The per-frame cap prevents a "spiral of
 * death" when the tab was in the background or a month tick was slow.
 */

export const SPEEDS = [
  { id: 0, label: 'Pause', daysPerSecond: 0 },
  { id: 1, label: 'Normal', daysPerSecond: 2 },
  { id: 2, label: 'Schnell', daysPerSecond: 8 },
  { id: 3, label: 'Sehr schnell', daysPerSecond: 30 },
  { id: 4, label: 'Maximal', daysPerSecond: 90, maxDaysPerUpdate: 8 },
];

export class GameClock {
  constructor({ maxDaysPerUpdate = 4, maxFrameMs = 250 } = {}) {
    this.speed = 0;
    this.lastSpeed = 1;
    this.accumulator = 0;
    this.maxDaysPerUpdate = maxDaysPerUpdate;
    this.maxFrameMs = maxFrameMs;
  }

  get paused() {
    return this.speed === 0;
  }

  setSpeed(speed) {
    const s = Math.max(0, Math.min(SPEEDS.length - 1, Math.round(speed)));
    if (s !== 0) this.lastSpeed = s;
    if (s !== this.speed) this.accumulator = 0;
    this.speed = s;
    return s;
  }

  togglePause() {
    return this.setSpeed(this.paused ? this.lastSpeed : 0);
  }

  faster() {
    return this.setSpeed(Math.max(1, this.speed + 1));
  }

  slower() {
    return this.setSpeed(this.speed - 1);
  }

  /**
   * @param {number} elapsedMs wall-clock time since the last update
   * @returns {number} whole days to simulate now
   */
  update(elapsedMs) {
    if (this.paused) return 0;
    const dt = Math.min(Math.max(0, elapsedMs), this.maxFrameMs);
    this.accumulator += (dt / 1000) * SPEEDS[this.speed].daysPerSecond;
    let days = Math.floor(this.accumulator + 1e-9); // tolerate float accumulation error
    const cap = SPEEDS[this.speed].maxDaysPerUpdate ?? this.maxDaysPerUpdate;
    if (days > cap) {
      days = cap;
      this.accumulator = 0; // drop backlog instead of catching up forever
    } else {
      this.accumulator = Math.max(0, this.accumulator - days);
    }
    return days;
  }
}
