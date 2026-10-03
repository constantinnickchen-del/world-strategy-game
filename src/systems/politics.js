/**
 * Domestic politics: approval, stability and elections.
 *
 * Approval reacts to economic conditions relative to what the population is
 * used to (tax and welfare baselines adapt slowly), so sudden policy changes
 * hurt more than long-established levels.
 */
import { GOVERNMENTS, IDEOLOGIES, IDEOLOGY_ROTATION } from '../data/governments.js';
import { getMod } from './modifiers.js';
import { addNews } from './news.js';
import { addYears, formatDateDE } from '../core/calendar.js';
import { clamp } from '../util/math.js';

/** Breakdown of the approval target – also used for UI tooltips. */
export function approvalFactors(c) {
  const e = c.economy;
  const p = c.politics;
  const sens = GOVERNMENTS[p.government].approvalSensitivity;
  const f = [
    ['Basis', 50],
    ['Wirtschaftswachstum', clamp(400 * (e.growth - 0.02), -15, 12) * sens],
    ['Inflation', -clamp(250 * Math.max(0, e.inflation - 0.03), 0, 25) * sens],
    ['Arbeitslosigkeit', -clamp(150 * Math.max(0, e.unemployment - 0.05), 0, 20) * sens],
    ['Steuerlast (Änderung)', -clamp(80 * (e.taxRate - p.taxTolerance), -10, 20) * sens],
    ['Sozialausgaben (Änderung)', clamp(120 * (c.budget.welfare - p.welfareBaseline), -15, 10) * sens],
    ['Versorgungsengpässe', -clamp(300 * (c.trade.unmetValue / Math.max(0.01, e.gdp)), 0, 15)],
    ['Krieg & Mobilmachung', militaryApproval(c)],
    ['Modifikatoren', getMod(c, 'approval')],
  ];
  return f.map(([label, value]) => ({ label, value }));
}

export function stabilityFactors(c) {
  const e = c.economy;
  const p = c.politics;
  const f = [
    ['Regierungsform', GOVERNMENTS[p.government].stabilityBase],
    ['Zustimmung', 0.45 * (p.approval - 50)],
    ['Hohe Inflation', -clamp(40 * Math.max(0, e.inflation - 0.1), 0, 25)],
    ['Massenarbeitslosigkeit', -clamp(60 * Math.max(0, e.unemployment - 0.12), 0, 15)],
    ['Sicherheitsapparat', p.government === 'democracy' ? 0 : clamp(150 * (c.budget.military - 0.02), -5, 8)],
    ['Wohlstand', clamp((c.income <= 2 ? 8 : c.income === 3 ? 3 : 0), 0, 8)],
    ['Kriegsmüdigkeit', -18 * (c.military?.exhaustion ?? 0)],
    ['Besetzte Gebiete', -clamp(40 * occupiedShare(c), 0, 25)],
    ['Modifikatoren', getMod(c, 'stability')],
  ];
  return f.map(([label, value]) => ({ label, value }));
}

const sum = (factors) => factors.reduce((s, f) => s + f.value, 0);

function militaryApproval(c) {
  const m = c.military;
  if (!m) return 0;
  return (m.atWar ? 0 : -4 * m.mobilization) - 25 * m.exhaustion;
}

function occupiedShare(c) {
  return c.occupiedShare ?? 0;
}

function holdElection(state, c, ctx) {
  const p = c.politics;
  const gov = GOVERNMENTS[p.government];
  const result = p.approval + ctx.rng.gaussian(0, 4);
  const isPlayer = state.playerId === c.id;
  p.lastElection = state.time.day;
  p.nextElection = addYears(state.time.day, gov.electionYears);
  if (result >= gov.reelectionThreshold) {
    p.approval = clamp(p.approval + 3, 0, 100);
    addNews(state, {
      category: 'politics',
      countryId: c.id,
      importance: isPlayer ? 3 : c.economy.gdp > 1000 ? 2 : 1,
      text: `Wahl in ${c.name}: Die ${IDEOLOGIES[p.ideology].name.toLowerCase()} Regierung wurde im Amt bestätigt.`,
    });
  } else {
    const options = IDEOLOGY_ROTATION[p.ideology] ?? ['conservative'];
    const old = p.ideology;
    p.ideology = ctx.rng.pick(options);
    p.approval = 58;
    p.taxTolerance = c.economy.taxRate;
    p.welfareBaseline = c.budget.welfare;
    addNews(state, {
      category: 'politics',
      countryId: c.id,
      importance: isPlayer ? 3 : c.economy.gdp > 1000 ? 2 : 1,
      text: `Regierungswechsel in ${c.name}: ${IDEOLOGIES[old].name} abgewählt, neue Regierung: ${IDEOLOGIES[p.ideology].name}.`,
    });
  }
  if (isPlayer) {
    addNews(state, {
      category: 'politics',
      countryId: c.id,
      importance: 2,
      text: `Nächste Wahl in ${c.name}: ${formatDateDE(p.nextElection)}.`,
    });
  }
}

export function stepPolitics(state, c, ctx) {
  const p = c.politics;
  p.approval = clamp(p.approval + (sum(approvalFactors(c)) - p.approval) * 0.08, 0, 100);
  p.stability = clamp(p.stability + (sum(stabilityFactors(c)) - p.stability) * 0.05, 0, 100);
  // people get used to tax and welfare levels over time
  p.taxTolerance += (c.economy.taxRate - p.taxTolerance) * 0.015;
  p.welfareBaseline += (c.budget.welfare - p.welfareBaseline) * 0.015;
  if (p.nextElection !== null && state.time.day >= p.nextElection) holdElection(state, c, ctx);
}

export const politicsSystem = {
  id: 'politics',
  monthly(state, ctx) {
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (!c.eliminated) stepPolitics(state, c, ctx);
    }
  },
};
