/**
 * Wars: declaration, participants, alliances, war score, exhaustion, peace.
 *
 * War record (state.wars[]):
 *   { id, name, attackers[], defenders[], startDay, goals[], score, battles{attackers,defenders},
 *     casualties{countryId:n}, losses{countryId:{aircraft,ships}}, status, endDay, outcome,
 *     airSuperiority, navalSuperiority, blockade{countryId:share} }
 * Goals: { type: 'region', regionId } | { type: 'reparations', amount } (always demanded by the attackers)
 *
 * onWarDeclared() is the single entry point that every new war passes through
 * (player declaration, AI declaration, alliance escalation). It stops the
 * clock immediately through an 'interrupt' bus event and informs the player.
 */
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { transferRegion, setController } from '../../state/territory.js';
import { getOpinion, changeOpinion, alliesOf, hasTreaty, setTreaty, ensureRelation, pairKey } from '../diplomacy.js';
import { addNews } from '../news.js';
import { fireEvent } from '../events.js';
import { setMobilization } from '../military/manpower.js';
import { formatDateDE } from '../../core/calendar.js';
import { formatBn } from '../../util/format.js';
import { clamp } from '../../util/math.js';

export const TRUCE_DAYS = 5 * 365;

export function activeWars(state) {
  return (state.wars ?? []).filter((w) => w.status === 'active');
}

export function warsOf(state, countryId) {
  return activeWars(state).filter((w) => w.attackers.includes(countryId) || w.defenders.includes(countryId));
}

export function isAtWar(state, countryId) {
  return warsOf(state, countryId).length > 0;
}

export function sideOf(war, countryId) {
  if (war.attackers.includes(countryId)) return 'attackers';
  if (war.defenders.includes(countryId)) return 'defenders';
  return null;
}

export function otherSide(side) {
  return side === 'attackers' ? 'defenders' : 'attackers';
}

export function areEnemies(state, a, b) {
  for (const w of activeWars(state)) {
    const sa = sideOf(w, a);
    const sb = sideOf(w, b);
    if (sa && sb && sa !== sb) return w;
  }
  return null;
}

export function enemiesOf(state, countryId) {
  const out = new Set();
  for (const w of warsOf(state, countryId)) for (const id of w[otherSide(sideOf(w, countryId))]) out.add(id);
  return [...out];
}

/** Countries on the same side as `countryId` in any war (incl. itself). */
export function comradesOf(state, countryId) {
  const out = new Set([countryId]);
  for (const w of warsOf(state, countryId)) for (const id of w[sideOf(w, countryId)]) out.add(id);
  return [...out];
}

export function hasTruce(state, a, b) {
  const until = state.truces?.[pairKey(a, b)];
  return until !== undefined && until > state.time.day;
}

/** Strategic weight of a region for its owner (0..1 of the owner's total). */
export function regionWeight(state, regionId) {
  const r = state.regions[regionId];
  const owner = state.countries[r.owner];
  if (!owner) return 0;
  let pop = 0;
  let econ = 0;
  for (const rid of owner.regionIds) {
    pop += state.regions[rid].population;
    econ += state.regions[rid].econ;
  }
  const w = 0.5 * (r.population / Math.max(1, pop)) + 0.5 * (r.econ / Math.max(1e-6, econ));
  return owner.capitalRegion === regionId ? Math.min(1, w * 1.6 + 0.05) : w;
}

/** Capital regions are never ceded in a peace treaty (states are not annexed by treaty). */
export function isCapitalRegion(state, regionId) {
  const r = state.regions[regionId];
  return !!r && state.countries[r.owner]?.capitalRegion === regionId;
}

/** Population and economic output of a whole war side (all members). */
export function sideTotals(state, ids) {
  let pop = 0;
  let econ = 0;
  for (const id of ids) {
    const c = state.countries[id];
    if (!c) continue;
    for (const rid of c.regionIds) {
      pop += state.regions[rid].population;
      econ += state.regions[rid].econ;
    }
  }
  return { pop, econ };
}

/**
 * Weight of a region for a whole war side: a region of a small member counts
 * little against a large coalition (occupying Montenegro does not defeat NATO).
 * For a side with a single country this equals regionWeight().
 */
