export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Converts an annual rate into the equivalent monthly compound factor. */
export function monthlyFactor(annualRate) {
  return Math.pow(1 + Math.max(-0.99, annualRate), 1 / 12);
}

export function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
