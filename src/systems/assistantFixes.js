/**
 * Concrete help offers of the assistant: each returns { label, changes[], effect, commands[] }
 * or null. Commands are ordinary player commands (without countryId) – the UI
 * asks the player first and then executes them through the session, so the
 * assistant can never do anything the player could not do by hand.
 */
import { BUDGET_CATEGORIES, TAX_LIMITS, debtRatio } from '../state/selectors.js';
import { availableTechs, techCost } from './technology.js';
import { evaluateProposal } from './diplomacy.js';
import { evaluatePeace, sideOf, otherSide } from './war/wars.js';
import { STATIC_REGIONS } from '../state/worldIndex.js';
import { formatBn, formatPct } from '../util/format.js';

const round3 = (v) => Math.round(v * 1000) / 1000;
const pct1 = (v) => formatPct(v, 1);

function budgetChange(c, category, value) {
  const def = BUDGET_CATEGORIES[category];
  const v = round3(Math.max(def.min, Math.min(def.max, value)));
  if (Math.abs(v - c.budget[category]) < 0.0005) return null;
  return { cmd: { type: 'setBudget', category, value: v }, text: `${def.name}: ${pct1(c.budget[category])} → ${pct1(v)} des BIP` };
}

function taxChange(c, value) {
  const v = round3(Math.max(TAX_LIMITS.min, Math.min(TAX_LIMITS.max, value)));
  if (Math.abs(v - c.economy.taxRate) < 0.0005) return null;
  return { cmd: { type: 'setTaxRate', value: v }, text: `Steuern: ${pct1(c.economy.taxRate)} → ${pct1(v)}` };
}

function offer(label, items, effect) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return { label, changes: list.map((i) => i.text), commands: list.map((i) => i.cmd), effect };
}

/**
 * Balance the budget: moderate tax increase plus proportional cuts, so that
 * the deficit shrinks (and debt falls when it is too high).
 */
export function balanceBudgetFix(c, { atWar = false } = {}) {
  const e = c.economy;
  const deficit = (-e.lastBalance * 12) / e.gdp; // share of GDP
  const overDebt = debtRatio(c) > e.debtTolerance || e.treasury < e.gdp * 0.005;
  const target = overDebt ? -0.005 : 0.01; // surplus of 0.5 % when debt must fall
  let gap = deficit - target;
  if (gap <= 0.001) return null;
  const items = [];
  // 1. taxes: at most +2 points and not far beyond what people are used to
  const eff = e.lastTaxEfficiency || 0.8;
  const taxRoom = Math.max(0, Math.min(0.02, c.politics.taxTolerance + 0.04 - e.taxRate, TAX_LIMITS.max - e.taxRate));
  const taxUp = Math.min(taxRoom, (gap / eff) * 0.5);
  let gained = 0;
  if (taxUp >= 0.0025) {
    items.push(taxChange(c, e.taxRate + taxUp));
    gap -= taxUp * eff;
    gained += taxUp * eff;
  }
  // 2. cuts, proportional to what can reasonably be cut
  const cutShare = { administration: 0.15, infrastructure: 0.2, research: 0.15, military: atWar ? 0 : 0.2, welfare: c.politics.approval > 50 ? 0.08 : 0.03 };
  const capacity = {};
  let total = 0;
  for (const [cat, share] of Object.entries(cutShare)) {
    capacity[cat] = Math.max(0, Math.min(c.budget[cat] * share, c.budget[cat] - BUDGET_CATEGORIES[cat].min));
    total += capacity[cat];
  }
  if (gap > 0 && total > 0) {
    const f = Math.min(1, gap / total);
    for (const cat of Object.keys(cutShare)) {
      if (capacity[cat] * f < 0.0005) continue;
      items.push(budgetChange(c, cat, c.budget[cat] - capacity[cat] * f));
      gained += capacity[cat] * f;
    }
  }
  const improvement = (gained * e.gdp) / 12;
  return offer(
    overDebt ? 'Haushalt sanieren und Schulden abbauen' : 'Defizit verringern',
    items,
    `Erwartet: Haushalt verbessert sich um ca. ${formatBn(improvement)} pro Monat${overDebt ? ' – die Schulden sinken' : ''}. Steuererhöhungen kosten etwas Zustimmung.`,
  );
}