export function sideRegionWeight(state, regionId, totals) {
  const r = state.regions[regionId];
  const owner = state.countries[r.owner];
  if (!owner || !totals.pop) return 0;
  const own = sideTotals(state, [owner.id]);
  const ownerShare = 0.5 * (own.pop / totals.pop) + 0.5 * (own.econ / Math.max(1e-6, totals.econ));
  return regionWeight(state, regionId) * Math.min(1, ownerShare);
}

function warName(state, attacker, defender) {
  const a = state.countries[attacker].name;
  const d = state.countries[defender].name;
  const n = (state.wars ?? []).filter((w) => w.attackers[0] === attacker && w.defenders[0] === defender).length;
  return `${a}–${d}-Krieg${n ? ` (${n + 1})` : ''}`;
}

/** Validation for a declaration of war (also used by the UI). */
export function declareWarError(state, attackerId, defenderId, goals = []) {
  const a = state.countries[attackerId];
  const d = state.countries[defenderId];
  if (!a || !d || d.eliminated || a.eliminated) return 'Unbekanntes Land.';
  if (attackerId === defenderId) return 'Nicht gegen das eigene Land möglich.';
  if (areEnemies(state, attackerId, defenderId)) return 'Sie befinden sich bereits im Krieg mit diesem Land.';
  if (hasTruce(state, attackerId, defenderId)) return `Waffenstillstand bis ${formatDateDE(state.truces[pairKey(attackerId, defenderId)])}.`;
  if (hasTreaty(state, attackerId, defenderId, 'alliance')) return 'Zuerst das Bündnis kündigen.';
  if (hasTreaty(state, attackerId, defenderId, 'nonAggression')) return 'Zuerst den Nichtangriffspakt kündigen.';
  if (!goals.length) return 'Mindestens ein Kriegsziel festlegen.';
  for (const g of goals) {
    if (g.type === 'region') {
      const r = state.regions[g.regionId];
      if (!r) return 'Unbekannte Zielregion.';
      if (r.owner !== defenderId && !alliesOf(state, defenderId).includes(r.owner)) return `${STATIC_REGIONS[g.regionId].name} gehört nicht zum Gegner.`;
    } else if (g.type === 'reparations') {
      if (!(g.amount > 0)) return 'Ungültige Reparationsforderung.';
    } else return 'Unbekanntes Kriegsziel.';
  }
  return null;
}

/** Will an AI country honour an alliance call? (deterministic, explainable) */
export function willJoinWar(state, countryId, war, side) {
  const c = state.countries[countryId];
  if (!c || c.eliminated) return false;
  const leader = war[side][0];
  const enemyLeader = war[otherSide(side)][0];
  if (hasTreaty(state, countryId, enemyLeader, 'alliance')) return false;
  if (warsOf(state, countryId).length >= 2) return false;
  const opinion = getOpinion(state, countryId, leader);
  const enemyOpinion = getOpinion(state, countryId, enemyLeader);
  let score = opinion * 0.6 - enemyOpinion * 0.4 + (c.ai.personality.militarism - 0.5) * 40;
  if (side === 'defenders' && hasTreaty(state, countryId, leader, 'alliance')) score += 40;
  if (state.countries[enemyLeader].military.deterrent && !c.military.deterrent) score -= 25;
  return score > 25;
}

/** Puts a country into a war on one side. */
export function joinWar(state, war, countryId, side, ctx, { announce = true } = {}) {
  if (sideOf(war, countryId)) return;
  war[side].push(countryId);
  war.casualties[countryId] = 0;
  for (const enemy of war[otherSide(side)]) {
    setTreaty(state, countryId, enemy, 'trade', false);
    setTreaty(state, countryId, enemy, 'nonAggression', false);
    setTreaty(state, countryId, enemy, 'alliance', false);
    changeOpinion(state, countryId, enemy, -30);
  }
  if (announce) {
    addNews(state, {
      category: 'world',
      countryId,
      others: [war[side][0], war[otherSide(side)][0]],
      importance: countryId === state.playerId || war[side].includes(state.playerId) || war[otherSide(side)].includes(state.playerId) ? 3 : 2,
      text: `${state.countries[countryId].name} tritt auf Seite von ${state.countries[war[side][0]].name} in den ${war.name} ein.`,
    });
  }
  if (state.playerId && war[otherSide(side)].includes(state.playerId)) ctx?.bus?.emit('interrupt', { kind: 'warJoined', warId: war.id, countryId });
  ctx?.bus?.emit('war:changed', war);
}

