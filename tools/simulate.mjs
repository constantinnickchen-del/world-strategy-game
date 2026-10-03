#!/usr/bin/env node
/**
 * Headless balance/performance report.
 *
 *   node tools/simulate.mjs [years=20] [playerId=DEU] [seed=1]
 *
 * Runs the full simulation without UI and prints key indicators for major
 * countries, commodity prices and per-system timings. Use it after changing
 * formulas to spot runaway values early.
 */
import { createGameState } from '../src/state/createGameState.js';
import { Simulation } from '../src/core/Simulation.js';
import { fromDayNumber } from '../src/core/calendar.js';
import { debtRatio } from '../src/state/selectors.js';

const years = Number(process.argv[2] ?? 20);
const playerId = process.argv[3] ?? 'DEU';
const seed = process.argv[4] ?? '1';
const WATCH = process.env.WATCH ? process.env.WATCH.split(',') : ['USA', 'CHN', 'DEU', 'JPN', 'IND', 'RUS', 'BRA', 'SAU', 'NGA', 'ARG', 'VEN', 'TUR'];

const state = createGameState({ playerId, seed });
const sim = new Simulation();
sim.profile = true;
// Auto-resolve player events like the AI would so the run is unattended.
const t0 = performance.now();
let lastYear = fromDayNumber(state.time.day).year;

function row(c) {
  const e = c.economy;
  return [
    c.id,
    `GDP ${e.gdp.toFixed(0).padStart(6)}`,
    `g ${(e.growth * 100).toFixed(1).padStart(5)}%`,
    `inf ${(e.inflation * 100).toFixed(1).padStart(5)}%`,
    `u ${(e.unemployment * 100).toFixed(1).padStart(4)}%`,
    `debt ${(debtRatio(c) * 100).toFixed(0).padStart(4)}%`,
    `tax ${(e.taxRate * 100).toFixed(1)}%`,
    `bal ${((e.lastBalance * 12) / e.gdp * 100).toFixed(1).padStart(5)}%`,
    `appr ${c.politics.approval.toFixed(0).padStart(3)}`,
    `stab ${c.politics.stability.toFixed(0).padStart(3)}`,
    `pop ${(c.population / 1e6).toFixed(1).padStart(7)}M`,
    `tech ${c.technology.researched.length}`,
  ].join('  ');
}

function report() {
  const { year } = fromDayNumber(state.time.day);
  console.log(`\n=== ${year} ===`);
  for (const id of WATCH) if (state.countries[id]) console.log(row(state.countries[id]));
  console.log(
    'Prices:',
    Object.entries(state.market)
      .map(([k, m]) => `${k} ${(m.price / m.basePrice).toFixed(2)}`)
      .join('  '),
  );
}

report();
const { resolveInstance } = await import('../src/systems/events.js');
while (fromDayNumber(state.time.day).year < lastYear + years) {
  sim.advanceDay(state);
  for (const p of [...state.events.pending]) resolveInstance(state, p, 0, sim.context(state));
  const { year, month, day } = fromDayNumber(state.time.day);
  if (month === 1 && day === 1 && (year - lastYear) % 5 === 0) report();
}
const elapsed = performance.now() - t0;

// Sanity: any non-finite numbers?
let bad = 0;
JSON.stringify(state, (k, v) => {
  if (typeof v === 'number' && !Number.isFinite(v)) bad++;
  return v;
});
console.log(`\nSimulated ${years} years in ${(elapsed / 1000).toFixed(2)} s (${(elapsed / (years * 12)).toFixed(1)} ms/month). Non-finite values: ${bad}`);
console.log('System timings (ms):', Object.fromEntries(Object.entries(sim.timings).map(([k, v]) => [k, Math.round(v)])));
console.log('Save size (JSON):', (JSON.stringify(state).length / 1024).toFixed(0), 'KB');
const treaties = Object.values(state.diplomacy.relations).reduce((n, r) => n + Object.keys(r.treaties).length, 0);
console.log('Stored relations:', Object.keys(state.diplomacy.relations).length, 'treaties:', treaties, 'news:', state.news.length);