/** Make people happier, depending on the main cause of discontent. */
export function approvalFix(state, c, worstLabel) {
  const e = c.economy;
  switch (worstLabel) {
    case 'Steuerlast (Änderung)':
      return offer('Steuern senken', [taxChange(c, Math.max(c.politics.taxTolerance, e.taxRate - 0.02))], `Mehr Zustimmung; dafür ca. ${formatBn((Math.min(0.02, e.taxRate - c.politics.taxTolerance) * e.gdp * (e.lastTaxEfficiency || 0.8)) / 12)} weniger Einnahmen pro Monat.`);
    case 'Sozialausgaben (Änderung)':
      return offer('Sozialausgaben erhöhen', [budgetChange(c, 'welfare', Math.max(c.politics.welfareBaseline, c.budget.welfare + 0.01))], 'Mehr Zustimmung, höhere Ausgaben.');
    case 'Arbeitslosigkeit':
    case 'Wirtschaftswachstum':
      return offer('In Wachstum investieren', [budgetChange(c, 'infrastructure', c.budget.infrastructure + 0.005), budgetChange(c, 'research', c.budget.research + 0.002)], 'Mehr Wachstum und Arbeit in den nächsten Jahren, höhere Ausgaben.');
    case 'Inflation':
      return balanceBudgetFix(c, { atWar: !!c.military?.atWar });
    case 'Krieg & Mobilmachung':
      if (!c.military.atWar && c.military.mobilization > 0) return offer('Mobilmachung beenden', [{ cmd: { type: 'setMobilization', level: 0 }, text: 'Mobilmachung aufheben (Reservisten kehren an die Arbeit zurück)' }], 'Mehr Zustimmung und Arbeitskräfte.');
      return null;
    default:
      return offer('Bevölkerung entlasten', [taxChange(c, Math.max(c.politics.taxTolerance - 0.01, e.taxRate - 0.01)), budgetChange(c, 'welfare', c.budget.welfare + 0.005)], 'Etwas mehr Zustimmung, etwas höhere Kosten.');
  }
}

export function electionFix(c) {
  return offer('Vor der Wahl entlasten', [taxChange(c, c.economy.taxRate - 0.01), budgetChange(c, 'welfare', c.budget.welfare + 0.005)], 'Steigert die Zustimmung bis zur Wahl.');
}

export function repayFix(c) {
  const e = c.economy;
  const amount = Math.round(Math.min(e.debt, e.treasury - e.gdp * 0.03) * 10) / 10;
  if (amount <= 0) return null;
  return offer('Schulden tilgen', [{ cmd: { type: 'repayDebt', amount }, text: `${formatBn(amount)} Schulden zurückzahlen` }], 'Weniger Zinsen in jedem folgenden Monat.');
}

export function researchFix(state, c) {
  const options = availableTechs(c);
  if (!options.length) return null;
  const pref = ['economy', 'infrastructure', 'industry', 'energy', 'society', 'agriculture', 'military'];
  options.sort((a, b) => pref.indexOf(a.category) - pref.indexOf(b.category) || techCost(state, a.id) - techCost(state, b.id));
  const t = options[0];
  return offer('Forschung starten', [{ cmd: { type: 'setResearch', techId: t.id }, text: `Forschungsprojekt „${t.name}“ starten` }], 'Bringt nach Abschluss dauerhafte Vorteile.');
}

export function tradeFix(state, c, partnerId) {
  const p = state.countries[partnerId];
  if (!p) return null;
  const v = evaluateProposal(state, c.id, partnerId, 'trade');
  if (v.accept) return offer(`Handelsabkommen mit ${p.name}`, [{ cmd: { type: 'proposeTreaty', targetId: partnerId, treaty: 'trade' }, text: `${p.name} ein Handelsabkommen vorschlagen (wird voraussichtlich angenommen)` }], 'Beseitigt Rohstoffmangel und bringt Handelsgewinne.');
  return offer(`Beziehungen zu ${p.name} verbessern`, [{ cmd: { type: 'improveRelations', targetId: partnerId }, text: `Diplomatische Initiative gegenüber ${p.name} (für ein späteres Handelsabkommen)` }], 'Ein Handelsabkommen wird wahrscheinlicher.');
}