/**
 * Declares a war. Returns the war record. All validation must happen before.
 */
export function declareWar(state, attackerId, defenderId, goals, ctx) {
  state.world.seq = (state.world.seq ?? 0) + 1;
  const war = {
    id: `W${state.world.seq}`,
    name: warName(state, attackerId, defenderId),
    attackers: [attackerId],
    defenders: [defenderId],
    startDay: state.time.day,
    goals: goals.map((g) => ({ ...g })),
    score: 0,
    battles: { attackers: 0, defenders: 0 },
    casualties: { [attackerId]: 0, [defenderId]: 0 },
    losses: {},
    status: 'active',
    endDay: null,
    outcome: null,
    airSuperiority: 0.5,
    navalSuperiority: 0.5,
    blockade: {},
  };
  state.wars.push(war);
  const a = state.countries[attackerId];
  const d = state.countries[defenderId];
  // break treaties between the two
  setTreaty(state, attackerId, defenderId, 'trade', false);
  ensureRelation(state, attackerId, defenderId);
  changeOpinion(state, attackerId, defenderId, -40);
  // legitimacy: wars without claims cost stability and international standing
  const claimed = goals.some((g) => g.type === 'region' && (state.regions[g.regionId].claims.includes(attackerId) || state.regions[g.regionId].cores.includes(attackerId)));
  a.politics.stability = clamp(a.politics.stability - (claimed ? 3 : 10), 0, 100);
  a.politics.approval = clamp(a.politics.approval - (claimed ? 0 : 6), 0, 100);
  // allies of the defender are called to arms
  for (const ally of alliesOf(state, defenderId)) {
    if (ally === attackerId || sideOf(war, ally)) continue;
    if (ally === state.playerId) continue; // the player decides via the alliance call event
    if (willJoinWar(state, ally, war, 'defenders')) joinWar(state, war, ally, 'defenders', ctx, { announce: false });
    else {
      setTreaty(state, ally, defenderId, 'alliance', false);
      changeOpinion(state, ally, defenderId, -40);
    }
  }
  // allies of the attacker join only if they share the hostility
  for (const ally of alliesOf(state, attackerId)) {
    if (sideOf(war, ally) || ally === state.playerId) continue;
    if (getOpinion(state, ally, defenderId) < -40 && willJoinWar(state, ally, war, 'attackers')) joinWar(state, war, ally, 'attackers', ctx, { announce: false });
  }
  // rally around the flag and immediate mobilisation of AI belligerents
  d.politics.approval = clamp(d.politics.approval + 8, 0, 100);
  for (const id of [...war.attackers, ...war.defenders]) {
    const c = state.countries[id];
    if (id !== state.playerId && c.military.mobilization < (war.defenders.includes(id) ? 2 : 1)) setMobilization(state, c, war.defenders.includes(id) ? 2 : 1);
  }
  onWarDeclared(state, war, ctx, { claimed });
  return war;
}

/**
 * Central reaction to every war outbreak: stop the clock, inform, react.
 */
