/**
 * Country AI.
 *
 * Each AI country thinks once per month on its own day (country.ai.day) to
 * spread the load. It only acts through commands – exactly like the player –
 * so the AI can never bypass game rules. Behaviour is driven by a persistent
 * personality (economy, militarism, diplomacy, research focus).
 *
 * Structure: independent "advisors" (fiscal, budget, research, diplomacy).
 * New behaviour (war planning, trade policy, ...) is added as another advisor.
 */
import { executeCommand } from '../commands/commands.js';
import { BUDGET_CATEGORIES, debtRatio } from '../state/selectors.js';
import { availableTechs, techCost } from '../systems/technology.js';
import { getOpinion, hasTreaty, hasEmbargo, getRelation, tradeBlocked } from '../systems/diplomacy.js';
import { neighborCountryIds } from '../state/worldIndex.js';
import { clamp } from '../util/math.js';

const STEP = 0.005;
const PROPOSAL_COOLDOWN_DAYS = 365;
// Proposals to the human player are rarer and wait longer, so decisions stay meaningful.
const PLAYER_PROPOSAL_COOLDOWN_DAYS = 730;
const PLAYER_PROPOSAL_CHANCE = 0.35;

function cmd(state, ctx, c, type, payload) {
  return executeCommand(state, { type, countryId: c.id, ...payload }, ctx);
}

function nudgeBudget(state, ctx, c, category, target, step = 0.002) {
  const def = BUDGET_CATEGORIES[category];
  const cur = c.budget[category];
  const t = clamp(target, def.min, def.max);
  if (Math.abs(t - cur) < step / 2) return;
  cmd(state, ctx, c, 'setBudget', { category, value: cur + Math.sign(t - cur) * Math.min(step, Math.abs(t - cur)) });
}

export function fiscalAdvisor(state, c, ctx) {
  const e = c.economy;
  const deficit = (-e.lastRealBalance * 12) / e.gdp;
  const overDebt = debtRatio(c) > e.debtTolerance;
  const normal = Math.max(0.02, e.deficitTarget + 0.01);
  const limit = overDebt ? normal * 0.5 : normal;
  const p = c.politics;
  // AI governments do not raise taxes far beyond what their population is used to
  const taxCap = Math.min(0.55, (c.ai.baseline?.taxRate ?? e.taxRate) + 0.06);
  if (deficit > limit + 0.005) {
    if (e.taxRate < taxCap && p.approval > 35 && ctx.rng.chance(0.6)) {
      cmd(state, ctx, c, 'setTaxRate', { value: e.taxRate + STEP });
    } else {
      cmd(state, ctx, c, 'setBudget', { category: 'welfare', value: Math.max(BUDGET_CATEGORIES.welfare.min, c.budget.welfare - STEP) });
    }
  } else if (deficit < limit - 0.025) {
    if (p.approval < 55 || ctx.rng.chance(0.5)) {
      if (c.ai.personality.economy > 0.5 && e.taxRate > 0.12) cmd(state, ctx, c, 'setTaxRate', { value: e.taxRate - STEP });
      else cmd(state, ctx, c, 'setBudget', { category: 'welfare', value: Math.min(BUDGET_CATEGORIES.welfare.max, c.budget.welfare + STEP) });
    }
  }
  // Pay down debt with large cash reserves
  if (e.treasury > e.gdp * 0.06 && e.debt > 0) {
    cmd(state, ctx, c, 'repayDebt', { amount: Math.min(e.debt, e.treasury - e.gdp * 0.03) });
  }
}

export function budgetAdvisor(state, c, ctx) {
  const base = c.ai.baseline ?? c.budget;
  const pers = c.ai.personality;
  const tight = (-c.economy.lastRealBalance * 12) / c.economy.gdp > Math.max(0.03, c.economy.deficitTarget + 0.02);
  nudgeBudget(state, ctx, c, 'military', base.military * (0.85 + 0.4 * pers.militarism) * (tight ? 0.9 : 1));
  nudgeBudget(state, ctx, c, 'research', base.research * (0.85 + 0.5 * pers.research) * (tight ? 0.9 : 1), 0.001);
  const infraTarget = c.infrastructure < 55 ? Math.max(base.infrastructure, 0.04) : base.infrastructure;
  nudgeBudget(state, ctx, c, 'infrastructure', infraTarget * (tight ? 0.9 : 1));
}

