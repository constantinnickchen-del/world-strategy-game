/**
 * Unit movement.
 *
 * - Redeployment: through regions controlled by the own side (own country,
 *   allies, war comrades). Travel time follows distance, unit mobility and
 *   infrastructure. Overseas destinations need a sea route (coastal start and
 *   destination) and are slower.
 * - Attack order: target an adjacent enemy-controlled region; the unit stays
 *   where it is and fights for the target. Coastal enemy regions can be
 *   attacked by amphibious landing if the side has naval superiority and
 *   landing ships.
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { alliesOf } from '../diplomacy.js';
import { areEnemies, comradesOf, enemiesOf, warsOf, sideOf } from './wars.js';
import { shipCount } from '../military/power.js';

const DAY_KM_MIN = 8;

export function distanceKm(a, b) {
  const ra = STATIC_REGIONS[a].label;
  const rb = STATIC_REGIONS[b].label;
  const lat = ((ra[1] + rb[1]) / 2) * (Math.PI / 180);
  const dx = (ra[0] - rb[0]) * 111.32 * Math.cos(lat);
  const dy = (ra[1] - rb[1]) * 111.32;
  return Math.hypot(dx, dy);
}

/**
 * Countries whose territory a country may move through: war comrades and
 * allies – except allies that are also allied with one of its current enemies
 * (they stay neutral and grant passage to neither side).
 */
export function friendlyCountries(state, countryId) {
  const comrades = comradesOf(state, countryId);
  const enemies = enemiesOf(state, countryId);
  const out = new Set(comrades);
  for (const ally of alliesOf(state, countryId)) {
    if (out.has(ally)) continue;
    if (enemies.length && enemies.some((e) => alliesOf(state, e).includes(ally))) continue;
    out.add(ally);
  }
  return out;
}

