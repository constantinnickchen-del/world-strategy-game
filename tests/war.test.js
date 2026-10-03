/**
 * War, military and territory scenarios (Masterprompt 3, tests 1–12) plus the
 * automatic crisis pause. Everything runs through the real commands,
 * systems and the GameSession – no mocked values.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, ctxFor, simulateDays } from './helpers.js';
import { executeCommand } from '../src/commands/commands.js';
import { Simulation } from '../src/core/Simulation.js';
import { GameSession } from '../src/core/GameSession.js';
import { EventBus } from '../src/core/EventBus.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';
import { activeWars, warsOf, sideOf, isAtWar } from '../src/systems/war/wars.js';
import { warSystem } from '../src/systems/war/index.js';
import { setController, computeGdp } from '../src/state/territory.js';
import { aircraftCount, shipCount, landPower } from '../src/systems/military/power.js';
import { procurementOffers } from '../src/systems/military/procurement.js';
import { STATIC_REGIONS } from '../src/state/worldIndex.js';
import { newUnit } from '../src/state/militarySetup.js';
import { hasEmbargo } from '../src/systems/diplomacy.js';
import { warOutlook } from '../src/systems/war/outlook.js';

const goal = (regionId) => ({ type: 'region', regionId });

function run(state, cmd) {
  return executeCommand(state, cmd, ctxFor(state));
}

function finite(state) {
  let bad = 0;
  JSON.stringify(state, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? bad++ : v));
  return bad === 0;
}

/** A session with a fresh game whose clock can be driven by update(). */
function sessionFor(playerId, seed, settings = {}) {
  // ordinary events (treaty offers …) do not hold the clock here; crises do
  const session = new GameSession({ bus: new EventBus(), settings: { ...DEFAULT_SETTINGS, pauseOnEvents: false, pauseOn: { ...DEFAULT_SETTINGS.pauseOn }, ...settings } });
  session.replaceState(newState({ playerId, seed }));
  return session;
}

/** Runs the session clock (like the browser loop) until `done()` or the clock stops. */
function drive(session, done, maxFrames = 4000) {
  for (let i = 0; i < maxFrames && !done(); i++) {
    session.update(250);
    if (session.clock.speed === 0) break;
  }
}

/** Executes a command for an AI country inside a simulated day (as the AI does). */
function onDay(session, day, fn) {
  let fired = false;
  session.bus.on('day', () => {
    if (fired || session.state.time.day < day) return;
    fired = true;
    fn(session.sim.context(session.state));
  });
}

// ---------------------------------------------------------------- 1

test('1: the player declares war – war goals, alliances, consequences and an immediate pause', () => {
  const session = sessionFor('RUS', 'w1');
  const s = session.state;
  const stab = s.countries.RUS.politics.stability;
  session.setSpeed(2);
  const res = session.execute({ type: 'declareWar', targetId: 'UKR', goals: [goal('UA-14'), goal('UA-63')] });
  assert.equal(res.ok, true, res.error);
  const war = activeWars(s)[0];
  assert.deepEqual([war.attackers[0], war.defenders[0]], ['RUS', 'UKR']);
  assert.equal(war.goals.length, 2);
  assert.equal(session.clock.speed, 0, 'clock stopped');
  assert.equal(session.lastInterrupt.kind, 'playerDeclared');
  assert.ok(s.countries.RUS.politics.stability < stab, 'war costs stability');
  assert.equal(s.countries.UKR.military.mobilization, 2, 'defender mobilises');
  assert.ok(s.news.some((n) => n.text.startsWith('KRIEG: Russland')));
  // invalid declarations are refused
  assert.match(session.validate({ type: 'declareWar', targetId: 'UKR', goals: [goal('UA-14')] }), /bereits im Krieg/);
  assert.match(session.validate({ type: 'declareWar', targetId: 'BLR', goals: [] }), /Bündnis|Kriegsziel/);
});

// ---------------------------------------------------------------- 2

