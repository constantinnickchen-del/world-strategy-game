/**
 * National economy: growth, inflation, unemployment, state budget and debt.
 *
 * All money values are bn USD in constant scenario-start prices (real terms).
 * Inflation therefore shows up as erosion of the real value of debt and
 * treasury, and as political pressure (see politics.js).
 *
 * Causal chain modelled here:
 *   commodity prices -> national cost index -> inflation -> real debt / interest
 *   trade balance & shortages -> growth -> GDP -> tax base -> revenue -> budget
 *   stability & infrastructure -> tax efficiency and potential growth
 */
import { RESOURCE_IDS } from '../data/resources.js';
import { getMod, addModifier } from './modifiers.js';
import { addNews } from './news.js';
import { gdpPerCapita, totalSpendingShare } from '../state/selectors.js';
import { clamp, monthlyFactor } from '../util/math.js';

/** Long-run potential growth: poorer economies can catch up faster. */
export function potentialGrowth(c) {
  const gdppc = gdpPerCapita(c);
  const convergence = clamp(1 - Math.log10(Math.max(500, gdppc) / 1000) / Math.log10(80), 0, 1);
  return 0.01 + 0.032 * convergence;
}

export function taxEfficiency(c) {
  const p = c.politics;
  let eff = 0.55 + 0.22 * (p.stability / 100) + 0.13 * (c.infrastructure / 100) + 1.2 * (c.budget.administration - 0.05);
  eff += getMod(c, 'taxEfficiency');
  // Laffer effect: very high rates increase avoidance
  eff *= 1 - Math.max(0, c.economy.taxRate - 0.45) * 0.8;
  return clamp(eff, 0.3, 1);
}

export function interestRateTarget(c, debtRatio) {
  const e = c.economy;
  const risk = Math.max(0, debtRatio - e.debtTolerance) * 0.05 + Math.max(0, 50 - c.politics.stability) * 0.0006;
  return clamp(e.baseRate + 0.8 * Math.max(0, e.inflation - 0.02) + risk + getMod(c, 'interestRate'), 0.001, 0.6);
}

/** Commodity basket cost relative to base prices, weighted by national consumption. */
export function costIndex(state, c) {
  let cur = 0;
  let base = 0;
  for (const rid of RESOURCE_IDS) {
    const m = state.market[rid];
    const q = c.resources[rid].consumption;
    cur += q * m.price;
    base += q * m.basePrice;
  }
  return base > 0 ? { index: cur / base, basketValue: base } : { index: 1, basketValue: 0 };
}

/** Computes this month's revenue, expenses and balance and books them. */
export function updateBudget(c, { book = true } = {}) {
  const e = c.economy;
  const eff = taxEfficiency(c);
  e.lastTaxEfficiency = eff;
  const revenue = (e.gdp * e.taxRate * eff) / 12;
  // Commodity export rents, capped so collapsing economies cannot live off a fixed export volume
  const resourceRent = Math.min(c.trade.exports * e.rentShare, e.gdp * 0.35) / 12;
  e.interestRate += (interestRateTarget(c, e.debt / e.gdp) - e.interestRate) * 0.05;
  const interest = (e.debt * e.interestRate) / 12;
  const spending = (e.gdp * totalSpendingShare(c)) / 12;
  const balance = revenue + resourceRent - spending - interest;
  e.lastRevenue = revenue;
  e.lastResourceRent = resourceRent;
  e.lastInterest = interest;
  e.lastExpenses = spending + interest;
  e.lastBalance = balance;
  // Inflation reduces the real value of debt; the "real" balance is what actually changes real debt.
  e.lastRealBalance = balance + (e.debt * e.inflation) / 12;
  if (!book) return;
  e.treasury += balance;
  if (e.treasury < 0) {
    e.debt += -e.treasury;
    e.treasury = 0;
  }
}

