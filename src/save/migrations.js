/**
 * Save game migrations.
 *
 * When the state layout changes, bump SCHEMA_VERSION in
 * src/state/createGameState.js and add a function here that upgrades a state
 * from version N to N+1. Migrations run in order on load, so saves from any
 * older version keep working.
 *
 *   export const MIGRATIONS = {
 *     1: (state) => { state.newSystem = { ... }; },   // 1 -> 2
 *   };
 */
import { SCHEMA_VERSION, createGameState } from '../state/createGameState.js';

/**
 * 1 -> 2: regions with owner/controller, regional economy, armed forces, wars.
 * The territorial and military layout cannot be derived from a v1 save, so a
 * fresh v2 state of the same scenario/seed is built and the country
 * development of the save (economy, politics, research, diplomacy, time,
 * news) is carried over. Regional output and population are scaled so that
 * every country keeps its saved GDP and population.
 */
function migrate1to2(old) {
  const fresh = createGameState({ scenarioId: old.meta.scenarioId, playerId: old.playerId, seed: old.meta.seed });
  for (const id of fresh.countryOrder) {
    const o = old.countries?.[id];
    const c = fresh.countries[id];
    if (!o) continue;
    const gdpScale = o.economy.gdp / Math.max(0.01, c.economy.gdp);
    const popScale = o.population / Math.max(1, c.population);
    for (const rid of c.regionIds) {
      const r = fresh.regions[rid];
      r.econ *= gdpScale;
      r.population = Math.round(r.population * popScale);
    }
    c.population = o.population;
    for (const k of Object.keys(c.economy)) if (typeof o.economy[k] === typeof c.economy[k] && k in o.economy) c.economy[k] = o.economy[k];
    Object.assign(c.politics, o.politics);
    Object.assign(c.budget, o.budget);
    c.technology = { ...c.technology, ...o.technology, researched: [...new Set([...c.technology.researched, ...(o.technology?.researched ?? [])])] };
    c.ai = { ...c.ai, ...o.ai };
    c.modifiers = o.modifiers ?? [];
    c.history = o.history ?? c.history;
    c.yearly = o.yearly ?? c.yearly;
    for (const rid of Object.keys(c.resources)) if (o.resources?.[rid]) c.resources[rid] = { ...c.resources[rid], ...o.resources[rid] };
  }
  fresh.time = old.time;
  fresh.rng = old.rng;
  fresh.diplomacy = old.diplomacy ?? fresh.diplomacy;
  fresh.events = old.events ?? fresh.events;
  fresh.news = old.news ?? [];
  fresh.stats = old.stats ?? fresh.stats;
  for (const rid of Object.keys(fresh.market)) if (old.market?.[rid]) fresh.market[rid] = { ...fresh.market[rid], ...old.market[rid] };
  fresh.meta = { ...fresh.meta, ...old.meta, schemaVersion: 1 };
  for (const k of Object.keys(old)) delete old[k];
  Object.assign(old, fresh);
}

export const MIGRATIONS = { 1: migrate1to2 };

export function migrateState(state, migrations = MIGRATIONS, target = SCHEMA_VERSION) {
  let v = state?.meta?.schemaVersion;
  if (!Number.isInteger(v)) throw new Error('Spielstand hat keine gültige Versionsnummer.');
  if (v > target) throw new Error(`Spielstand stammt aus einer neueren Spielversion (Schema ${v} > ${target}).`);
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new Error(`Keine Migration von Schema ${v} auf ${v + 1} vorhanden.`);
    step(state);
    v += 1;
    state.meta.schemaVersion = v;
  }
  return state;
}