test('2: an AI country attacks the player – pause, decision event, general staff defends', () => {
  const session = sessionFor('UKR', 'w2');
  const s = session.state;
  onDay(session, s.time.day + 5, (ctx) => executeCommand(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }, ctx));
  session.setSpeed(3);
  drive(session, () => isAtWar(s, 'UKR'));
  const war = activeWars(s)[0];
  assert.ok(war, 'war started');
  assert.equal(session.clock.speed, 0);
  assert.equal(session.lastInterrupt.kind, 'attackOnPlayer');
  assert.equal(s.time.day, war.startDay, 'paused on the day of the attack');
  const inst = s.events.pending.find((e) => e.eventId === 'warAttackOnPlayer');
  assert.ok(inst, 'the player must decide');
  assert.equal(session.execute({ type: 'resolveEvent', uid: inst.uid, option: 0 }).ok, true);
  assert.equal(s.countries.UKR.military.mobilization, 2, 'general mobilisation ordered');
  assert.equal(session.clock.speed, 3, 'game resumes at the previous speed after the decision');
});

// ---------------------------------------------------------------- 3

test('3: AI vs AI war – the player is informed and can react (sanctions, neutrality, intervention)', () => {
  const session = sessionFor('DEU', 'w3');
  const s = session.state;
  onDay(session, s.time.day + 3, (ctx) => executeCommand(s, { type: 'declareWar', countryId: 'PAK', targetId: 'IND', goals: [goal('IN-JK')] }, ctx));
  session.setSpeed(1);
  drive(session, () => activeWars(s).length > 0);
  assert.equal(session.lastInterrupt.kind, 'warDeclared');
  const inst = s.events.pending.find((e) => e.eventId === 'warCrisis');
  assert.ok(inst);
  assert.equal(inst.options.length, 5);
  // sanctions against the attacker
  assert.equal(session.execute({ type: 'resolveEvent', uid: inst.uid, option: 2 }).ok, true);
  assert.equal(hasEmbargo(s, 'DEU', 'PAK'), true, 'embargo against the attacker');
  // the war itself runs between the AI countries
  simulateDays(s, 30, session.sim);
  const war = s.wars[0];
  assert.ok(war.battles.attackers + war.battles.defenders >= 0);
  assert.ok(!sideOf(war, 'DEU'), 'player not involved');
});

// ---------------------------------------------------------------- 4

test('4: a war outbreak at maximum speed stops the clock on the very same day', () => {
  const session = sessionFor('BRA', 'w4');
  const s = session.state;
  const warDay = s.time.day + 40;
  onDay(session, warDay, (ctx) => executeCommand(s, { type: 'declareWar', countryId: 'VEN', targetId: 'GUY', goals: [goal('GY-PM')] }, ctx));
  session.setSpeed(4);
  assert.equal(session.clock.speed, 4, 'maximum speed exists');
  drive(session, () => false);
  assert.equal(session.clock.speed, 0, 'stopped');
  assert.equal(s.time.day, warDay, 'not a single day simulated after the outbreak');
  assert.equal(session.lastInterrupt.day, warDay);
  assert.equal(session.lastInterrupt.speedBefore, 4);
  assert.equal(activeWars(s)[0].startDay, warDay);
});

test('4b: switched-off pause type – no stop, the advisors decide the crisis', () => {
  const session = sessionFor('BRA', 'w4b', { pauseOn: { ...DEFAULT_SETTINGS.pauseOn, warDeclared: false } });
  const s = session.state;
  const warDay = s.time.day + 10;
  onDay(session, warDay, (ctx) => executeCommand(s, { type: 'declareWar', countryId: 'VEN', targetId: 'GUY', goals: [goal('GY-PM')] }, ctx));
  session.setSpeed(4);
  drive(session, () => s.time.day > warDay + 5);
  assert.ok(s.time.day > warDay, 'kept running');
  assert.equal(s.events.pending.filter((e) => e.eventId === 'warCrisis').length, 0);
  assert.ok(s.news.some((n) => n.text.startsWith('Beraterstab entschied')));
});

// ---------------------------------------------------------------- 5 & 6