export function stepEconomy(state, c, rng) {
  const e = c.economy;
  const gdp = e.gdp;

  // --- Commodity costs ---------------------------------------------------
  const { index, basketValue } = costIndex(state, c);
  e.costIndex = index;
  // Market quantities are "units per year", so basketValue is an annual value.
  e.commodityShare = basketValue / Math.max(0.01, gdp);
  // Price changes versus the trailing average pass through into consumer prices.
  const commodityPressure = 1.2 * e.commodityShare * (index / e.costIndexAvg - 1);
  e.costIndexAvg += (index - e.costIndexAvg) / 12;

  // --- Trade ----------------------------------------------------------------
  const t = c.trade;
  // Commodity trade only matters relative to the economy's structural position at scenario start
  // (importers of raw materials export manufactured goods that are not modelled explicitly).
  e.tradeBalanceRef ??= t.balance / gdp;
  const tradeEffect = clamp(0.25 * (t.balance / gdp - e.tradeBalanceRef), -0.02, 0.02);
  const agreementsEffect = Math.min(10, t.agreements ?? 0) * 0.0003 * (t.gainFactor ?? 1);
  const shortageRatio = t.unmetValue / Math.max(0.01, gdp);

  // --- Budget (previous month's values drive the fiscal impulse) ---------------
  const deficitRatio = (-(e.lastRealBalance ?? e.lastBalance) * 12) / gdp;
  const debtRatio = e.debt / gdp;

  // --- Growth -----------------------------------------------------------------
  const potential = potentialGrowth(c);
  e.potentialGrowth = potential;
  const stabilityFactor = 0.4 + 0.8 * (c.politics.stability / 100);
  const infraEffect = ((c.infrastructure - 55) / 100) * 0.02;
  const fiscalImpulse = clamp(0.25 * (deficitRatio - e.deficitTarget), -0.015, 0.015);
  const taxDrag = -0.06 * (e.taxRate - 0.3);
  const inflationPenalty = -0.3 * clamp(e.inflation - 0.06, 0, 0.3);
  const shortagePenalty = -2.5 * shortageRatio;
  const debtDrag = -0.012 * clamp(debtRatio - e.debtTolerance, 0, 2.5);
  e.growthShock = e.growthShock * 0.85 + rng.gaussian(0, 0.0035);
  const target =
    potential * stabilityFactor +
    infraEffect +
    fiscalImpulse +
    taxDrag +
    inflationPenalty +
    tradeEffect +
    agreementsEffect +
    shortagePenalty +
    debtDrag +
    getMod(c, 'growth') +
    e.growthShock;
  e.growth = clamp(e.growth + (target - e.growth) * 0.3, -0.2, 0.2);
  e.gdp = Math.max(0.01, gdp * monthlyFactor(e.growth));

  // --- Inflation ----------------------------------------------------------------
  const overheating = 0.4 * clamp(e.growth - potential, -0.03, 0.05);
  const monetization = Math.max(0, deficitRatio - 0.06) * 0.4 + Math.max(0, debtRatio - e.debtTolerance - 0.4) * 0.03;
  const inflTarget = e.inflationAnchor + commodityPressure + overheating + monetization + 3 * shortageRatio + getMod(c, 'inflation');
  e.inflation = clamp(e.inflation + (inflTarget - e.inflation) * 0.15, -0.05, 1.5);
  // Expectations: anchored by stability, de-anchored by persistent inflation
  // (central bank credibility grows with stability; half-life of a few years)
  e.inflationAnchor += (0.02 - e.inflationAnchor) * 0.015 * (0.3 + c.politics.stability / 100) + (e.inflation - e.inflationAnchor) * 0.008;
  e.inflationAnchor = clamp(e.inflationAnchor, 0.005, 0.6);
  e.priceLevel *= monthlyFactor(e.inflation);

  // --- Unemployment (Okun) -------------------------------------------------------
  e.naturalUnemployment += (0.06 - e.naturalUnemployment) * 0.002; // structural unemployment slowly normalises
  const uTarget = e.naturalUnemployment - 0.45 * (e.growth - potential) + getMod(c, 'unemployment');
  e.unemployment = clamp(e.unemployment + (uTarget - e.unemployment) * 0.1, 0.01, 0.45);

  updateBudget(c);
  // Real-terms erosion through inflation (same simple monthly convention as interest)
  const erosion = 1 + Math.max(-0.05, e.inflation) / 12;
  e.debt /= erosion;
  e.treasury /= erosion;
}

/**
 * Sovereign default: when real interest payments eat most of the revenue and
 * debt is far beyond what markets tolerate, the state restructures its debt.
 * Painful (stability, approval, years of high rates) but stops endless spirals.
 */
export function checkSovereignDefault(state, c) {
  const e = c.economy;
  const realInterest = Math.max(0, e.interestRate - e.inflation) * e.debt;
  const revenue = e.lastRevenue * 12 + e.lastResourceRent * 12;
  if (e.debt / e.gdp < e.debtTolerance + 1 || realInterest < 0.5 * revenue) return false;
  if (c.modifiers.some((m) => m.source === 'default')) return false;
  e.debt *= 0.4;
  c.politics.stability = clamp(c.politics.stability - 15, 0, 100);
  c.politics.approval = clamp(c.politics.approval - 15, 0, 100);
  addModifier(state, c, { stat: 'interestRate', value: 0.04, months: 60, label: 'Staatsbankrott', source: 'default' });
  addModifier(state, c, { stat: 'growth', value: -0.03, months: 12, label: 'Staatsbankrott', source: 'default' });
  addNews(state, {
    category: 'economy',
    countryId: c.id,
    importance: c.id === state.playerId ? 3 : 2,
    text: `Staatsbankrott: ${c.name} kann seine Schulden nicht mehr bedienen. 60 % der Staatsschulden werden gestrichen.`,
  });
  return true;
}

export const economySystem = {
  id: 'economy',
  monthly(state, ctx) {
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      stepEconomy(state, c, ctx.rng);
      checkSovereignDefault(state, c);
    }
  },
};