export function onWarDeclared(state, war, ctx, { claimed = false } = {}) {
  const attacker = state.countries[war.attackers[0]];
  const defender = state.countries[war.defenders[0]];
  const player = state.playerId;
  war.declaredOn = state.time.day;
  const goalText = war.goals
    .filter((g) => g.type === 'region')
    .map((g) => STATIC_REGIONS[g.regionId].name)
    .join(', ');
  addNews(state, {
    category: 'world',
    countryId: attacker.id,
    others: [defender.id],
    importance: 3,
    text: `KRIEG: ${attacker.name} hat ${defender.name} den Krieg erklärt${goalText ? ` (Ziele: ${goalText})` : ''}.`,
  });
  const joined = [...war.attackers.slice(1), ...war.defenders.slice(1)];
  addNews(state, {
    category: 'world',
    countryId: attacker.id,
    others: [defender.id, ...joined],
    importance: 2,
    text: `Internationale Reaktionen nehmen zu.${joined.length ? ` Bündnisfall: ${joined.map((id) => state.countries[id].name).join(', ')} ${joined.length > 1 ? 'treten' : 'tritt'} dem Krieg bei.` : ''}`,
  });
  // world opinion
  for (const id of state.countryOrder) {
    if (id === attacker.id || sideOf(war, id) || state.countries[id].eliminated) continue;
    const fondness = getOpinion(state, id, defender.id);
    if (fondness > 30) changeOpinion(state, id, attacker.id, claimed ? -6 : -12);
  }
  // decide what the player sees
  let kind = 'warDeclared';
  if (war.defenders.includes(player) && war.defenders[0] === player) kind = 'attackOnPlayer';
  else if (war.attackers[0] === player) kind = 'playerDeclared';
  else if (player && hasTreaty(state, player, defender.id, 'alliance') && !sideOf(war, player)) kind = 'allianceCall';
  // a tension warning about this attacker is overtaken by events
  const opposed = (a, b) => {
    const sa = sideOf(war, a);
    const sb = sideOf(war, b);
    return !!sa && !!sb && sa !== sb;
  };
  state.events.pending = state.events.pending.filter((e) => !(e.eventId === 'warTension' && opposed(e.data?.attacker, e.data?.defender)));
  if (player && kind !== 'playerDeclared') {
    const eventId = { attackOnPlayer: 'warAttackOnPlayer', allianceCall: 'warAllianceCall', warDeclared: 'warCrisis' }[kind];
    fireEvent(state, eventId, player, { otherId: attacker.id, data: { warId: war.id, attacker: attacker.id, defender: defender.id, pauseKind: kind } }, ctx);
  }
  ctx?.bus?.emit('interrupt', { kind, warId: war.id, day: state.time.day });
  ctx?.bus?.emit('war:declared', war);
}

// ------------------------------------------------------------------ war score

/** War score from the attackers' point of view (-100..100). */
export function computeWarScore(state, war) {
  let occ = 0;
  const attackers = new Set(war.attackers);
  const defenders = new Set(war.defenders);
  const totals = { attackers: sideTotals(state, war.attackers), defenders: sideTotals(state, war.defenders) };
  for (const r of Object.values(state.regions)) {
    if (r.owner === r.controller) continue;
    const w = sideRegionWeight(state, r.id, defenders.has(r.owner) ? totals.defenders : totals.attackers) * 100;
    const goalBonus = war.goals.some((g) => g.type === 'region' && g.regionId === r.id) ? 1.5 : 1;
    if (defenders.has(r.owner) && attackers.has(r.controller)) occ += w * goalBonus;
    else if (attackers.has(r.owner) && defenders.has(r.controller)) occ -= w * goalBonus;
  }
  const b = war.battles;
  const battleScore = b.attackers + b.defenders > 0 ? ((b.attackers - b.defenders) / (b.attackers + b.defenders + 4)) * 20 : 0;
  const blockade = (Object.entries(war.blockade).reduce((s, [id, v]) => s + (defenders.has(id) ? v : -v), 0)) * 10;
  // a defender that holds out gains score over time
  const months = (state.time.day - war.startDay) / 30.44;
  const holdOut = occ <= 0 ? -Math.min(15, months * 0.6) : 0;
  return clamp(occ * 1.2 + battleScore + blockade + holdOut, -100, 100);
}

// ------------------------------------------------------------------ peace

/** War score cost of peace terms for the side that has to give in. */
export function peaceCost(state, war, terms) {
  if (terms.whitePeace) return 0;
  let cost = 0;
  // the owner's own loss and what it means for its whole side
  const sideIds = war.attackers.includes(state.regions[(terms.regions ?? [])[0]]?.owner) ? war.attackers : war.defenders;
  const totals = sideTotals(state, sideIds);
  for (const rid of terms.regions ?? []) cost += 4 + regionWeight(state, rid) * 20 + sideRegionWeight(state, rid, totals) * 90;
  if (terms.reparations > 0) {
    const payer = state.countries[terms.reparationsFrom];
    cost += (terms.reparations / Math.max(1, payer?.economy.gdp ?? 1)) * 150;
  }
  return Math.round(cost);
}

export function peaceTermsError(state, war, side, terms) {
  if (!war || war.status !== 'active') return 'Krieg nicht gefunden.';
  if (terms.whitePeace) return null;
  const enemy = new Set(war[otherSide(side)]);
  const friends = new Set(war[side]);
  for (const rid of terms.regions ?? []) {
    const r = state.regions[rid];
    if (!r) return 'Unbekannte Region.';
    if (!enemy.has(r.owner)) return `${STATIC_REGIONS[rid].name} gehört keinem Kriegsgegner.`;
    if (isCapitalRegion(state, rid)) return `${STATIC_REGIONS[rid].name} ist die Hauptstadtregion von ${state.countries[r.owner].name} und kann nicht abgetreten werden.`;
    if (!friends.has(r.controller)) return `${STATIC_REGIONS[rid].name} muss zuerst besetzt werden.`;
  }
  if (!(terms.regions?.length) && !(terms.reparations > 0)) return 'Leere Forderungen – für einen Frieden ohne Forderungen „Weißen Frieden“ wählen.';
  return null;
}

