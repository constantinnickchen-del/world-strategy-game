import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, ctxFor } from './helpers.js';
import { executeCommand, validateCommand, improveRelationsCost } from '../src/commands/commands.js';
import { getOpinion, hasTreaty, hasEmbargo, evaluateProposal } from '../src/systems/diplomacy.js';
import { fireEvent, optionUnavailable } from '../src/systems/events.js';
import { EVENTS } from '../src/data/events.js';

const run = (s, cmd) => executeCommand(s, { countryId: 'DEU', ...cmd }, ctxFor(s));

test('setTaxRate / setBudget validate ranges', () => {
  const s = newState();
  assert.equal(run(s, { type: 'setTaxRate', value: 0.42 }).ok, true);
  assert.equal(s.countries.DEU.economy.taxRate, 0.42);
  assert.equal(run(s, { type: 'setTaxRate', value: 0.99 }).ok, false);
  assert.equal(run(s, { type: 'setTaxRate', value: NaN }).ok, false);
  assert.equal(run(s, { type: 'setBudget', category: 'military', value: 0.02 }).ok, true);
  assert.equal(s.countries.DEU.budget.military, 0.02);
  assert.equal(run(s, { type: 'setBudget', category: 'military', value: 0.5 }).ok, false);
  assert.equal(run(s, { type: 'setBudget', category: 'casinos', value: 0.01 }).ok, false);
  assert.match(validateCommand(s, { type: 'nope', countryId: 'DEU' }), /Unbekannter Befehl/);
});

test('setResearch requires prerequisites', () => {
  const s = newState();
  assert.equal(run(s, { type: 'setResearch', techId: 'aiWarfare' }).ok, false);
  assert.equal(run(s, { type: 'setResearch', techId: 'eGovernment' }).ok, false, 'already researched');
  assert.equal(run(s, { type: 'setResearch', techId: 'platformEconomy' }).ok, true);
  assert.equal(s.countries.DEU.technology.current, 'platformEconomy');
});

test('repayDebt moves money from treasury to debt', () => {
  const s = newState();
  const e = s.countries.DEU.economy;
  const t = e.treasury;
  const d = e.debt;
  assert.equal(run(s, { type: 'repayDebt', amount: t / 2 }).ok, true);
  assert.ok(Math.abs(e.treasury - t / 2) < 1e-9 && Math.abs(e.debt - (d - t / 2)) < 1e-9);
  assert.equal(run(s, { type: 'repayDebt', amount: t * 10 }).ok, false);
});

test('improveRelations costs money, raises opinion and has a cooldown', () => {
  const s = newState();
  const before = getOpinion(s, 'DEU', 'BRA');
  const treasury = s.countries.DEU.economy.treasury;
  assert.equal(run(s, { type: 'improveRelations', targetId: 'BRA' }).ok, true);
  assert.ok(getOpinion(s, 'DEU', 'BRA') > before);
  assert.ok(Math.abs(s.countries.DEU.economy.treasury - (treasury - improveRelationsCost(s.countries.DEU))) < 1e-9);
  const again = run(s, { type: 'improveRelations', targetId: 'BRA' });
  assert.equal(again.ok, false);
  assert.match(again.error, /Tagen/);
  assert.equal(run(s, { type: 'improveRelations', targetId: 'DEU' }).ok, false, 'not with yourself');
});

test('treaty proposals follow the deterministic evaluation', () => {
  const s = newState();
  const verdict = evaluateProposal(s, 'DEU', 'JPN', 'trade');
  const res = run(s, { type: 'proposeTreaty', targetId: 'JPN', treaty: 'trade' });
  assert.equal(res.ok, true);
  assert.equal(res.accepted, verdict.accept);
  assert.equal(hasTreaty(s, 'DEU', 'JPN', 'trade'), verdict.accept);
  // Iran will not ally with Germany
  const alliance = run(s, { type: 'proposeTreaty', targetId: 'IRN', treaty: 'alliance' });
  assert.equal(alliance.accepted, false);
  assert.equal(run(s, { type: 'proposeTreaty', targetId: 'FRA', treaty: 'trade' }).ok, false, 'already exists (EU)');
});

test('AI proposals to the player become a decision event', () => {
  const s = newState();
  const res = executeCommand(s, { type: 'proposeTreaty', countryId: 'BRA', targetId: 'DEU', treaty: 'trade' }, ctxFor(s));
  assert.equal(res.ok, true);
  const pending = s.events.pending.find((p) => p.eventId === 'treatyProposal');
  assert.ok(pending && pending.otherId === 'BRA');
  assert.equal(run(s, { type: 'resolveEvent', uid: pending.uid, option: 0 }).ok, true);
  assert.equal(hasTreaty(s, 'DEU', 'BRA', 'trade'), true);
  assert.equal(s.events.pending.length, 0);
});

test('embargo and treaty cancellation', () => {
  const s = newState();
  assert.equal(run(s, { type: 'setEmbargo', targetId: 'FRA', active: true }).ok, false, 'no embargo on allies');
  assert.equal(run(s, { type: 'setEmbargo', targetId: 'BRA', active: true }).ok, true);
  assert.equal(hasEmbargo(s, 'DEU', 'BRA'), true);
  assert.equal(run(s, { type: 'proposeTreaty', targetId: 'BRA', treaty: 'trade' }).ok, false, 'embargo blocks treaties');
  assert.equal(run(s, { type: 'setEmbargo', targetId: 'BRA', active: false }).ok, true);
  const op = getOpinion(s, 'DEU', 'POL');
  assert.equal(run(s, { type: 'cancelTreaty', targetId: 'POL', treaty: 'alliance' }).ok, true);
  assert.equal(hasTreaty(s, 'DEU', 'POL', 'alliance'), false);
  assert.ok(getOpinion(s, 'DEU', 'POL') < op);
});

test('every event definition can fire and resolve every option', () => {
  for (const def of EVENTS) {
    for (let opt = 0; opt < def.options.length; opt++) {
      const s = newState();
      const ctx = ctxFor(s);
      s.countries.DEU.technology.current = 'platformEconomy';
      const countryId = def.scope === 'world' ? null : 'BRA'; // AI country resolves immediately
      const inst = fireEvent(s, def.id, countryId, { otherId: def.target || def.scope === 'triggered' ? 'ARG' : null, data: { treaty: 'trade' } }, ctx);
      assert.ok(inst.options.length === def.options.length, def.id);
      // and as the player's event
      if (def.scope !== 'world') {
        const p = fireEvent(s, def.id, 'DEU', { otherId: 'FRA', data: { treaty: 'nonAggression' } }, ctx);
        assert.ok(s.events.pending.includes(p));
        // options with an availability rule (crisis events without a matching war) must be refused cleanly
        const expected = !optionUnavailable(s, p, opt);
        assert.equal(run(s, { type: 'resolveEvent', uid: p.uid, option: opt }).ok, expected, `${def.id} option ${opt}`);
      }
      let bad = 0;
      JSON.stringify(s, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? bad++ : v));
      assert.equal(bad, 0, `${def.id} keeps state finite`);
    }
  }
});
