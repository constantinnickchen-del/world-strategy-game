import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, simulateDays } from './helpers.js';
import { Simulation } from '../src/core/Simulation.js';
import { createGameState } from '../src/state/createGameState.js';
import { STATIC_REGIONS } from '../src/state/worldIndex.js';
import { RESOURCE_IDS } from '../src/data/resources.js';
import { fromDayNumber } from '../src/core/calendar.js';
import { resolveInstance } from '../src/systems/events.js';
import { debtRatio } from '../src/state/selectors.js';

test('new game state is consistent', () => {
  const s = newState();
  assert.ok(s.countryOrder.length > 180, 'large world');
  assert.equal(s.playerId, 'DEU');
  for (const [rid, r] of Object.entries(s.regions)) {
    assert.ok(s.countries[r.owner], `region ${rid} has a valid owner`);
    assert.ok(s.countries[r.owner].regionIds.includes(rid));
    assert.ok(STATIC_REGIONS[rid]);
  }
  for (const id of s.countryOrder) {
    const c = s.countries[id];
    const pop = c.regionIds.reduce((sum, rid) => sum + s.regions[rid].population, 0);
    assert.equal(c.population, pop, `${id} population = sum of regions`);
    assert.ok(c.economy.gdp > 0);
    assert.ok(c.politics.stability >= 0 && c.politics.stability <= 100);
  }
  // starts in market equilibrium
  for (const rid of RESOURCE_IDS) {
    const m = s.market[rid];
    assert.ok(Math.abs(m.demand / m.supply - 1) < 1e-6, `${rid} balanced`);
  }
  assert.doesNotThrow(() => JSON.stringify(s));
});

test('unknown player country is rejected', () => {
  assert.throws(() => createGameState({ playerId: 'XXX', seed: 1 }));
});

test('simulation is deterministic for the same seed', () => {
  const a = simulateDays(newState({ seed: 'det' }), 400);
  const b = simulateDays(newState({ seed: 'det' }), 400);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = simulateDays(newState({ seed: 'other' }), 400);
  assert.notEqual(JSON.stringify(a.countries.USA.economy), JSON.stringify(c.countries.USA.economy));
});

test('monthly and yearly hooks fire on calendar boundaries', () => {
  const calls = { daily: 0, monthly: 0, yearly: 0 };
  const probe = {
    id: 'probe',
    daily: () => calls.daily++,
    monthly: () => calls.monthly++,
    yearly: () => calls.yearly++,
  };
  const s = newState();
  const sim = new Simulation({ systems: [probe] });
  const start = fromDayNumber(s.time.day);
  assert.deepEqual(start, { year: 2020, month: 1, day: 1 });
  sim.advanceDays(s, 366 + 365); // 2020 is a leap year
  assert.equal(calls.daily, 731);
  assert.equal(calls.monthly, 24);
  assert.equal(calls.yearly, 2);
  assert.deepEqual(fromDayNumber(s.time.day), { year: 2022, month: 1, day: 1 });
});

test('long run stays numerically sane (15 years)', () => {
  const s = newState({ seed: 'long' });
  const sim = new Simulation();
  for (let d = 0; d < 365 * 15; d++) {
    sim.advanceDay(s);
    for (const p of [...s.events.pending]) resolveInstance(s, p, 0, sim.context(s));
  }
  let bad = 0;
  JSON.stringify(s, (k, v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad++;
    return v;
  });
  assert.equal(bad, 0, 'no NaN/Infinity in state');
  for (const id of ['USA', 'CHN', 'DEU', 'IND', 'BRA', 'NGA']) {
    const c = s.countries[id];
    assert.ok(c.economy.growth > -0.2 && c.economy.growth < 0.2, `${id} growth bounded`);
    assert.ok(c.economy.inflation > -0.05 && c.economy.inflation < 0.5, `${id} inflation plausible (${c.economy.inflation})`);
    assert.ok(debtRatio(c) < 3, `${id} debt below 300 %`);
    assert.ok(c.economy.gdp > c.economy.gdpRef * 0.7, `${id} economy did not collapse`);
  }
  for (const rid of RESOURCE_IDS) {
    const m = s.market[rid];
    assert.ok(m.price > m.basePrice * 0.3 && m.price < m.basePrice * 4, `${rid} price bounded`);
  }
  assert.ok(s.countries.USA.technology.researched.length > 15, 'research progresses');
  assert.ok(s.news.length > 0);
});