test('5: a region is conquered – control changes, then the peace treaty moves the border', () => {
  const s = newState({ playerId: 'RUS', seed: 'w5' });
  const sim = new Simulation();
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }).ok, true);
  let days = 0;
  while (s.regions['UA-14'].controller !== 'RUS' && days < 400) {
    sim.advanceDay(s);
    days++;
  }
  const r = s.regions['UA-14'];
  assert.equal(r.controller, 'RUS', `Donezk occupied after ${days} days`);
  assert.equal(r.owner, 'UKR', 'occupation does not change the owner');
  const occupiedGdp = computeGdp(s, s.countries.UKR);
  r.controller = 'UKR';
  const freeGdp = computeGdp(s, s.countries.UKR);
  r.controller = 'RUS';
  assert.ok(occupiedGdp < freeGdp, 'occupied output is lost for the owner');
  assert.ok(computeGdp(s, s.countries.RUS) > 0);
  assert.ok(s.countries.RUS.regionIds.includes('UA-14') === false);
  // peace with cession: border moves
  const war = activeWars(s)[0];
  if (war) {
    war.score = 100; // decisive situation for the test of the treaty itself
    const res = run(s, { type: 'proposePeace', countryId: 'RUS', warId: war.id, terms: { regions: ['UA-14'] } });
    if (!res.accepted) {
      // forced acceptance path: the defender capitulates
      s.countries.UKR.military.exhaustion = 1;
      war.lastPeaceProposal = {};
      assert.equal(run(s, { type: 'proposePeace', countryId: 'RUS', warId: war.id, terms: { regions: ['UA-14'] } }).accepted, true);
    }
  }
  assert.equal(s.regions['UA-14'].owner, 'RUS');
  assert.ok(s.countries.RUS.regionIds.includes('UA-14'));
  assert.ok(!s.countries.UKR.regionIds.includes('UA-14'));
  assert.ok(s.truces[['RUS', 'UKR'].sort().join('|')] > s.time.day, 'truce after the peace');
  assert.ok(finite(s));
});

test('6: an occupied region is liberated by a counter-attack', () => {
  const s = newState({ playerId: 'UKR', seed: 'w6' });
  const ctx = ctxFor(s);
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }).ok, true);
  // situation: Donezk is occupied, the Russian formations are far away
  setController(s, 'UA-14', 'RUS');
  s.regions['UA-14'].occupiedSince = s.time.day;
  for (const u of s.countries.RUS.military.units) {
    u.region = s.countries.RUS.capitalRegion;
    u.target = null;
    u.attacking = false;
  }
  s.countries.RUS.military.autoFront = false;
  // the player orders a counter-attack from Dnipropetrowsk
  const ukr = s.countries.UKR;
  ukr.military.autoFront = false;
  const attackers = ukr.military.units.filter((u) => u.status === 'active').slice(0, 6);
  for (const u of attackers) {
    u.region = 'UA-12';
    u.target = null;
    u.arrival = null;
  }
  for (const u of attackers) assert.equal(run(s, { type: 'moveUnit', countryId: 'UKR', unitId: u.id, regionId: 'UA-14' }).ok, true);
  let days = 0;
  while (s.regions['UA-14'].controller !== 'UKR' && days < 120) {
    s.time.day++;
    warSystem.daily(s, ctx);
    days++;
  }
  assert.equal(s.regions['UA-14'].controller, 'UKR', `liberated after ${days} days`);
  assert.equal(s.regions['UA-14'].occupiedSince, null);
});

// ---------------------------------------------------------------- 7 & 8