/**
 * Deterministic acceptance check for the side receiving a proposal.
 * `side` = the proposing side. Returns { accept, score, needed, reasons }.
 */
export function evaluatePeace(state, war, side, terms) {
  const receiver = otherSide(side);
  const scoreForProposer = side === 'attackers' ? war.score : -war.score;
  const exhaustionReceiver = Math.max(...war[receiver].map((id) => state.countries[id].military.exhaustion));
  const exhaustionProposer = Math.max(...war[side].map((id) => state.countries[id].military.exhaustion));
  const reasons = [];
  if (terms.whitePeace) {
    // the receiver accepts a return to pre-war borders if it is not winning clearly
    const value = scoreForProposer + exhaustionReceiver * 60 + 10;
    reasons.push({ text: 'Kriegslage aus Sicht des Gegners', value: Math.round(scoreForProposer) }, { text: 'Kriegsmüdigkeit des Gegners', value: Math.round(exhaustionReceiver * 60) }, { text: 'Grundhaltung', value: 10 });
    return { accept: value > 0, score: Math.round(value), needed: 0, reasons };
  }
  const cost = peaceCost(state, war, terms);
  const leverage = scoreForProposer + exhaustionReceiver * 40 - exhaustionProposer * 10;
  reasons.push(
    { text: 'Kriegspunkte', value: Math.round(scoreForProposer) },
    { text: 'Kriegsmüdigkeit des Gegners', value: Math.round(exhaustionReceiver * 40) },
    { text: 'Eigene Kriegsmüdigkeit', value: -Math.round(exhaustionProposer * 10) },
    { text: 'Kosten der Forderungen', value: -cost },
  );
  return { accept: leverage >= cost, score: Math.round(leverage - cost), needed: cost, reasons };
}

/** Ends a war with the given terms (proposed by `side`). */
export function concludePeace(state, war, side, terms, ctx) {
  const winners = new Set(war[side]);
  const all = [...war.attackers, ...war.defenders];
  const transferred = [];
  if (!terms.whitePeace) {
    for (const rid of terms.regions ?? []) {
      const r = state.regions[rid];
      const newOwner = winners.has(r.controller) ? r.controller : war[side][0];
      transferRegion(state, rid, newOwner);
      transferred.push(rid);
    }
    if (terms.reparations > 0) {
      const payer = state.countries[terms.reparationsFrom];
      const receiver = state.countries[war[side][0]];
      payer.economy.treasury -= terms.reparations;
      if (payer.economy.treasury < 0) {
        payer.economy.debt += -payer.economy.treasury;
        payer.economy.treasury = 0;
      }
      receiver.economy.treasury += terms.reparations;
    }
  }
  // everything else returns to its owner
  for (const r of Object.values(state.regions)) {
    if (r.controller !== r.owner && all.includes(r.controller) && all.includes(r.owner)) setController(state, r.id, r.owner);
    if (r.siege && all.includes(r.siege.by)) r.siege = null;
  }
  for (const id of all) {
    const c = state.countries[id];
    for (const u of c.military.units) {
      u.inCombat = false;
      if (u.target && state.regions[u.target]?.controller !== id) {
        u.target = null;
        u.arrival = null;
      }
      const here = state.regions[u.region];
      if (!here || (here.controller !== id && !comradesOf(state, id).includes(here.controller))) u.region = c.capitalRegion;
    }
  }
  for (const a of war.attackers) for (const d of war.defenders) state.truces[pairKey(a, d)] = state.time.day + TRUCE_DAYS;
  // societies remember wars: winners wait 5 years, everybody else 10 before starting another one
  for (const id of all) {
    const won = !terms.whitePeace && war[side].includes(id);
    state.countries[id].ai.noWarUntil = state.time.day + (won ? 5 : 10) * 365;
  }
  war.status = 'ended';
  war.endDay = state.time.day;
  const winnerName = state.countries[war[side][0]].name;
  war.outcome = terms.whitePeace
    ? 'Weißer Frieden – Vorkriegsgrenzen wiederhergestellt.'
    : `Frieden zu Bedingungen von ${winnerName}: ${transferred.length ? `${transferred.length} Region(en) abgetreten (${transferred.map((r) => STATIC_REGIONS[r].name).join(', ')})` : 'keine Gebietsabtretungen'}${terms.reparations > 0 ? `, Reparationen ${formatBn(terms.reparations)}` : ''}.`;
  for (const loser of war[otherSide(side)]) for (const w of war[side]) if (!terms.whitePeace) changeOpinion(state, loser, w, -25);
  addNews(state, {
    category: 'world',
    countryId: war.attackers[0],
    others: war.defenders,
    importance: all.includes(state.playerId) ? 3 : 2,
    text: `FRIEDEN: ${war.name} beendet. ${war.outcome}`,
  });
  ctx?.bus?.emit('war:ended', war);
  if (all.includes(state.playerId)) ctx?.bus?.emit('interrupt', { kind: 'peace', warId: war.id });
}

