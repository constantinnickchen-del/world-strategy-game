/**
 * Automatic front management ("General Staff").
 *
 * Used by AI countries and – unless switched off – for the player's units that
 * have no manual order. Every few days it:
 *   1. finds enemy regions on the front (adjacent to regions the side controls)
 *   2. orders attacks where local superiority is sufficient, preferring war goals
 *   3. moves idle units from the interior to threatened front regions
 *   4. plans amphibious landings when there is no land front but sea control
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { attackValue, defenseValue } from '../military/units.js';
import { warsOf, sideOf, otherSide } from './wars.js';
import { planMove, applyMove, friendlyCountries, distanceKm } from './movement.js';

const ATTACK_RATIO = 1.3;

export function frontState(state, c) {
  const friends = friendlyCountries(state, c.id);
  const enemies = new Set();
  const goalRegions = new Set();
  for (const w of warsOf(state, c.id)) {
    const side = sideOf(w, c.id);
    for (const id of w[otherSide(side)]) enemies.add(id);
    if (side === 'attackers') for (const g of w.goals) if (g.type === 'region') goalRegions.add(g.regionId);
  }
  // own regions occupied by the enemy are goals for liberation
  for (const rid of c.regionIds) if (enemies.has(state.regions[rid].controller)) goalRegions.add(rid);
  const frontEnemy = new Set();
  const frontOwn = new Set();
  for (const r of Object.values(state.regions)) {
    if (!friends.has(r.controller)) continue;
    for (const n of STATIC_REGIONS[r.id].neighbors) {
      if (enemies.has(state.regions[n]?.controller)) {
        frontEnemy.add(n);
        frontOwn.add(r.id);
      }
    }
  }
  return { friends, enemies, goalRegions, frontEnemy, frontOwn };
}

function enemyStrengthIn(state, regionId, enemies) {
  let s = 0;
  for (const id of enemies) {
    const e = state.countries[id];
    for (const u of e.military.units) if (u.region === regionId && u.status === 'active' && !u.target) s += defenseValue(u, e);
  }
  return s;
}

export function runFrontAI(state, c, { onlyAutomatic = false } = {}) {
  const fs = frontState(state, c);
  if (!fs.enemies.size) return;
  const units = c.military.units.filter((u) => u.status === 'active' && !(onlyAutomatic && u.manual));
  if (!units.length) return;
  const byRegion = new Map();
  for (const u of units) {
    if (u.target && !u.attacking) continue; // moving
    let list = byRegion.get(u.region);
    if (!list) byRegion.set(u.region, (list = []));
    list.push(u);
  }

  // 1. attacks: evaluate each enemy front region
  const targets = [...fs.frontEnemy]
    .map((t) => {
      const defense = enemyStrengthIn(state, t, fs.enemies) * (1 + 0.3 * ((STATIC_REGIONS[t].terrain === 'mountains' || STATIC_REGIONS[t].terrain === 'urban') ? 1 : 0));
      const priority = (fs.goalRegions.has(t) ? 3 : 1) + (state.regions[t].owner === c.id ? 2 : 0) + (state.countries[state.regions[t].owner]?.capitalRegion === t ? 1 : 0);
      return { t, defense, priority };
    })
    .sort((a, b) => b.priority - a.priority || a.defense - b.defense);
  const committed = new Set(units.filter((u) => u.attacking).map((u) => u.id));
  // strategy chosen by the head of state (AI countries: balanced)
  const stance = c.military.stance ?? 'balanced';
  const ratioNeeded = stance === 'offensive' ? 0.95 : ATTACK_RATIO;
  for (const { t, defense } of targets) {
    if (stance === 'defensive' && state.regions[t].owner !== c.id) continue; // only liberate own territory
    const adjacent = STATIC_REGIONS[t].neighbors.filter((n) => byRegion.has(n));
    const available = [];
    for (const n of adjacent) {
      const list = byRegion.get(n).filter((u) => !committed.has(u.id) && u.org > 0.5 && u.supply > 0.25 && UNIT_TYPES[u.type].attack >= 5);
      // keep one defender in each region that borders other enemy regions
      const keep = list.length > 1 ? 1 : 0;
      available.push(...list.sort((a, b) => attackValue(b, c) - attackValue(a, c)).slice(keep));
    }
    let power = 0;
    const chosen = [];
    for (const u of available) {
      chosen.push(u);
      power += attackValue(u, c);
      if (power > defense * ratioNeeded * 1.5 + 5) break;
    }
    if (power >= defense * ratioNeeded && chosen.length) {
      for (const u of chosen) {
        const plan = planMove(state, c, u, t);
        if (!plan.error) {
          applyMove(state, u, plan);
          committed.add(u.id);
        }
      }
    }
  }

  // 2. reinforce: idle units away from the front move to the most threatened front region
  const frontNeeds = [...fs.frontOwn]
    .filter((rid) => state.regions[rid].controller === c.id || fs.friends.has(state.regions[rid].controller))
    .map((rid) => {
      const threat = STATIC_REGIONS[rid].neighbors.reduce((s, n) => s + (fs.frontEnemy.has(n) ? enemyStrengthIn(state, n, fs.enemies) : 0), 0);
      const own = (byRegion.get(rid) ?? []).reduce((s, u) => s + defenseValue(u, c), 0);
      return { rid, need: threat * 1.2 - own + (fs.goalRegions.size && STATIC_REGIONS[rid].neighbors.some((n) => fs.goalRegions.has(n)) ? 20 : 0) };
    })
    .filter((x) => x.need > 0)
    .sort((a, b) => b.need - a.need);
  if (frontNeeds.length) {
    const idle = units.filter((u) => !u.target && !fs.frontOwn.has(u.region) && u.region !== c.capitalRegion);
    // keep a small capital guard
    const capitalGuard = units.filter((u) => u.region === c.capitalRegion && !u.target);
    const spareCapital = capitalGuard.slice(fs.frontOwn.has(c.capitalRegion) ? 0 : 1);
    let i = 0;
    for (const u of [...idle, ...spareCapital]) {
      const dest = frontNeeds[i % frontNeeds.length];
      i++;
      const plan = planMove(state, c, u, dest.rid);
      if (!plan.error && plan.type !== 'attack') applyMove(state, u, plan);
    }
  } else if (!fs.frontEnemy.size) {
    // 3. no land front: amphibious landing on the weakest enemy coastal region
    const coastalEnemy = [];
    for (const id of fs.enemies) for (const rid of state.countries[id].regionIds) if (STATIC_REGIONS[rid].coastal && fs.enemies.has(state.regions[rid].controller)) coastalEnemy.push(rid);
    if (!coastalEnemy.length) return;
    const ownCoast = units.filter((u) => !u.target && STATIC_REGIONS[u.region].coastal);
    if (!ownCoast.length) return;
    const target = coastalEnemy
      .map((rid) => ({ rid, d: enemyStrengthIn(state, rid, fs.enemies) + distanceKm(ownCoast[0].region, rid) / 500 }))
      .sort((a, b) => a.d - b.d)[0].rid;
    for (const u of ownCoast.sort((a, b) => attackValue(b, c) - attackValue(a, c)).slice(0, 6)) {
      const plan = planMove(state, c, u, target);
      if (!plan.error) applyMove(state, u, plan);
    }
  }
}