const CATEGORY_TRAIT = {
  military: 'militarism',
  economy: 'economy',
  industry: 'economy',
  energy: 'economy',
  agriculture: 'research',
  society: 'research',
  infrastructure: 'economy',
};

export function researchAdvisor(state, c, ctx) {
  if (c.technology.current || c.technology.pointsPerMonth <= 0) return;
  const options = availableTechs(c);
  if (!options.length) return;
  const pick = ctx.rng.weighted(options, (t) => (0.3 + c.ai.personality[CATEGORY_TRAIT[t.category]]) * (1000 / techCost(state, t.id)));
  if (pick) cmd(state, ctx, c, 'setResearch', { techId: pick.id });
}

function recentlyProposed(state, a, b) {
  const last = getRelation(state, a, b)?.lastProposal?.[a];
  const cooldown = b === state.playerId ? PLAYER_PROPOSAL_COOLDOWN_DAYS : PROPOSAL_COOLDOWN_DAYS;
  return last !== undefined && state.time.day - last < cooldown;
}

export function diplomacyAdvisor(state, c, ctx) {
  const pers = c.ai.personality;
  if (!ctx.rng.chance(0.25 + 0.5 * pers.diplomacy)) return;
  const candidates = new Set([...neighborCountryIds(state, c.id), ...c.trade.partners.map((p) => p.id)]);
  // occasionally look at a random distant country
  candidates.add(ctx.rng.pick(state.countryOrder));
  candidates.delete(c.id);
  const list = [...candidates].filter((id) => !state.countries[id].eliminated);
  if (!list.length) return;
  const other = ctx.rng.pick(list);
  const opinion = getOpinion(state, c.id, other);

  if (hasEmbargo(state, c.id, other)) {
    if (opinion > -30) cmd(state, ctx, c, 'setEmbargo', { targetId: other, active: false });
    return;
  }
  if (opinion < -75 && pers.militarism > 0.6 && ctx.rng.chance(0.05)) {
    cmd(state, ctx, c, 'setEmbargo', { targetId: other, active: true });
    return;
  }
  if (tradeBlocked(state, c.id, other) || recentlyProposed(state, c.id, other)) return;
  if (other === state.playerId && !ctx.rng.chance(PLAYER_PROPOSAL_CHANCE)) return;
  if (!hasTreaty(state, c.id, other, 'trade') && opinion > 10) {
    cmd(state, ctx, c, 'proposeTreaty', { targetId: other, treaty: 'trade' });
  } else if (!hasTreaty(state, c.id, other, 'nonAggression') && opinion > 0 && opinion < 50 && neighborCountryIds(state, c.id).includes(other) && ctx.rng.chance(0.3)) {
    cmd(state, ctx, c, 'proposeTreaty', { targetId: other, treaty: 'nonAggression' });
  } else if (!hasTreaty(state, c.id, other, 'alliance') && opinion > 70 && ctx.rng.chance(0.08)) {
    cmd(state, ctx, c, 'proposeTreaty', { targetId: other, treaty: 'alliance' });
  } else if (opinion > -40 && opinion < 60 && ctx.rng.chance(0.4)) {
    cmd(state, ctx, c, 'improveRelations', { targetId: other });
  }
}

export const ADVISORS = [fiscalAdvisor, budgetAdvisor, researchAdvisor, diplomacyAdvisor];

export function runCountryAI(state, c, ctx) {
  for (const advisor of ADVISORS) advisor(state, c, ctx);
}

export const aiSystem = {
  id: 'ai',
  daily(state, ctx) {
    const dom = ctx.date.day;
    for (const id of state.countryOrder) {
      if (id === state.playerId) continue;
      const c = state.countries[id];
      if (!c.eliminated && c.ai.day === dom) runCountryAI(state, c, ctx);
    }
  },
};
