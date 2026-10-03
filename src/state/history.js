/**
 * Compact time series stored inside the game state (and thus in saves).
 * Values are rounded to 4 significant digits to keep save files small.
 */
export const MONTHLY_HISTORY_LENGTH = 60;

export function round4(v) {
  if (!Number.isFinite(v) || v === 0) return 0;
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const f = 10 ** (3 - mag);
  return Math.round(v * f) / f;
}

export function pushSeries(series, value, maxLength = MONTHLY_HISTORY_LENGTH) {
  series.push(round4(value));
  if (series.length > maxLength) series.splice(0, series.length - maxLength);
}