/** Land path through friendly regions (BFS by hop count, returns region list incl. start/end) or null. */
export function friendlyPath(state, countryId, from, to) {
  if (from === to) return [from];
  const friends = friendlyCountries(state, countryId);
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of STATIC_REGIONS[cur].neighbors) {
      if (prev.has(n)) continue;
      const r = state.regions[n];
      if (!r || !friends.has(r.controller)) continue;
      prev.set(n, cur);
      if (n === to) {
        const path = [n];
        let p = cur;
        while (p) {
          path.push(p);
          p = prev.get(p);
        }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

export function travelDays(state, unit, path, { sea = false } = {}) {
  const mob = UNIT_TYPES[unit.type].mobility;
  let days = 0;
  for (let i = 1; i < path.length; i++) {
    const r = state.regions[path[i]];
    const speed = Math.max(DAY_KM_MIN, mob * (0.45 + 0.55 * (r.infrastructure / 100)));
    days += distanceKm(path[i - 1], path[i]) / speed;
  }
  if (sea) days = days * 1.5 + 10;
  return Math.max(1, Math.ceil(days));
}

/** Naval superiority of the unit's side in any war against the target owner (0..1, 1 if no enemy navy). */
function seaControl(state, countryId, targetController) {
  const war = areEnemies(state, countryId, targetController);
  if (!war) return 1;
  const side = sideOf(war, countryId);
  return side === 'attackers' ? war.navalSuperiority : 1 - war.navalSuperiority;
}

export function landingCapacity(state, countryId) {
  let cap = 0;
  for (const id of comradesOf(state, countryId)) cap += shipCount(state.countries[id], 'amphibious') + Math.floor(shipCount(state.countries[id], 'supply') / 3);
  return cap;
}

/**
 * Plans a move order. Returns { error } or { type: 'move'|'attack'|'landing'|'sea', path, days }.
 */
export function planMove(state, c, unit, targetRegion) {
  const target = state.regions[targetRegion];
  if (!target) return { error: 'Unbekannte Zielregion.' };
  if (unit.status !== 'active') return { error: 'Nur einsatzbereite (aktive) Verbände können verlegt werden.' };
  if (unit.region === targetRegion) return { error: 'Der Verband befindet sich bereits dort.' };
  const friends = friendlyCountries(state, c.id);
  if (friends.has(target.controller)) {
    const path = friendlyPath(state, c.id, unit.region, targetRegion);
    if (path) return { type: 'move', path, days: travelDays(state, unit, path) };
    if (STATIC_REGIONS[unit.region].coastal && STATIC_REGIONS[targetRegion].coastal) {
      return { type: 'sea', path: [unit.region, targetRegion], days: travelDays(state, unit, [unit.region, targetRegion], { sea: true }) };
    }
    // by ship to a friendly port, then over land (e.g. from an island to an inland front)
    if (STATIC_REGIONS[unit.region].coastal) {
      const port = nearestPortTowards(state, c.id, friends, targetRegion);
      if (port) {
        const landPath = friendlyPath(state, c.id, port, targetRegion);
        return { type: 'sea', path: [unit.region, ...landPath], days: travelDays(state, unit, [unit.region, port], { sea: true }) + travelDays(state, unit, landPath) };
      }
    }
    return { error: 'Keine Verbindung über eigenes oder verbündetes Gebiet und kein Seeweg.' };
  }
  const war = areEnemies(state, c.id, target.controller);
  if (!war) {
    const owner = state.countries[target.controller];
    return { error: `Kein Krieg mit ${owner?.name ?? 'diesem Land'} – zuerst den Krieg erklären oder Durchmarschrecht über Bündnisse erhalten.` };
  }
  if (STATIC_REGIONS[unit.region].neighbors.includes(targetRegion)) return { type: 'attack', path: [unit.region, targetRegion], days: 0 };
  if (STATIC_REGIONS[unit.region].coastal && STATIC_REGIONS[targetRegion].coastal) {
    if (seaControl(state, c.id, target.controller) < 0.55) return { error: 'Für eine Landung fehlt die Seeherrschaft (mind. 55 % der Seestreitkräfte im Krieg).' };
    const landing = landingCapacity(state, c.id);
    const busy = warsOf(state, c.id).length ? countLandingUnits(state, c.id) : 0;
    if (busy >= landing) return { error: `Keine freien Landungsschiffe (Kapazität: ${landing} Verbände).` };
    return { type: 'landing', path: [unit.region, targetRegion], days: travelDays(state, unit, [unit.region, targetRegion], { sea: true }) };
  }
  return { error: 'Ziel ist nicht benachbart. Verlegen Sie den Verband zuerst an die Front.' };
}

/** Friendly coastal region with a land connection to the target, nearest to the target. */
function nearestPortTowards(state, countryId, friends, targetRegion) {
  // regions reachable over friendly land from the target (BFS outwards)
  const seen = new Set([targetRegion]);
  const queue = [targetRegion];
  let best = null;
  while (queue.length) {
    const rid = queue.shift();
    if (STATIC_REGIONS[rid].coastal && friends.has(state.regions[rid].controller)) {
      best = rid;
      break;
    }
    for (const n of STATIC_REGIONS[rid].neighbors) {
      if (seen.has(n) || !friends.has(state.regions[n]?.controller)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return best;
}

function countLandingUnits(state, countryId) {
  let n = 0;
  for (const id of comradesOf(state, countryId)) for (const u of state.countries[id].military.units) if (u.landing) n++;
  return n;
}

export function applyMove(state, unit, plan) {
  const last = plan.path[plan.path.length - 1];
  unit.attacking = false;
  unit.landing = false;
  if (plan.type === 'attack') {
    unit.target = last;
    unit.attacking = true;
    unit.arrival = null;
  } else if (plan.type === 'landing') {
    unit.target = last;
    unit.attacking = true;
    unit.landing = true;
    unit.arrival = state.time.day + plan.days;
  } else {
    unit.target = last;
    unit.arrival = state.time.day + plan.days;
  }
}

/** Daily: units arrive at their destination. */
export function stepMovement(state) {
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    if (c.eliminated) continue;
    for (const u of c.military.units) {
      if (!u.target || u.attacking) continue;
      if (u.arrival !== null && state.time.day >= u.arrival) {
        const r = state.regions[u.target];
        const friends = friendlyCountries(state, c.id);
        if (r && friends.has(r.controller)) u.region = u.target;
        u.target = null;
        u.arrival = null;
      }
    }
  }
}

export function isMoving(u) {
  return !!u.target && !u.attacking;
}

/** Landing units are at sea until arrival. */
export function isAtSea(state, u) {
  return u.landing && u.arrival !== null && state.time.day < u.arrival;
}
