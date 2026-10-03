/**
 * Diplomacy: relations, treaties, embargoes and proposal evaluation.
 *
 * Relations are stored sparsely in `state.diplomacy.relations` keyed by a
 * sorted pair "AAA|BBB". Pairs that were never touched use a computed default
 * opinion, so 190 countries do not need ~18 000 stored entries.
 */
import { STATIC_COUNTRIES, areNeighbors } from '../state/worldIndex.js';

export const TREATIES = {
  trade: { name: 'Handelsabkommen', opinionBonus: 10, minOpinion: 0 },
  nonAggression: { name: 'Nichtangriffspakt', opinionBonus: 8, minOpinion: -10 },
  alliance: { name: 'Militärbündnis', opinionBonus: 25, minOpinion: 45 },
};
export const EMBARGO_OPINION_PENALTY = 30;
export const IMPROVE_RELATIONS = { opinion: 8, cooldownDays: 180, costGdpShare: 0.0002, minCost: 0.05 };

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function defaultOpinion(state, a, b) {
  const ca = state.countries[a];
  const cb = state.countries[b];
  const sa = STATIC_COUNTRIES[a];
  const sb = STATIC_COUNTRIES[b];
  let o = 0;
  if (sa && sb) {
    if (sa.continent === sb.continent) o += 5;
    if (sa.subregion === sb.subregion) o += 8;
  }
  if (ca && cb) {
    const ga = ca.politics.government;
    const gb = cb.politics.government;
    if (ga === gb) o += ga === 'democracy' ? 12 : 6;
    else if ((ga === 'democracy' && gb !== 'hybrid') || (gb === 'democracy' && ga !== 'hybrid')) o -= 10;
  }
  return o;
}

export function getRelation(state, a, b) {
  return state.diplomacy.relations[pairKey(a, b)] ?? null;
}

/** Returns the stored relation, creating it with default values when missing. */
export function ensureRelation(state, a, b) {
  const key = pairKey(a, b);
  let rel = state.diplomacy.relations[key];
  if (!rel) {
    const base = defaultOpinion(state, a, b);
    rel = { base, opinion: base, treaties: {}, embargoes: [], lastImprove: {} };
    state.diplomacy.relations[key] = rel;
  }
  return rel;
}

export function getOpinion(state, a, b) {
  if (a === b) return 100;
  const rel = getRelation(state, a, b);
  return rel ? rel.opinion : defaultOpinion(state, a, b);
}

export function changeOpinion(state, a, b, delta) {
  const rel = ensureRelation(state, a, b);
  rel.opinion = clampOpinion(rel.opinion + delta);
  return rel.opinion;
}

function clampOpinion(v) {
  return Math.max(-100, Math.min(100, v));
}

export function hasTreaty(state, a, b, treaty) {
  return !!getRelation(state, a, b)?.treaties[treaty];
}

export function setTreaty(state, a, b, treaty, active) {
  if (!(treaty in TREATIES)) throw new Error(`Unknown treaty ${treaty}`);
  const rel = ensureRelation(state, a, b);
  if (active) {
    rel.treaties[treaty] = state.time.day;
    if (treaty === 'alliance') rel.treaties.nonAggression ??= state.time.day;
  } else {
    delete rel.treaties[treaty];
  }
}

export function hasEmbargo(state, actor, target) {
  return !!getRelation(state, actor, target)?.embargoes.includes(actor);
}

/** True if trade between a and b is blocked in either direction. */
export function tradeBlocked(state, a, b) {
  const rel = getRelation(state, a, b);
  return !!rel && rel.embargoes.length > 0;
}

export function setEmbargo(state, actor, target, active) {
  const rel = ensureRelation(state, actor, target);
  const has = rel.embargoes.includes(actor);
  if (active && !has) rel.embargoes.push(actor);
  if (!active && has) rel.embargoes = rel.embargoes.filter((x) => x !== actor);
}

export function treatiesOf(state, countryId) {
  const out = [];
  for (const [key, rel] of Object.entries(state.diplomacy.relations)) {
    const [a, b] = key.split('|');
    if (a !== countryId && b !== countryId) continue;
    const other = a === countryId ? b : a;
    for (const t of Object.keys(rel.treaties)) out.push({ other, treaty: t, since: rel.treaties[t] });
    for (const actor of rel.embargoes) out.push({ other, treaty: 'embargo', actor });
  }
  return out;
}

export function alliesOf(state, countryId) {
  return treatiesOf(state, countryId)
    .filter((t) => t.treaty === 'alliance')
    .map((t) => t.other);
}

/**
 * Deterministic evaluation of a treaty proposal from `from` to `to`.
 * Used by AI decision making and shown to the player as an acceptance forecast.
 * @returns {{accept:boolean, score:number, reasons:{text:string,value:number}[]}}
 */
export function evaluateProposal(state, from, to, treaty) {
  const reasons = [];
  const add = (text, value) => {
    if (value !== 0) reasons.push({ text, value: Math.round(value) });
  };
  const target = state.countries[to];
  const proposer = state.countries[from];
  const opinion = getOpinion(state, from, to);
  add('Meinung', opinion);
  if (tradeBlocked(state, from, to)) add('Embargo besteht', -60);

  if (treaty === 'trade') {
    add('Grundhaltung zu Handel', 15);
    const sizeRatio = proposer.economy.gdp / Math.max(1, target.economy.gdp);
    add('Größe des Marktes', Math.max(-10, Math.min(20, Math.log10(sizeRatio) * 10)));
    add('Wirtschaftsorientierung', (target.ai.personality.economy - 0.5) * 20);
  } else if (treaty === 'nonAggression') {
    add('Grundhaltung', 0);
    if (areNeighbors(state, from, to)) add('Gemeinsame Grenze', 10);
    add('Militärische Stärke des Partners', Math.min(15, (proposer.military.power / Math.max(1, target.military.power) - 1) * 5));
  } else if (treaty === 'alliance') {
    add('Zurückhaltung bei Bündnissen', -45);
    if (proposer.politics.government === target.politics.government) add('Gleiche Regierungsform', 10);
    add('Militärische Stärke des Partners', Math.max(-10, Math.min(20, Math.log10(Math.max(1, proposer.military.power) / Math.max(1, target.military.power)) * 15)));
    add('Diplomatische Persönlichkeit', (target.ai.personality.diplomacy - 0.5) * 20);
    // Allies of a rival are not welcome
    const rivals = alliesOf(state, from).filter((x) => getOpinion(state, to, x) < -40);
    if (rivals.length) add('Partner ist mit Rivalen verbündet', -30);
  }
  const score = reasons.reduce((s, r) => s + r.value, 0);
  return { accept: score > 0, score, reasons };
}

/** Opinion each relation drifts towards. */
export function targetOpinion(rel) {
  let t = rel.base;
  for (const k of Object.keys(rel.treaties)) t += TREATIES[k]?.opinionBonus ?? 0;
  if (rel.embargoes.length) t -= EMBARGO_OPINION_PENALTY;
  return clampOpinion(t);
}

export const diplomacySystem = {
  id: 'diplomacy',
  monthly(state) {
    for (const rel of Object.values(state.diplomacy.relations)) {
      const t = targetOpinion(rel);
      rel.opinion = clampOpinion(rel.opinion + (t - rel.opinion) * 0.03);
      // tiny values are rounded so saves stay compact
      rel.opinion = Math.round(rel.opinion * 100) / 100;
    }
  },
};
