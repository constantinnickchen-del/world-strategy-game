/**
 * Small read-only war queries without further imports (safe to use from
 * content definitions such as data/events.js without import cycles).
 */
import { hasTreaty } from '../diplomacy.js';

export function warById(state, warId) {
  return (state.wars ?? []).find((w) => w.id === warId && w.status === 'active') ?? null;
}

/** Error string if the country may not join the given side, else null. */
export function canJoinWarSide(state, countryId, war, side) {
  if (!war) return 'Der Krieg ist bereits beendet.';
  if (war.attackers.includes(countryId) || war.defenders.includes(countryId)) return 'Bereits Kriegspartei.';
  const enemies = side === 'defenders' ? war.attackers : war.defenders;
  for (const e of enemies) {
    if (hasTreaty(state, countryId, e, 'alliance')) return `Bündnis mit ${state.countries[e].name} besteht.`;
    if (hasTreaty(state, countryId, e, 'nonAggression')) return `Nichtangriffspakt mit ${state.countries[e].name} besteht.`;
  }
  return null;
}
