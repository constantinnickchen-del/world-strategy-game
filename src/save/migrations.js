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
import { SCHEMA_VERSION } from '../state/createGameState.js';

export const MIGRATIONS = {};

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