export function militaryFundingFix(c) {
  const need = ((c.military.spending?.upkeepNeed ?? 0) * 12 * 1.08) / c.economy.gdp;
  return offer('Militärbudget anpassen', [budgetChange(c, 'military', Math.max(c.budget.military, need))], 'Der Unterhalt der Streitkräfte ist wieder gedeckt.');
}

export function defenseFix(c) {
  return offer('Verteidigung stärken', [
    { cmd: { type: 'quickOrder', order: 'infantry' }, text: 'Einen Infanterieverband aufstellen' },
    { cmd: { type: 'quickOrder', order: 'fighters' }, text: 'Kampfjets bestellen' },
    c.military.mobilization === 0 ? { cmd: { type: 'setMobilization', level: 1 }, text: 'Teilmobilmachung anordnen' } : null,
  ], 'Mehr Abschreckung – kostet Geld und etwas Zustimmung.');
}

/** Losing a war: defend and offer a white peace if the enemy would accept it. */
export function losingWarFix(state, c, war) {
  const side = sideOf(war, c.id);
  const items = [{ cmd: { type: 'setFrontStance', stance: 'defensive' }, text: 'Generalstab auf „Verteidigen“ stellen' }];
  if (war[side][0] === c.id && evaluatePeace(state, war, side, { whitePeace: true }).accept) {
    items.push({ cmd: { type: 'proposePeace', warId: war.id, terms: { whitePeace: true } }, text: 'Weißen Frieden anbieten (wird voraussichtlich angenommen)' });
  } else {
    items.push({ cmd: { type: 'quickOrder', order: 'infantry' }, text: 'Verstärkung: einen Infanterieverband aufstellen' });
  }
  return offer('Lage stabilisieren', items, 'Weniger Verluste; ein Frieden beendet den Krieg zu Vorkriegsgrenzen.');
}

/** Winning a war: ask for as many occupied regions as the enemy would accept. */
export function winningWarFix(state, c, war) {
  const side = sideOf(war, c.id);
  if (war[side][0] !== c.id) return null;
  const enemy = new Set(war[otherSide(side)]);
  const friends = new Set(war[side]);
  const goals = new Set(war.goals.filter((g) => g.type === 'region').map((g) => g.regionId));
  const occupied = Object.values(state.regions)
    .filter((r) => enemy.has(r.owner) && friends.has(r.controller))
    .sort((a, b) => Number(goals.has(b.id)) - Number(goals.has(a.id)) || b.econ - a.econ);
  const terms = { regions: [], reparations: 0, reparationsFrom: war[otherSide(side)][0] };
  for (const r of occupied) {
    const next = { ...terms, regions: [...terms.regions, r.id] };
    if (evaluatePeace(state, war, side, next).accept) terms.regions = next.regions;
  }
  if (!terms.regions.length) return null;
  return offer('Siegfrieden schließen', [{ cmd: { type: 'proposePeace', warId: war.id, terms }, text: `Frieden vorschlagen: Abtretung von ${terms.regions.map((rid) => STATIC_REGIONS[rid].name).join(', ')} (wird voraussichtlich angenommen)` }], 'Beendet den Krieg mit Gebietsgewinnen, bevor die Kriegsmüdigkeit steigt.');
}

export function growthFix(c) {
  const deficit = (-c.economy.lastBalance * 12) / c.economy.gdp;
  if (deficit > 0.03) return balanceBudgetFix(c, { atWar: !!c.military?.atWar });
  return offer('Wirtschaft ankurbeln', [budgetChange(c, 'infrastructure', c.budget.infrastructure + 0.005), budgetChange(c, 'research', c.budget.research + 0.002)], 'Mehr Wachstum in den nächsten Jahren, höhere Ausgaben.');
}