test('7: aircraft production – factory capacity, budget and delivery to the air force', () => {
  const s = newState({ playerId: 'DEU', seed: 'w7' });
  const before = aircraftCount(s.countries.DEU, 'fighter');
  assert.equal(run(s, { type: 'queueProduction', countryId: 'DEU', kind: 'aircraft', item: 'jaegerMk1', quantity: 6 }).ok, true);
  assert.match(run(s, { type: 'queueProduction', countryId: 'DEU', kind: 'aircraft', item: 'advancedFighter', quantity: 1 }).error, /Technologie/);
  simulateDays(s, 100);
  assert.equal(aircraftCount(s.countries.DEU, 'fighter') - before >= 6, true, 'six new fighters in service');
  assert.equal(s.countries.DEU.military.aircraft.jaegerMk1.count, 6);
  assert.ok(s.countries.DEU.military.spending.production >= 0);
  assert.ok(!s.countries.DEU.military.production.length, 'order completed and removed');
  // a country without an aircraft factory cannot produce aircraft
  assert.match(run(s, { type: 'queueProduction', countryId: 'LUX', kind: 'aircraft', item: 'jaegerMk1', quantity: 1 }).error, /Flugzeugfabrik/);
});

test('8: ship production – shipyard level, build time and commissioning into a fleet', () => {
  const s = newState({ playerId: 'DEU', seed: 'w8' });
  const before = shipCount(s.countries.DEU, 'corvette');
  assert.equal(run(s, { type: 'queueProduction', countryId: 'DEU', kind: 'ship', item: 'corvette', quantity: 1 }).ok, true);
  simulateDays(s, 300);
  assert.equal(shipCount(s.countries.DEU, 'corvette'), before, 'minimum build time of 12 months is respected');
  simulateDays(s, 120);
  assert.equal(shipCount(s.countries.DEU, 'corvette'), before + 1, 'corvette commissioned');
  assert.match(run(s, { type: 'queueProduction', countryId: 'DEU', kind: 'ship', item: 'carrier', quantity: 1 }).error, /Werft|Technologie/);
});

// ---------------------------------------------------------------- 9

test('9: international procurement – contract, down payment, lead time, deliveries, refusals', () => {
  const s = newState({ playerId: 'POL', seed: 'w9' });
  const pol = s.countries.POL;
  const offer = procurementOffers(s, 'POL').find((o) => o.supplier === 'liberty' && o.item === 'vehicles');
  assert.ok(offer && !offer.refusal);
  const stock = pol.military.stock.vehicles;
  const treasury = pol.economy.treasury;
  const res = run(s, { type: 'signContract', countryId: 'POL', supplier: 'liberty', kind: 'equipment', item: 'vehicles', quantity: 2000 });
  assert.equal(res.ok, true, res.error);
  assert.ok(pol.economy.treasury < treasury, 'down payment paid');
  simulateDays(s, 30 * (offer.leadMonths - 1));
  const ct = pol.military.contracts[0];
  assert.equal(ct.delivered, 0, 'nothing before the lead time');
  simulateDays(s, 30 * 5);
  assert.ok(ct.delivered > 0, 'deliveries arrive');
  assert.ok(pol.military.stock.vehicles + 1 > stock, 'deliveries go into the stockpile (and refit units)');
  // embargo: the US supplier refuses Iran
  const iran = procurementOffers(s, 'IRN').find((o) => o.supplier === 'atlantic');
  assert.match(iran.refusal, /Embargo/);
  assert.match(run(s, { type: 'signContract', countryId: 'IRN', supplier: 'atlantic', kind: iran.kind, item: iran.item, quantity: 1 }).error, /Embargo/);
});

// ---------------------------------------------------------------- 10

test('10: supply problems – empty stocks and encircled formations lose combat power', () => {
  const s = newState({ playerId: 'RUS', seed: 'w10' });
  const ctx = ctxFor(s);
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }).ok, true);
  const ukr = s.countries.UKR;
  const powerBefore = landPower(ukr);
  for (const k of ['fuel', 'rations', 'ammunition']) ukr.military.stock[k] = 0;
  // an encircled Russian formation deep in Ukrainian territory
  const rus = s.countries.RUS;
  // a Ukrainian region without any border to Russia or its allies
  const friendly = new Set(['RUS', 'BLR']);
  const pocketRegion = s.countries.UKR.regionIds.find((rid) => STATIC_REGIONS[rid].neighbors.every((n) => !friendly.has(s.regions[n]?.controller)));
  const pocket = newUnit(rus, 'infantry', pocketRegion);
  rus.military.units.push(pocket);
  setController(s, pocketRegion, 'RUS');
  for (let d = 0; d < 12; d++) {
    s.time.day++;
    warSystem.daily(s, ctx);
  }
  const active = ukr.military.units.filter((u) => u.status === 'active');
  const avgSupply = active.reduce((x, u) => x + u.supply, 0) / active.length;
  assert.ok(avgSupply < 0.6, `Ukrainian supply collapses without stocks (${avgSupply.toFixed(2)})`);
  assert.ok(landPower(ukr) < powerBefore, 'combat power drops');
  if (rus.military.units.includes(pocket) && s.regions[pocketRegion].controller === 'RUS') {
    assert.ok(pocket.supply < 0.5, `cut-off formation starves (${pocket.supply.toFixed(2)})`);
  }
});

