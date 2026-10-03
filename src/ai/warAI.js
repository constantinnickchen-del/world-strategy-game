/**
 * Strategic war AI: decides whether to prepare and start wars, and when to
 * make peace. Decisions are based on interests (claims, resources, rivalry,
 * opportunity) weighed against risks (relative power incl. likely allies,
 * deterrence, government type, stability, exhaustion, trade dependence).
 *
 * A war is never started on a whim: the country first plans it (claims,
 * mobilisation, troop build-up at the border – which can trigger a warning to
 * the player), and declares only if the situation still justifies it.
 */
import { DIFFICULTIES } from '../data/difficulty.js';
import { executeCommand } from '../commands/commands.js';
import { STATIC_REGIONS, neighborCountryIds } from '../state/worldIndex.js';
import { RESOURCE_IDS } from '../data/resources.js';
import { getOpinion, alliesOf, hasTreaty } from '../systems/diplomacy.js';
import { warsOf, isAtWar, sideOf, otherSide, hasTruce, regionWeight, peaceCost, isCapitalRegion } from '../systems/war/wars.js';
import { fireEvent } from '../systems/events.js';
import { addNews } from '../systems/news.js';

export const WAR_PLAN_DAYS = 90;
export const WAR_SCORE_THRESHOLD = 65;
/** Without a real interest (claims, resource dependency, hostility) military superiority alone never leads to war. */
export const MIN_INTEREST = 35;
const PEACE_INTERVAL_DAYS = 60;

function cmd(state, ctx, c, type, payload) {
  return executeCommand(state, { type, countryId: c.id, ...payload }, ctx);
}

function sidePower(state, countryId, extraAllyWeight) {
  let p = state.countries[countryId].military.power;
  for (const a of alliesOf(state, countryId)) p += state.countries[a].military.power * extraAllyWeight;
  return p;
}

