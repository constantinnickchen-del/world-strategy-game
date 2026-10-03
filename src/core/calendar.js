/**
 * Pure Gregorian calendar math.
 *
 * The game stores time as a single integer "day number" (days since 0001-01-01,
 * proleptic Gregorian). This avoids JS Date timezone/DST pitfalls, serialises
 * trivially and makes "N days later" a simple addition.
 */

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
export const MONTH_SHORT_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/** Days from 0001-01-01 to the start of `year`. */
function daysBeforeYear(year) {
  const y = year - 1;
  return y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
}

/** Convert a calendar date (month and day are 1-based) to a day number. */
export function toDayNumber(year, month, day) {
  if (month < 1 || month > 12) throw new RangeError(`Invalid month ${month}`);
  if (day < 1 || day > daysInMonth(year, month)) throw new RangeError(`Invalid day ${year}-${month}-${day}`);
  let n = daysBeforeYear(year);
  for (let m = 1; m < month; m++) n += daysInMonth(year, m);
  return n + day - 1;
}

/** Convert a day number back to {year, month, day}. */
export function fromDayNumber(n) {
  // Estimate the year, then correct.
  let year = Math.floor(n / 365.2425) + 1;
  while (daysBeforeYear(year) > n) year--;
  while (daysBeforeYear(year + 1) <= n) year++;
  let rest = n - daysBeforeYear(year);
  let month = 1;
  while (rest >= daysInMonth(year, month)) {
    rest -= daysInMonth(year, month);
    month++;
  }
  return { year, month, day: rest + 1 };
}

export function parseISODate(str) {
  const m = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) throw new Error(`Invalid ISO date "${str}"`);
  return toDayNumber(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function formatISODate(n) {
  const { year, month, day } = fromDayNumber(n);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatDateDE(n, { long = true } = {}) {
  const { year, month, day } = fromDayNumber(n);
  return long ? `${day}. ${MONTH_NAMES_DE[month - 1]} ${year}` : `${day}. ${MONTH_SHORT_DE[month - 1]} ${year}`;
}

/** Add whole calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(n, months) {
  const { year, month, day } = fromDayNumber(n);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return toDayNumber(y, m, Math.min(day, daysInMonth(y, m)));
}

export function addYears(n, years) {
  return addMonths(n, years * 12);
}

/** Number of whole months between two day numbers (b - a), ignoring days. */
export function monthsBetween(a, b) {
  const da = fromDayNumber(a);
  const db = fromDayNumber(b);
  return (db.year - da.year) * 12 + (db.month - da.month);
}