// ---------------------------------------------------------------- 11

test('11: several wars at the same time', () => {
  const s = newState({ playerId: 'RUS', seed: 'w11' });
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }).ok, true);
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'GEO', goals: [goal(s.countries.GEO.capitalRegion)] }).ok, true);
  assert.equal(run(s, { type: 'declareWar', countryId: 'PAK', targetId: 'IND', goals: [goal('IN-JK')] }).ok, true);
  assert.equal(warsOf(s, 'RUS').length, 2);
  simulateDays(s, 60);
  assert.ok(s.wars.length >= 3);
  for (const w of s.wars) {
    assert.ok(Number.isFinite(w.score));
    for (const id of [...w.attackers, ...w.defenders]) assert.ok(w.casualties[id] >= 0);
  }
  assert.ok(finite(s));
});

// ---------------------------------------------------------------- 12

test('12: AI vs AI over many years – wars start and end, the world stays consistent', () => {
  const s = newState({ playerId: 'DEU', seed: 'w12' });
  const sim = new Simulation();
  sim.advanceDays(s, 365 * 12);
  assert.ok(s.wars.length >= 2, `AI wars happen (${s.wars.length})`);
  assert.ok(s.wars.some((w) => w.status !== 'active'), 'wars end with peace');
  const reasons = new Set(s.wars.map((w) => w.goals.length));
  assert.ok(reasons.size >= 1);
  for (const w of activeWars(s)) assert.ok(s.time.day - w.startDay < 365 * 8, 'no eternal war');
  for (const [rid, r] of Object.entries(s.regions)) {
    assert.ok(s.countries[r.owner] && !s.countries[r.owner].eliminated, `${rid} has a living owner`);
    assert.ok(s.countries[r.controller], `${rid} has a controller`);
    assert.ok(s.countries[r.owner].regionIds.includes(rid), `${rid} listed by its owner`);
    assert.ok(STATIC_REGIONS[rid]);
  }
  for (const id of s.countryOrder) {
    const c = s.countries[id];
    if (c.eliminated) assert.equal(c.regionIds.length, 0);
    else assert.ok(c.regionIds.includes(c.capitalRegion), `${id} capital is own territory`);
  }
  assert.ok(finite(s));
});

// ---------------------------------------------------------------- simple controls

test('simple orders: one click raises troops, produces or buys aircraft and ships', () => {
  const s = newState({ playerId: 'DEU', seed: 'q1' });
  const deu = s.countries.DEU;
  const units = deu.military.units.length;
  const res = run(s, { type: 'quickOrder', countryId: 'DEU', order: 'armored' });
  assert.equal(res.ok, true, res.error);
  assert.equal(deu.military.units.length, units + 1, 'tank formation raised');
  assert.ok(deu.military.production.some((l) => l.item === 'armor'), 'missing tanks are produced');
  assert.equal(run(s, { type: 'quickOrder', countryId: 'DEU', order: 'fighters' }).ok, true);
  assert.ok(deu.military.production.some((l) => l.kind === 'aircraft' && l.quantity === 10));
  // a country without aircraft factories buys abroad
  const k = newState({ playerId: 'POL', seed: 'q1' });
  assert.equal(run(k, { type: 'quickOrder', countryId: 'POL', order: 'fighters' }).ok, true);
  assert.equal(k.countries.POL.military.contracts.length, 1, 'fighters bought from a supplier');
  // small countries can still raise a formation (it just trains longer)
  const lux = newState({ playerId: 'LUX', seed: 'q1' });
  assert.equal(run(lux, { type: 'quickOrder', countryId: 'LUX', order: 'infantry' }).ok, true);
  assert.match(run(lux, { type: 'quickOrder', countryId: 'LUX', order: 'submarine' }).error, /Hafen/);
});