/** Deterministic evaluation of attacking `targetId`. */
export function evaluateWarTarget(state, c, targetId) {
  const t = state.countries[targetId];
  const reasons = [];
  const add = (text, value) => {
    if (Math.abs(value) >= 0.5) reasons.push({ text, value: Math.round(value) });
  };
  if (!t || t.eliminated || hasTruce(state, c.id, targetId) || hasTreaty(state, c.id, targetId, 'alliance') || hasTreaty(state, c.id, targetId, 'nonAggression')) {
    return { score: -999, goals: [], reasons: [{ text: 'Nicht möglich', value: -999 }] };
  }
  const border = t.regionIds.filter((rid) => STATIC_REGIONS[rid].neighbors.some((n) => state.regions[n]?.owner === c.id));
  // interests
  let claims = 0;
  const goalCandidates = [];
  for (const rid of t.regionIds) {
    const r = state.regions[rid];
    const core = r.cores.includes(c.id);
    if (core || r.claims.includes(c.id)) {
      claims += core ? 45 : 30;
      goalCandidates.push({ rid, value: 100 });
    }
  }
  add('Gebietsansprüche', Math.min(70, claims));
  let resources = 0;
  for (const rid of RESOURCE_IDS) {
    const res = c.resources[rid];
    if (res.consumption <= 0) continue;
    const dependency = Math.max(0, (res.consumption - res.production) / res.consumption);
    if (dependency < 0.5) continue;
    for (const reg of border) {
      const cap = state.regions[reg].resources[rid] ?? 0;
      if (cap > res.consumption * 0.15) {
        const v = Math.min(15, (cap / res.consumption) * 30 * dependency);
        resources += v;
        goalCandidates.push({ rid: reg, value: 40 + v });
      }
    }
  }
  add('Rohstoffinteressen', Math.min(25, resources));
  const opinion = getOpinion(state, c.id, targetId);
  add('Feindschaft', Math.max(0, -50 - opinion) * 0.6);
  if (isAtWar(state, targetId)) add('Gegner ist anderweitig gebunden', 15);
  const powerRatio = c.military.power / Math.max(1, t.military.power);
  if (isAmbitious(c) && powerRatio > 2.5) add('Machtstreben', 15);
  if (t.politics.stability < 30) add('Instabilität des Gegners', 10);
  const rawInterest = reasons.reduce((s, r) => s + r.value, 0);
  const interest = rawInterest * (0.5 + c.ai.personality.militarism);
  // risks
  const risks = [];
  const riskAdd = (text, value) => risks.push({ text, value: Math.round(value) });
  const ratio = sidePower(state, c.id, 0.4) / Math.max(1, sidePower(state, targetId, 0.7));
  if (ratio < 1.6) riskAdd('Unzureichende Überlegenheit', -100);
  else riskAdd('Militärische Überlegenheit', Math.min(30, (ratio - 1.6) * 10));
  if (t.military.deterrent) riskAdd('Strategische Abschreckung', c.military.deterrent ? -90 : -220);
  const gov = c.politics.government;
  if (gov === 'democracy') riskAdd('Demokratische Kontrolle', -70);
  else if (gov === 'hybrid') riskAdd('Innenpolitische Risiken', -15);
  if (c.politics.stability < 40) riskAdd('Geringe Stabilität', -25);
  if (c.military.exhaustion > 0.1) riskAdd('Kriegsmüdigkeit', -60);
  if (isAtWar(state, c.id)) riskAdd('Bereits im Krieg', -120);
  const bigFriends = alliesOf(state, targetId).filter((a) => state.countries[a].military.power > c.military.power * 1.5);
  if (bigFriends.length) riskAdd('Gegner hat mächtige Verbündete', -70);
  const tradeShare = c.trade.partners.find((p) => p.id === targetId)?.value ?? 0;
  if (tradeShare > 0) riskAdd('Handelsabhängigkeit', -Math.min(30, (tradeShare / Math.max(1, c.trade.imports + c.trade.exports)) * 100));
  if (!border.length) riskAdd('Keine gemeinsame Grenze', -60);
  if (targetId === state.playerId && t.difficulty) {
    const d = DIFFICULTIES[t.difficulty];
    if (d.warTargetScore === null) return { score: -999, goals: [], reasons: [{ text: 'Schwierigkeitsgrad', value: -999 }] };
    if (d.warTargetScore) riskAdd('Schwierigkeitsgrad', d.warTargetScore);
  }
  const risk = risks.reduce((s, r) => s + r.value, 0);
  // goals: claimed regions first, then valuable border regions
  const goals = [];
  const seen = new Set();
  for (const g of goalCandidates.sort((a, b) => b.value - a.value)) {
    if (seen.has(g.rid) || goals.length >= 3) continue;
    seen.add(g.rid);
    goals.push({ type: 'region', regionId: g.rid });
  }
  if (!goals.length && border.length) {
    const best = [...border].sort((a, b) => regionWeight(state, b) - regionWeight(state, a))[0];
    goals.push({ type: 'region', regionId: best });
  }
  const score = rawInterest < MIN_INTEREST ? Math.min(0, Math.round(interest + risk)) : Math.round(interest + risk);
  return { score, goals, reasons: [...reasons, ...risks], ratio, interest: rawInterest };
}

/** Militaristic non-democracies pursue expansion. */
export function isAmbitious(c) {
  return c.politics.government !== 'democracy' && c.ai.personality.militarism > 0.6;
}

/**
 * Ambitious regimes occasionally raise a territorial claim against a much
 * weaker neighbour (most valuable border region). Claims are visible to
 * everybody long before a war can follow.
 */
function pursueAmbitions(state, c, ctx) {
  if (!isAmbitious(c) || !ctx.rng.chance(0.03)) return;
  const options = [];
  for (const id of neighborCountryIds(state, c.id)) {
    const t = state.countries[id];
    if (t.eliminated || hasTreaty(state, c.id, id, 'alliance') || hasTreaty(state, c.id, id, 'nonAggression')) continue;
    if (c.military.power / Math.max(1, t.military.power) < 2.5) continue;
    for (const rid of t.regionIds) {
      const r = state.regions[rid];
      if (r.claims.includes(c.id) || r.cores.includes(c.id)) continue;
      if (!STATIC_REGIONS[rid].neighbors.some((n) => state.regions[n]?.owner === c.id)) continue;
      const res = Object.values(r.resources).reduce((s, v) => s + v, 0);
      options.push({ rid, value: regionWeight(state, rid) + res * 0.01 });
    }
  }
  if (!options.length) return;
  const best = options.sort((a, b) => b.value - a.value || (a.rid < b.rid ? -1 : 1))[0];
  cmd(state, ctx, c, 'fabricateClaim', { regionId: best.rid });
}

