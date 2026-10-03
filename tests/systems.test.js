import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, ctxFor } from './helpers.js';
import { marketSystem } from '../src/systems/market.js';
import { tradeSystem } from '../src/systems/trade.js';
import { stepEconomy, taxEfficiency, updateBudget, checkSovereignDefault } from '../src/systems/economy.js';
import { approvalFactors } from '../src/systems/politics.js';
import { getMod, addModifier, expireModifiers } from '../src/systems/modifiers.js';
import { researchPointsPerMonth, technologySystem, canResearch } from '../src/systems/technology.js';
import { Rng, createRngState } from '../src/core/random.js';
import { neighborCountryIds } from '../src/state/worldIndex.js';

const rng = () => new Rng(createRngState('t'));

test('causal chain: oil price shock -> importer inflation, exporter revenue', () => {
  const base = newState();
  const shocked = newState();
  // A large oil supply cut raises the world price.
  for (const id of shocked.countryOrder) addModifier(shocked, shocked.countries[id], { stat: 'output.oil', value: -0.3, months: 12 });
  for (let i = 0; i < 4; i++) {
    for (const s of [base, shocked]) {
      marketSystem.monthly(s);
      tradeSystem.monthly(s);
    }
  }
  assert.ok(shocked.market.oil.price > base.market.oil.price * 1.3, 'oil price rises');
  for (const s of [base, shocked]) {
    for (const id of ['DEU', 'SAU']) stepEconomy(s, s.countries[id], rng());
  }
  // Importer: higher commodity costs -> higher inflation
  assert.ok(shocked.countries.DEU.economy.inflation > base.countries.DEU.economy.inflation, 'importer inflation up');
  // Exporter: resource rents increase state revenue
  assert.ok(shocked.countries.SAU.economy.lastResourceRent > base.countries.SAU.economy.lastResourceRent, 'exporter rents up');
});

test('taxes: higher rate -> more revenue but lower approval target', () => {
  const s = newState();
  const c = s.countries.FRA;
  updateBudget(c, { book: false });
  const rev = c.economy.lastRevenue;
  const appr = approvalFactors(c).reduce((a, f) => a + f.value, 0);
  c.economy.taxRate += 0.05;
  updateBudget(c, { book: false });
  assert.ok(c.economy.lastRevenue > rev);
  assert.ok(approvalFactors(c).reduce((a, f) => a + f.value, 0) < appr);
});

test('tax efficiency: stability and administration matter, extreme rates are punished', () => {
  const s = newState();
  const c = s.countries.ITA;
  const e0 = taxEfficiency(c);
  c.politics.stability -= 30;
  assert.ok(taxEfficiency(c) < e0);
  c.budget.administration += 0.03;
  const e1 = taxEfficiency(c);
  c.economy.taxRate = 0.64;
  assert.ok(taxEfficiency(c) < e1, 'Laffer effect');
});

test('embargo blocks bilateral trade', () => {
  const s = newState();
  tradeSystem.monthly(s);
  const partnerBefore = s.countries.DEU.trade.partners.find((p) => p.id === 'RUS');
  assert.ok(partnerBefore, 'Russia is a German trade partner at start');
  s.diplomacy.relations['DEU|RUS'] = { base: -10, opinion: -40, treaties: {}, embargoes: ['DEU'], lastImprove: {} };
  tradeSystem.monthly(s);
  assert.equal(s.countries.DEU.trade.partners.find((p) => p.id === 'RUS'), undefined);
});

test('modifiers: summing, expiry and technology effects', () => {
  const s = newState();
  const c = s.countries.KEN;
  const before = getMod(c, 'growth');
  addModifier(s, c, { stat: 'growth', value: 0.01, months: 2 });
  assert.ok(Math.abs(getMod(c, 'growth') - before - 0.01) < 1e-12);
  expireModifiers(c, s.time.day + 90);
  assert.ok(Math.abs(getMod(c, 'growth') - before) < 1e-12);
  assert.throws(() => addModifier(s, c, { stat: 'nonsense', value: 1 }));
  // researched technologies contribute
  const de = s.countries.DEU;
  assert.ok(getMod(de, 'taxEfficiency') > 0, 'eGovernment effect present');
});

test('research completes technologies and applies effects', () => {
  const s = newState();
  const c = s.countries.USA;
  const tech = 'platformEconomy';
  assert.ok(canResearch(c, tech));
  c.technology.current = tech;
  const growthBefore = getMod(c, 'growth');
  assert.ok(researchPointsPerMonth(c) > 10);
  for (let i = 0; i < 200 && c.technology.current; i++) technologySystem.monthly(s);
  assert.ok(c.technology.researched.includes(tech));
  assert.ok(getMod(c, 'growth') > growthBefore);
  assert.ok(s.news.some((n) => n.text.includes('Plattformökonomie')));
});

test('sovereign default triggers once for unsustainable debt', () => {
  const s = newState();
  const c = s.countries.ARG;
  c.economy.debt = c.economy.gdp * 5;
  c.economy.interestRate = 0.3;
  c.economy.inflation = 0.02;
  updateBudget(c, { book: false });
  assert.equal(checkSovereignDefault(s, c), true);
  assert.ok(c.economy.debt < c.economy.gdp * 2.5);
  c.economy.debt = c.economy.gdp * 5;
  assert.equal(checkSovereignDefault(s, c), false, 'no second default while penalties are active');
});

test('world index: neighbours follow region ownership', () => {
  const s = newState();
  const n = neighborCountryIds(s, 'DEU');
  assert.ok(n.includes('FRA') && n.includes('POL') && n.includes('AUT'));
  assert.ok(!n.includes('ESP'));
  assert.ok(neighborCountryIds(s, 'FRA').includes('BRA'), 'French Guiana borders Brazil');
  assert.ok(ctxFor(s).rng);
});