test('war outlook: verdict, estimated duration and force comparison follow the war', () => {
  const s = newState({ playerId: 'RUS', seed: 'o1' });
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }).ok, true);
  const war = activeWars(s)[0];
  const early = warOutlook(s, war, 'attackers');
  assert.equal(early.months, null, 'no estimate on day one');
  assert.ok(early.own.soldiers > early.enemy.soldiers);
  simulateDays(s, 90);
  if (war.status === 'active') {
    const later = warOutlook(s, war, 'attackers');
    const mirror = warOutlook(s, war, 'defenders');
    assert.ok(later.value > mirror.value, 'the stronger side is judged better');
    assert.ok(later.months === null || (later.months >= 1 && later.months <= 60));
    assert.ok(war.history.length >= 3, 'score history recorded');
  }
});

test('front strategy: defensive general staff does not attack foreign regions', () => {
  const s = newState({ playerId: 'RUS', seed: 'st' });
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }).ok, true);
  assert.equal(run(s, { type: 'setFrontStance', countryId: 'RUS', stance: 'defensive' }).ok, true);
  simulateDays(s, 40);
  const attacking = s.countries.RUS.military.units.filter((u) => u.attacking && s.regions[u.target]?.owner !== 'RUS');
  assert.equal(attacking.length, 0);
  assert.ok(!Object.values(s.regions).some((r) => r.owner === 'UKR' && r.controller === 'RUS'), 'no conquests in defensive mode');
});

// ---------------------------------------------------------------- difficulty & assistant

test('difficulty: modifiers for the player only, the easiest level is never attacked', async () => {
  const { getMod } = await import('../src/systems/modifiers.js');
  const { evaluateWarTarget } = await import('../src/ai/warAI.js');
  const s = newState({ playerId: 'UKR', seed: 'd1' });
  const base = getMod(s.countries.UKR, 'approval');
  assert.equal(run(s, { type: 'setDifficulty', countryId: 'UKR', level: 'veryEasy' }).ok, true);
  assert.ok(getMod(s.countries.UKR, 'approval') > base);
  assert.equal(getMod(s.countries.RUS, 'approval'), getMod(newState({ playerId: 'UKR', seed: 'd1' }).countries.RUS, 'approval'), 'AI countries unaffected');
  assert.equal(evaluateWarTarget(s, s.countries.RUS, 'UKR').score, -999);
  assert.equal(run(s, { type: 'setDifficulty', countryId: 'UKR', level: 'veryHard' }).ok, true);
  assert.ok(getMod(s.countries.UKR, 'approval') < base);
  assert.equal(s.meta.difficulty, 'veryHard');
  assert.match(run(s, { type: 'setDifficulty', countryId: 'RUS', level: 'easy' }).error, /Spielerland/);
});

test('assistant: names the cause of discontent and points to the fix', async () => {
  const { assistantTips } = await import('../src/systems/assistant.js');
  const s = newState({ playerId: 'DEU', seed: 'a1' });
  const deu = s.countries.DEU;
  deu.politics.approval = 25;
  deu.economy.taxRate = deu.politics.taxTolerance + 0.12; // sudden tax hike
  deu.technology.current = null;
  const tips = assistantTips(s, deu);
  assert.ok(tips[0].title.includes('unzufrieden'), tips[0].title);
  assert.match(tips[0].text, /Steuern/);
  assert.equal(tips[0].action.panel, 'economy');
  assert.ok(tips.some((t) => t.action?.panel === 'research'));
  for (const t of tips) assert.ok(t.title && t.text);
});

