/**
 * Deterministic, serialisable PRNG (sfc32).
 *
 * The generator state lives inside the game state (`state.rng`), so a saved game
 * continues with exactly the same random sequence after loading. Simulation code
 * must never use Math.random().
 */

export function hashString(str) {
  // FNV-1a 32 bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRngState(seed) {
  const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const state = { a: 0x9e3779b9, b: 0x243f6a88, c: 0xb7e15162, d: s ^ 0xdeadbeef };
  const rng = new Rng(state);
  for (let i = 0; i < 15; i++) rng.next(); // warm up
  return state;
}

export class Rng {
  /** @param {{a:number,b:number,c:number,d:number}} state – mutated in place */
  constructor(state) {
    this.s = state;
  }

  /** Uniform float in [0, 1). */
  next() {
    const s = this.s;
    s.a >>>= 0;
    s.b >>>= 0;
    s.c >>>= 0;
    s.d >>>= 0;
    const t = (((s.a + s.b) | 0) + s.d) | 0;
    s.d = (s.d + 1) | 0;
    s.a = s.b ^ (s.b >>> 9);
    s.b = (s.c + (s.c << 3)) | 0;
    s.c = (s.c << 21) | (s.c >>> 11);
    s.c = (s.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, maxInclusive) {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  /** Approximately normal distributed value (Irwin–Hall, 4 samples). */
  gaussian(mean = 0, sd = 1) {
    const sum = this.next() + this.next() + this.next() + this.next();
    return mean + (sum - 2) * sd * Math.sqrt(3);
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick by weight; items with weight <= 0 are never chosen. Returns undefined when all weights are 0. */
  weighted(items, weightFn) {
    let total = 0;
    const weights = items.map((it) => {
      const w = Math.max(0, weightFn(it));
      total += w;
      return w;
    });
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }
}
