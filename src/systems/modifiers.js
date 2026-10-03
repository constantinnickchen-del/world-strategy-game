/**
 * Generic modifier system.
 *
 * Technologies, events, policies and (later) laws, buildings or traits all
 * influence the simulation through modifiers instead of special-case code.
 * A modifier is plain data stored on the country: { stat, value, until, label, source }.
 * Systems ask `getMod(country, stat)` and interpret the summed value.
 *
 * Technology effects are NOT stored as modifiers: they are derived from
 * `country.technology.researched` (cached), so saves stay small and balance
 * changes to technologies apply to existing saves.
 */
import { TECH_BY_ID } from '../data/technologies.js';

export const STATS = {
  growth: { label: 'Wirtschaftswachstum', format: 'pctPoints' },
  inflation: { label: 'Inflation', format: 'pctPoints', invert: true },
  unemployment: { label: 'Arbeitslosigkeit', format: 'pctPoints', invert: true },
  taxEfficiency: { label: 'Steuereffizienz', format: 'pctPoints' },
  interestRate: { label: 'Zinssatz auf Staatsschulden', format: 'pctPoints', invert: true },
  approval: { label: 'Zustimmung', format: 'points' },
  stability: { label: 'Stabilität', format: 'points' },
  researchSpeed: { label: 'Forschungsgeschwindigkeit', format: 'pct' },
  militaryPower: { label: 'Militärstärke', format: 'pct' },
  infrastructureGain: { label: 'Infrastrukturausbau', format: 'pct' },
  popGrowth: { label: 'Bevölkerungswachstum', format: 'pctPoints' },
  tradeGain: { label: 'Handelsgewinne', format: 'pct' },
  'output.oil': { label: 'Ölförderung', format: 'pct' },
  'output.gas': { label: 'Gasförderung', format: 'pct' },
  'output.coal': { label: 'Kohleförderung', format: 'pct' },
  'output.metals': { label: 'Erzförderung', format: 'pct' },
  'output.rareEarths': { label: 'Förderung kritischer Mineralien', format: 'pct' },
  'output.food': { label: 'Agrarproduktion', format: 'pct' },
  'demand.oil': { label: 'Ölbedarf', format: 'pct', invert: true },
  'demand.gas': { label: 'Gasbedarf', format: 'pct', invert: true },
  'demand.coal': { label: 'Kohlebedarf', format: 'pct', invert: true },
  'demand.metals': { label: 'Metallbedarf', format: 'pct', invert: true },
  'demand.rareEarths': { label: 'Bedarf an kritischen Mineralien', format: 'pct', invert: true },
  'demand.food': { label: 'Nahrungsbedarf', format: 'pct', invert: true },
};

const techCache = new WeakMap();

/** Summed technology effects of a country: { stat: value }. */
export function techModifiers(country) {
  const researched = country.technology.researched;
  let entry = techCache.get(country);
  if (!entry || entry.count !== researched.length) {
    const totals = {};
    for (const id of researched) {
      for (const eff of TECH_BY_ID[id]?.effects ?? []) totals[eff.stat] = (totals[eff.stat] ?? 0) + eff.value;
    }
    entry = { count: researched.length, totals };
    techCache.set(country, entry);
  }
  return entry.totals;
}

export function getMod(country, stat) {
  let sum = techModifiers(country)[stat] ?? 0;
  for (const m of country.modifiers) if (m.stat === stat) sum += m.value;
  return sum;
}

/**
 * @param {object} state
 * @param {object} country
 * @param {{stat:string,value:number,months?:number|null,label?:string,source?:string}} mod
 */
export function addModifier(state, country, { stat, value, months = null, label = '', source = '' }) {
  if (!(stat in STATS)) throw new Error(`Unknown modifier stat "${stat}"`);
  const until = months ? state.time.day + Math.round(months * 30.44) : null;
  const m = { stat, value, until, label, source };
  country.modifiers.push(m);
  return m;
}

export function removeModifiersBySource(country, source) {
  country.modifiers = country.modifiers.filter((m) => m.source !== source);
}

export function expireModifiers(country, day) {
  if (!country.modifiers.length) return;
  country.modifiers = country.modifiers.filter((m) => m.until === null || m.until > day);
}

export function formatModValue(stat, value) {
  const fmt = STATS[stat]?.format ?? 'points';
  const sign = value > 0 ? '+' : '';
  if (fmt === 'pctPoints') return `${sign}${(value * 100).toFixed(1)} %-Pkt.`;
  if (fmt === 'pct') return `${sign}${Math.round(value * 100)} %`;
  return `${sign}${Math.round(value * 10) / 10}`;
}

/** Whether a modifier value is good for the country (for colouring in the UI). */
export function isPositiveMod(stat, value) {
  return STATS[stat]?.invert ? value < 0 : value > 0;
}