test('assistant help offers: budget repair really reduces the deficit, tax relief targets the cause', async () => {
  const { assistantTips } = await import('../src/systems/assistant.js');
  const { balanceBudgetFix } = await import('../src/systems/assistantFixes.js');
  const { updateBudget } = await import('../src/systems/economy.js');
  const s = newState({ playerId: 'DEU', seed: 'f1' });
  const deu = s.countries.DEU;
  // create a deficit: taxes far below normal, more spending
  deu.economy.taxRate -= 0.06;
  deu.budget.infrastructure += 0.02;
  updateBudget(deu, { book: false });
  const before = deu.economy.lastBalance;
  assert.ok(before < 0, 'deficit created');
  const fix = balanceBudgetFix(deu);
  assert.ok(fix && fix.commands.length >= 2, 'tax increase and cuts proposed');
  for (const cmd of fix.commands) assert.equal(run(s, { ...cmd, countryId: 'DEU' }).ok, true, JSON.stringify(cmd));
  updateBudget(deu, { book: false });
  assert.ok(deu.economy.lastBalance > before + deu.economy.gdp * 0.002, `balance improved (${before.toFixed(2)} → ${deu.economy.lastBalance.toFixed(2)})`);
  // discontent caused by a tax hike: the offer lowers taxes
  const t = newState({ playerId: 'DEU', seed: 'f2' });
  t.countries.DEU.politics.approval = 25;
  t.countries.DEU.economy.taxRate = t.countries.DEU.politics.taxTolerance + 0.12;
  const tip = assistantTips(t, t.countries.DEU)[0];
  assert.equal(tip.fix.commands[0].type, 'setTaxRate');
  assert.ok(tip.fix.commands[0].value < t.countries.DEU.economy.taxRate);
  // research offer starts a project
  const r = newState({ playerId: 'DEU', seed: 'f3' });
  r.countries.DEU.technology.current = null;
  const rt = assistantTips(r, r.countries.DEU).find((x) => x.fix?.commands[0].type === 'setResearch');
  assert.equal(run(r, { ...rt.fix.commands[0], countryId: 'DEU' }).ok, true);
  assert.ok(r.countries.DEU.technology.current);
});

test('war score is relative to the whole coalition; a treaty never takes the last region', async () => {
  const { setTreaty } = await import('../src/systems/diplomacy.js');
  const { computeWarScore, joinWar, peaceTermsError } = await import('../src/systems/war/wars.js');
  // strong vs weak: Greece against Montenegro alone wins
  const s = newState({ playerId: 'GRC', seed: 'c1' });
  for (const t of ['alliance', 'nonAggression', 'trade']) setTreaty(s, 'GRC', 'MNE', t, false);
  assert.equal(run(s, { type: 'declareWar', countryId: 'GRC', targetId: 'MNE', goals: [goal('ME-16')] }).ok, true);
  simulateDays(s, 120);
  assert.ok(!Object.values(s.regions).some((r) => r.owner === 'GRC' && r.controller !== 'GRC'), 'Greece loses nothing to Montenegro');
  // coalition: overrunning a small member is not a victory over the coalition
  const t = newState({ playerId: 'GRC', seed: 'c2' });
  for (const k of ['alliance', 'nonAggression', 'trade']) setTreaty(t, 'GRC', 'MNE', k, false);
  assert.equal(run(t, { type: 'declareWar', countryId: 'GRC', targetId: 'MNE', goals: [goal('ME-16')] }).ok, true);
  const war = activeWars(t)[0];
  if (!war.defenders.includes('USA')) joinWar(t, war, 'USA', 'defenders', ctxFor(t));
  for (const rid of t.countries.MNE.regionIds) setController(t, rid, 'GRC');
  assert.ok(computeWarScore(t, war) < 30, `score against the coalition stays low (${computeWarScore(t, war).toFixed(1)})`);
  assert.match(peaceTermsError(t, war, 'attackers', { regions: [...t.countries.MNE.regionIds] }), /mindestens eine Region/);
});