/**
 * A member of a coalition capitulates and leaves the war on its own: its
 * occupied regions go to the occupiers, regions it occupies return to their
 * owners, and it gets a truce with the other side. The war goes on.
 */
export function separatePeace(state, war, countryId, ctx) {
  const side = sideOf(war, countryId);
  if (!side) return;
  const winners = new Set(war[otherSide(side)]);
  const c = state.countries[countryId];
  const ceded = [];
  for (const rid of [...c.regionIds]) {
    const r = state.regions[rid];
    if (winners.has(r.controller) && rid !== c.capitalRegion) {
      ceded.push(rid);
      transferRegion(state, rid, r.controller);
    }
  }
  for (const r of Object.values(state.regions)) {
    if (r.controller === countryId && r.owner !== countryId) setController(state, r.id, r.owner);
    if (r.siege?.by === countryId) r.siege = null;
  }
  const wasLeader = war[side][0] === countryId;
  war[side] = war[side].filter((id) => id !== countryId);
  if (wasLeader) promoteLeader(state, war, side);
  for (const w of winners) state.truces[pairKey(countryId, w)] = state.time.day + TRUCE_DAYS;
  c.ai.noWarUntil = state.time.day + 10 * 365;
  if (!c.eliminated) {
    for (const u of c.military.units) {
      u.target = null;
      u.attacking = false;
      u.arrival = null;
      if (state.regions[u.region]?.controller !== countryId) u.region = c.capitalRegion;
    }
  }
  addNews(state, {
    category: 'world',
    countryId,
    others: [...winners],
    importance: [countryId, ...winners].includes(state.playerId) ? 3 : 2,
    text: `${c.name} kapituliert und scheidet aus dem ${war.name} aus${ceded.length ? ` – ${ceded.length} Region(en) abgetreten` : ''}. Der Krieg geht weiter.`,
  });
  ctx?.bus?.emit('war:changed', war);
}

/** The strongest remaining member leads a side (negotiates peace for it). */
function promoteLeader(state, war, side) {
  if (war[side].length < 2) return;
  const best = war[side].reduce((a, b) => (state.countries[b].military.power > state.countries[a].military.power ? b : a));
  war[side] = [best, ...war[side].filter((id) => id !== best)];
}

/** Removes eliminated countries from wars and ends wars with an empty side. */
export function cleanupWars(state, ctx) {
  for (const w of activeWars(state)) {
    const leaders = [w.attackers[0], w.defenders[0]];
    w.attackers = w.attackers.filter((id) => !state.countries[id].eliminated);
    w.defenders = w.defenders.filter((id) => !state.countries[id].eliminated);
    if (w.attackers[0] !== leaders[0]) promoteLeader(state, w, 'attackers');
    if (w.defenders[0] !== leaders[1]) promoteLeader(state, w, 'defenders');
    if (!w.attackers.length || !w.defenders.length) {
      w.status = 'ended';
      w.endDay = state.time.day;
      w.outcome = !w.defenders.length ? 'Der Verteidiger wurde vollständig erobert.' : 'Der Angreifer wurde vollständig erobert.';
      addNews(state, { category: 'world', countryId: null, others: [], importance: 2, text: `${w.name} beendet: ${w.outcome}` });
      ctx?.bus?.emit('war:ended', w);
    }
  }
}
