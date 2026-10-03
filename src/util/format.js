/** Number formatting helpers (German locale conventions). */

const nf = (digits) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const NF0 = nf(0);
const NF1 = nf(1);
const NF2 = nf(2);

export function formatBn(bn) {
  const a = Math.abs(bn);
  const sign = bn < 0 ? '−' : '';
  if (a >= 1000) return `${sign}${NF2.format(a / 1000)} Bio. $`;
  if (a >= 1) return `${sign}${NF1.format(a)} Mrd. $`;
  return `${sign}${NF0.format(a * 1000)} Mio. $`;
}

export function formatPopulation(n) {
  if (n >= 1e9) return `${NF2.format(n / 1e9)} Mrd.`;
  if (n >= 1e6) return `${NF1.format(n / 1e6)} Mio.`;
  if (n >= 1e3) return `${NF0.format(n / 1e3)} Tsd.`;
  return NF0.format(n);
}

export function formatPct(v, digits = 1) {
  return `${(digits === 0 ? NF0 : digits === 2 ? NF2 : NF1).format(v * 100)} %`;
}

export function formatSignedPct(v, digits = 1) {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatPct(Math.abs(v), digits)}`;
}

export function formatNumber(v, digits = 0) {
  return (digits === 0 ? NF0 : digits === 1 ? NF1 : NF2).format(v);
}

export function formatUsd(v) {
  return `${NF0.format(v)} $`;
}

/** Escape text for safe insertion into HTML templates. */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

/** Emoji flag from an ISO 3166-1 alpha-2 code (falls back to the code). */
export function flagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return '🏳';
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