test('equipment status: depots full of one item do not show it as missing; the real bottleneck is named', async () => {
  const { equipmentStatus } = await import('../src/systems/military/quickOrders.js');
  const s = newState({ playerId: 'DEU', seed: 'eq' });
  const c = s.countries.DEU;
  c.military.stock.infantryEquipment += 1e6;
  simulateDays(s, 35);
  const st = equipmentStatus(c);
  assert.equal(st.items.infantryEquipment?.deficit ?? 0, 0, 'infantry equipment is covered');
  if (st.bottleneck) assert.notEqual(st.bottleneck, 'infantryEquipment');
  // with every item in the depots the formations are fully equipped after the next issue
  for (const k of ['infantryEquipment', 'vehicles', 'armor', 'artillery', 'drones', 'airDefense', 'radar']) c.military.stock[k] += 1e5;
  simulateDays(s, 31);
  assert.deepEqual(equipmentStatus(c).items, {});
  // formations in training get their equipment too
  assert.equal(run(s, { type: 'raiseUnit', countryId: 'DEU', unitType: 'infantry', regionId: c.capitalRegion }).ok, true);
  simulateDays(s, 31);
  const recruit = c.military.units.at(-1);
  assert.ok(recruit.equip > 0.9, `new formation equipped during training (${recruit.equip.toFixed(2)})`);
});

test('AI enemies never ask the player for peace – a beaten enemy capitulates', async () => {
  const { warAdvisor } = await import('../src/ai/warAI.js');
  const s = newState({ playerId: 'UKR', seed: 'p1' });
  const ctx = ctxFor(s);
  assert.equal(run(s, { type: 'declareWar', countryId: 'RUS', targetId: 'UKR', goals: [goal('UA-14')] }).ok, true);
  const war = activeWars(s)[0];
  const offers = () => s.events.pending.filter((e) => e.eventId === 'warPeaceOffer');
  // Russia is winning: still no offer to the player
  setController(s, 'UA-14', 'RUS');
  war.score = 60;
  for (let i = 0; i < 6; i++) {
    s.time.day += 61;
    warAdvisor(s, s.countries.RUS, ctx);
  }
  assert.equal(offers().length, 0, 'no peace offers while winning');
  // Russia is exhausted and losing: still no white-peace offer, it capitulates instead
  setController(s, 'UA-14', 'UKR');
  const ruRegion = s.countries.RUS.regionIds.find((rid) => rid !== s.countries.RUS.capitalRegion);
  setController(s, ruRegion, 'UKR');
  war.score = -70;
  s.countries.RUS.military.exhaustion = 0.8;
  s.time.day += 61;
  warAdvisor(s, s.countries.RUS, ctx);
  assert.equal(offers().length, 0, 'no white peace offer');
  assert.equal(war.status, 'ended', 'Russia capitulated');
  assert.equal(s.regions[ruRegion].owner, 'UKR', 'occupied region ceded on capitulation');
});

test('a strong attacker takes regions within weeks and can conquer a small state completely', async () => {
  const { setTreaty } = await import('../src/systems/diplomacy.js');
  const s = newState({ playerId: 'GRC', seed: 'q9' });
  for (const t of ['alliance', 'nonAggression', 'trade']) setTreaty(s, 'GRC', 'SVK', t, false);
  assert.equal(run(s, { type: 'declareWar', countryId: 'GRC', targetId: 'SVK', goals: [goal('SK-KI')] }).ok, true);
  let firstCapture = null;
  for (let d = 1; d <= 240 && s.wars[0].status === 'active'; d++) {
    simulateDays(s, 1);
    if (firstCapture === null && Object.values(s.regions).some((r) => r.owner === 'SVK' && r.controller === 'GRC')) firstCapture = d;
  }
  assert.ok(firstCapture !== null && firstCapture <= 75, `first region taken after ${firstCapture} days`);
  assert.ok(s.countries.GRC.military.exhaustion < 0.5, 'no absurd war weariness without losses');
  assert.equal(s.wars[0].status, 'ended');
  assert.ok(s.countries.SVK.regionIds.length === 0 || s.countries.GRC.regionIds.some((r) => r.startsWith('SK')), 'Slovak territory gained');
});