function considerNewWar(state, c, ctx) {
  if (c.ai.personality.militarism < 0.25 || c.economy.gdp < 3) return;
  if ((c.ai.noWarUntil ?? 0) > state.time.day) return; // memory of the last war
  const candidates = neighborCountryIds(state, c.id);
  let best = null;
  for (const id of candidates) {
    const ev = evaluateWarTarget(state, c, id);
    if (ev.score > (best?.score ?? -Infinity)) best = { id, ...ev };
  }
  if (!best || best.score < WAR_SCORE_THRESHOLD || !best.goals.length) return;
  c.ai.warPlan = { target: best.id, goals: best.goals, readyDay: state.time.day + WAR_PLAN_DAYS, startedDay: state.time.day };
  // claims make the war more legitimate
  for (const g of best.goals) {
    const r = state.regions[g.regionId];
    if (!r.claims.includes(c.id) && !r.cores.includes(c.id)) cmd(state, ctx, c, 'fabricateClaim', { regionId: g.regionId });
  }
  if (best.id === state.playerId) {
    fireEvent(state, 'warTension', state.playerId, { otherId: c.id, data: { attacker: c.id, defender: state.playerId, pauseKind: 'diplomaticCrisis' } }, ctx);
    ctx.bus?.emit('interrupt', { kind: 'diplomaticCrisis', countryId: c.id });
  } else if (alliesOf(state, best.id).includes(state.playerId) || neighborCountryIds(state, state.playerId ?? '').includes(c.id)) {
    addNews(state, { category: 'world', countryId: c.id, others: [best.id], importance: 2, text: `Spannungen: ${c.name} zieht Truppen an der Grenze zu ${state.countries[best.id].name} zusammen.` });
  }
}

function executeWarPlan(state, c, ctx) {
  const plan = c.ai.warPlan;
  const t = state.countries[plan.target];
  if (!t || t.eliminated) {
    c.ai.warPlan = null;
    return;
  }
  if (state.time.day < plan.readyDay) return;
  const ev = evaluateWarTarget(state, c, plan.target);
  c.ai.warPlan = null;
  if (ev.score < WAR_SCORE_THRESHOLD - 15) {
    if (plan.target === state.playerId) addNews(state, { category: 'diplomacy', countryId: c.id, others: [plan.target], importance: 2, text: `Entspannung: ${c.name} zieht Truppen von der Grenze ab.` });
    return;
  }
  const goals = plan.goals.filter((g) => state.regions[g.regionId]?.owner === plan.target);
  if (goals.length) cmd(state, ctx, c, 'declareWar', { targetId: plan.target, goals });
}

function managePeace(state, c, ctx) {
  for (const w of warsOf(state, c.id)) {
    const side = sideOf(w, c.id);
    if (w[side][0] !== c.id) continue;
    if (w.lastPeaceProposal?.[c.id] !== undefined && state.time.day - w.lastPeaceProposal[c.id] < PEACE_INTERVAL_DAYS) continue;
    const myScore = side === 'attackers' ? w.score : -w.score;
    const enemy = otherSide(side);
    const months = (state.time.day - w.startDay) / 30.44;
    if (myScore >= 25) {
      // demand occupied goals (or valuable occupied regions) as far as the score allows
      const friends = new Set(w[side]);
      const occupied = Object.values(state.regions).filter((r) => w[enemy].includes(r.owner) && friends.has(r.controller) && !isCapitalRegion(state, r.id)).map((r) => r.id);
      const goalIds = new Set(w.goals.filter((g) => g.type === 'region').map((g) => g.regionId));
      occupied.sort((a, b) => (goalIds.has(b) ? 1 : 0) - (goalIds.has(a) ? 1 : 0) || regionWeight(state, b) - regionWeight(state, a));
      const regions = [];
      for (const rid of occupied) {
        const next = [...regions, rid];
        if (peaceCost(state, w, { regions: next, reparationsFrom: w[enemy][0] }) <= myScore + 10) regions.push(rid);
      }
      if (regions.length) {
        cmd(state, ctx, c, 'proposePeace', { warId: w.id, terms: { regions, reparations: 0 } });
        continue;
      }
    }
    if (myScore <= -30 || c.military.exhaustion > 0.55 || (months > 24 && Math.abs(myScore) < 20)) {
      cmd(state, ctx, c, 'proposePeace', { warId: w.id, terms: { whitePeace: true } });
    }
  }
}

export function warAdvisor(state, c, ctx) {
  if (isAtWar(state, c.id)) {
    c.ai.warPlan = null;
    managePeace(state, c, ctx);
    return;
  }
  if (c.ai.warPlan) executeWarPlan(state, c, ctx);
  else {
    pursueAmbitions(state, c, ctx);
    considerNewWar(state, c, ctx);
  }
}
