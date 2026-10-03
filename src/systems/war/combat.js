/**
 * Daily war simulation.
 *
 * Land: units with an attack order fight the defenders of the target region.
 *   Damage depends on attack/defence values, armour vs. anti-armour, terrain,
 *   depots, air superiority, ground support, supply, organisation and morale.
 *   Broken defenders retreat to a friendly neighbour region – or surrender if
 *   they are encircled. An undefended target is besieged; when the siege is
 *   complete the region changes its controller (occupation / liberation).
 * Air: fighters in range of the theatre fight for air superiority; bombers and
 *   drones support ground battles; air defence shoots aircraft down.
 * Sea: fleets fight for naval superiority, which enables landings and blockades.
 */
import { UNIT_TYPES, TERRAIN } from '../../data/military/army.js';
import { AIRCRAFT_BY_ID } from '../../data/military/aircraft.js';
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { setController } from '../../state/territory.js';
import { attackValue, defenseValue, personnelOf } from '../military/units.js';
import { navalPowerOf } from '../military/power.js';
import { sideOf, otherSide, computeWarScore } from './wars.js';
import { distanceKm, isAtSea, friendlyCountries } from './movement.js';
import { addNews } from '../news.js';
import { clamp } from '../../util/math.js';

const pierce = (type, hardness) => 1 - hardness * (1 - Math.min(1, UNIT_TYPES[type].piercing / 12));

function avgHardness(list) {
  let h = 0;
  let w = 0;
  for (const { u } of list) {
    const p = personnelOf(u);
    h += UNIT_TYPES[u.type].hardness * p;
    w += p;
  }
  return w > 0 ? h / w : 0;
}

function recordCasualties(war, countryId, n) {
  war.casualties[countryId] = (war.casualties[countryId] ?? 0) + n;
}

function damageUnit(war, c, u, orgLoss, strengthFactor, equipFactor) {
  const before = personnelOf(u);
  u.org = Math.max(0, u.org - orgLoss);
  u.strength = Math.max(0.02, u.strength - orgLoss * strengthFactor);
  u.equip = Math.max(0, u.equip - orgLoss * equipFactor);
  u.inCombat = true;
  u.experience = Math.min(1, u.experience + 0.002);
  const lost = before - personnelOf(u);
  recordCasualties(war, c.id, lost);
  c.military.casualtiesToday = (c.military.casualtiesToday ?? 0) + lost;
}

/** Air superiority and ground support for one war on one day. */
function resolveAir(state, war, theaterRegions, ctx) {
  const result = { attackers: { mod: 1, support: 0 }, defenders: { mod: 1, support: 0 } };
  if (!theaterRegions.length) return result;
  let cx = 0;
  let cy = 0;
  for (const rid of theaterRegions) {
    cx += STATIC_REGIONS[rid].label[0];
    cy += STATIC_REGIONS[rid].label[1];
  }
  cx /= theaterRegions.length;
  cy /= theaterRegions.length;
  const centerKm = (rid) => {
    const l = STATIC_REGIONS[rid].label;
    const lat = ((l[1] + cy) / 2) * (Math.PI / 180);
    return Math.hypot((l[0] - cx) * 111.32 * Math.cos(lat), (l[1] - cy) * 111.32);
  };
  const coastalTheater = theaterRegions.some((rid) => STATIC_REGIONS[rid].coastal);
  const sides = {};
  for (const side of ['attackers', 'defenders']) {
    const s = { fighter: 0, ground: 0, airDefense: 0, used: [] };
    for (const id of war[side]) {
      const c = state.countries[id];
      let minBase = Infinity;
      for (const rid of c.regionIds) {
        const r = state.regions[rid];
        if (r.controller === id && r.buildings.airBase) minBase = Math.min(minBase, centerKm(rid));
      }
      const carriers = coastalTheater && c.military.fleets.some((f) => (f.ships.carrier ?? 0) > 0.5);
      const tankers = Object.entries(c.military.aircraft).some(([mid, a]) => AIRCRAFT_BY_ID[mid].role === 'tanker' && a.count >= 1);
      const fuelOk = c.military.stock.fuel > 0;
      for (const [mid, a] of Object.entries(c.military.aircraft)) {
        const model = AIRCRAFT_BY_ID[mid];
        if (a.count < 0.5 || !fuelOk) continue;
        const radius = model.range * 0.5 * (tankers ? 1.4 : 1);
        if (minBase > radius && !(carriers && ['fighter', 'drone'].includes(model.role))) continue;
        const eff = a.count * a.readiness;
        s.fighter += model.airAttack * eff;
        s.ground += model.groundAttack * eff;
        s.used.push({ c, mid, a });
      }
      for (const u of c.military.units) if (u.status === 'active' && theaterRegions.includes(u.region)) s.airDefense += UNIT_TYPES[u.type].airDefense * u.strength;
      s.airDefense += (c.military.stock.airDefense ?? 0) * 2 + (c.military.stock.radar ?? 0);
    }
    sides[side] = s;
  }
  const A = sides.attackers.fighter;
  const D = sides.defenders.fighter;
  const sA = A + D > 0 ? A / (A + D) : 0.5;
  war.airSuperiority = Math.round(sA * 1000) / 1000;
  for (const side of ['attackers', 'defenders']) {
    const own = sides[side];
    const enemy = sides[otherSide(side)];
    const share = side === 'attackers' ? sA : 1 - sA;
    const loss = Math.min(0.03, 0.006 * (1 - share) * (enemy.fighter > 0 ? 1 : 0) + 0.003 * (enemy.airDefense / (enemy.airDefense + 400)));
    let precision = 1;
    for (const { c, mid, a } of own.used) {
      const lost = a.count * loss * (AIRCRAFT_BY_ID[mid].role === 'transport' || AIRCRAFT_BY_ID[mid].role === 'tanker' ? 0.2 : 1);
      a.count = Math.max(0, a.count - lost);
      war.losses[c.id] = war.losses[c.id] ?? { aircraft: 0, ships: 0 };
      war.losses[c.id].aircraft += lost;
      c.military.stock.fuel = Math.max(0, c.military.stock.fuel - a.count * 5);
      if (c.military.stock.precisionMunitions > 0 && AIRCRAFT_BY_ID[mid].groundAttack > 0) {
        precision = 1.3;
        c.military.stock.precisionMunitions = Math.max(0, c.military.stock.precisionMunitions - a.count * 0.5);
      }
    }
    result[side].mod = 0.8 + 0.4 * share;
    result[side].support = own.ground * share * precision * 0.05;
  }
  void ctx;
  return result;
}

/** Naval superiority, losses and blockades for one war. */
function resolveNaval(state, war) {
  const power = {};
  for (const side of ['attackers', 'defenders']) power[side] = war[side].reduce((s, id) => s + navalPowerOf(state.countries[id]), 0);
  const A = power.attackers;
  const D = power.defenders;
  const total = A + D;
  war.navalSuperiority = total > 0 ? Math.round((A / total) * 1000) / 1000 : 0.5;
  if (A > 0 && D > 0) {
    for (const side of ['attackers', 'defenders']) {
      const enemyShare = (side === 'attackers' ? D : A) / total;
      for (const id of war[side]) {
        const c = state.countries[id];
        for (const f of c.military.fleets) {
          let lost = 0;
          for (const cls of Object.keys(f.ships)) {
            const l = f.ships[cls] * 0.0012 * enemyShare;
            f.ships[cls] = Math.max(0, f.ships[cls] - l);
            lost += l;
          }
          f.condition = Math.max(0.2, f.condition - 0.002 * enemyShare);
          war.losses[id] = war.losses[id] ?? { aircraft: 0, ships: 0 };
          war.losses[id].ships += lost;
        }
      }
    }
  }
  war.blockade = {};
  const s = war.navalSuperiority;
  const blockaded = s > 0.65 ? 'defenders' : s < 0.35 ? 'attackers' : null;
  if (blockaded) {
    const strength = Math.min(0.6, (Math.abs(s - 0.5) - 0.15) * 2 + 0.1);
    for (const id of war[blockaded]) {
      if (state.countries[id].regionIds.some((rid) => STATIC_REGIONS[rid].coastal)) war.blockade[id] = Math.round(strength * 100) / 100;
    }
  }
}

function retreatTarget(state, war, side, regionId) {
  const friends = new Set(war[side]);
  const options = STATIC_REGIONS[regionId].neighbors.filter((n) => friends.has(state.regions[n]?.controller));
  if (!options.length) return null;
  // prefer the neighbour farthest from enemy pressure: the one with most friendly neighbours
  return options
    .map((n) => ({ n, score: STATIC_REGIONS[n].neighbors.filter((x) => friends.has(state.regions[x]?.controller)).length }))
    .sort((a, b) => b.score - a.score || (a.n < b.n ? -1 : 1))[0].n;
}

function captureRegion(state, war, regionId, attackerEntries, ctx) {
  const r = state.regions[regionId];
  const side = sideOf(war, attackerEntries[0].c.id);
  // liberation: if the legal owner fights on the capturing side it gets its region back
  const captor = war[side].includes(r.owner) ? r.owner : attackerEntries.reduce((best, e) => (e.power > best.power ? e : best)).c.id;
  const previous = r.controller;
  setController(state, regionId, captor);
  r.devastation = Math.min(1, r.devastation + 0.1);
  r.infrastructure = Math.max(0, r.infrastructure - 3);
  for (const { u } of attackerEntries) {
    u.region = regionId;
    u.target = null;
    u.attacking = false;
    u.landing = false;
    u.arrival = null;
  }
  const regionName = STATIC_REGIONS[regionId].name;
  const owner = state.countries[r.owner];
  const liberated = captor === r.owner;
  const involvesPlayer = [captor, previous, r.owner].includes(state.playerId);
  addNews(state, {
    category: 'world',
    countryId: captor,
    others: [previous, r.owner],
    importance: involvesPlayer ? 3 : 1,
    text: liberated
      ? `${state.countries[captor].name} befreit ${regionName}.`
      : `${state.countries[captor].name} erobert ${regionName} (${owner.name}).`,
  });
  if (owner.capitalRegion === regionId && !liberated) {
    owner.politics.stability = clamp(owner.politics.stability - 15, 0, 100);
    owner.military.exhaustion = Math.min(1, owner.military.exhaustion + 0.15);
    addNews(state, { category: 'world', countryId: r.owner, others: [captor], importance: 3, text: `Die Hauptstadtregion von ${owner.name} ist gefallen!` });
  }
  if (r.owner === state.playerId && !liberated) ctx?.bus?.emit('interrupt', { kind: 'regionLost', warId: war.id, regionId });
  ctx?.bus?.emit('region:control', { regionId, controller: captor });
}

/** One day of one war. */
export function stepWarDay(state, war, ctx) {
  const side = new Map();
  for (const id of war.attackers) side.set(id, 'attackers');
  for (const id of war.defenders) side.set(id, 'defenders');
  const attacksOn = new Map(); // target -> [{u,c,power}]
  const defendersIn = new Map(); // region -> [{u,c}]
  for (const [id] of side) {
    const c = state.countries[id];
    for (const u of c.military.units) {
      if (u.status !== 'active') continue;
      if (u.attacking && u.target) {
        if (isAtSea(state, u)) continue;
        const t = state.regions[u.target];
        const tSide = side.get(t?.controller);
        if (!t || friendlyCountries(state, id).has(t.controller)) {
          // target already taken by our side → advance into it
          if (t && friendlyCountries(state, id).has(t.controller)) u.region = u.target;
          u.target = null;
          u.attacking = false;
          u.landing = false;
          continue;
        }
        if (!tSide || tSide === side.get(id)) continue; // target belongs to another war
        let list = attacksOn.get(u.target);
        if (!list) attacksOn.set(u.target, (list = []));
        list.push({ u, c, power: 0 });
      } else if (!u.target) {
        const here = state.regions[u.region];
        if (here && side.get(here.controller) === side.get(id)) {
          let list = defendersIn.get(u.region);
          if (!list) defendersIn.set(u.region, (list = []));
          list.push({ u, c });
        }
      }
    }
  }
  const theater = [...attacksOn.keys()];
  const air = resolveAir(state, war, theater, ctx);
  resolveNaval(state, war);
  const battlesPerSide = { attackers: 0, defenders: 0 };
  for (const [, list] of attacksOn) battlesPerSide[side.get(list[0].c.id)]++;

  for (const [target, attackers] of attacksOn) {
    const r = state.regions[target];
    const st = STATIC_REGIONS[target];
    const atkSide = side.get(attackers[0].c.id);
    const defSide = otherSide(atkSide);
    const defenders = (defendersIn.get(target) ?? []).filter(({ c }) => side.get(c.id) === defSide);
    const terrain = TERRAIN[st.terrain] ?? TERRAIN.plains;
    const support = (s) => (battlesPerSide[s] > 0 ? air[s].support / battlesPerSide[s] : 0);
    if (defenders.length) {
      const hD = avgHardness(defenders);
      const hA = avgHardness(attackers);
      const recon = attackers.some(({ u }) => UNIT_TYPES[u.type].combatBonus) ? 1.08 : 1;
      let ATK = 0;
      for (const e of attackers) {
        e.power = attackValue(e.u, e.c) * pierce(e.u.type, hD) * (e.u.landing ? 0.6 : 1);
        ATK += e.power;
      }
      ATK = ATK * recon * air[atkSide].mod + support(atkSide);
      const defMult = terrain.defense * (1 + 0.08 * (r.buildings.depot ?? 0)) * (r.owner === defenders[0].c.id ? 1.05 : 1);
      let DEF = 0;
      for (const { u, c } of defenders) DEF += defenseValue(u, c) * pierce(u.type, hA);
      DEF = DEF * defMult * air[defSide].mod + support(defSide);
      const ratio = ATK / (DEF + 0.01);
      const defLoss = clamp(0.045 * ratio, 0.008, 0.18);
      const atkLoss = clamp(0.035 / Math.max(ratio, 0.05), 0.008, 0.18);
      for (const { u, c } of defenders) damageUnit(war, c, u, defLoss, 0.05, 0.04);
      for (const { u, c } of attackers) damageUnit(war, c, u, atkLoss, 0.04, 0.03);
      r.devastation = Math.min(1, r.devastation + 0.002);
      r.infrastructure = Math.max(0, r.infrastructure - 0.04);
      const avgOrg = (list) => list.reduce((s, { u }) => s + u.org, 0) / list.length;
      if (avgOrg(defenders) < 0.2) {
        war.battles[atkSide]++;
        const to = retreatTarget(state, war, defSide, target);
        for (const { u, c } of defenders) {
          if (to) {
            u.region = to;
            u.morale = Math.max(0, u.morale - 0.1);
          } else {
            // encircled: the formation surrenders
            recordCasualties(war, c.id, personnelOf(u));
            c.military.units = c.military.units.filter((x) => x !== u);
          }
        }
        for (const { u } of attackers) u.morale = Math.min(1, u.morale + 0.05);
      } else if (avgOrg(attackers) < 0.15) {
        war.battles[defSide]++;
        for (const { u } of attackers) {
          u.attacking = false;
          u.target = null;
          u.landing = false;
          u.morale = Math.max(0, u.morale - 0.08);
        }
        for (const { u } of defenders) u.morale = Math.min(1, u.morale + 0.05);
        if (r.siege) r.siege = null;
      }
      continue;
    }
    // undefended: siege
    let power = 0;
    for (const e of attackers) {
      e.power = attackValue(e.u, e.c);
      power += e.power;
      e.u.inCombat = true;
    }
    const garrison = 4 + (st.population / 1e6) * 3;
    // an undefended region falls within a few weeks (about a month for large or rough regions)
    // the player's offensives are a bit faster than wars between AI states, so the world map stays stable
    const pace = attackers.some((e) => e.c.id === state.playerId) ? 1 : 1.7;
    const days = clamp(9 * terrain.siege * Math.sqrt(Math.max(1, st.areaKm) / 25000), 5, 30) * pace;
    const progressToday = (100 / days) * clamp(0.55 + power / (garrison * 4), 0.5, 1.6);
    if (!r.siege || r.siege.by !== attackers[0].c.id) r.siege = { by: attackers[0].c.id, progress: 0, warId: war.id };
    r.siege.progress = Math.min(100, r.siege.progress + progressToday);
    if (r.siege.progress >= 100) captureRegion(state, war, target, attackers, ctx);
  }
  // sieges without attackers fade away
  for (const r of Object.values(state.regions)) {
    if (r.siege && r.siege.warId === war.id && !attacksOn.has(r.id)) {
      r.siege.progress -= 10;
      if (r.siege.progress <= 0) r.siege = null;
    }
  }
  war.score = Math.round(computeWarScore(state, war) * 10) / 10;
  // short score history for the war outlook (every 10 days, last 360 days)
  if ((state.time.day - war.startDay) % 10 === 0) {
    war.history = [...(war.history ?? []), [state.time.day, war.score]].slice(-36);
  }
}

/** Daily supply, attrition and exhaustion for one country at war. */
export function stepWarSupply(state, c, network) {
  const m = c.military;
  const enemiesNear = (rid) => STATIC_REGIONS[rid].neighbors.some((n) => {
    const ctrl = state.regions[n]?.controller;
    return ctrl && ctrl !== c.id && !network.friendIds.has(ctrl);
  });
  const need = { fuel: 0, ammunition: 0, rations: 0 };
  const activity = new Map();
  for (const u of m.units) {
    if (u.status !== 'active') continue;
    const t = UNIT_TYPES[u.type];
    const a = u.inCombat ? 1 : u.attacking ? 0.6 : u.target ? 0.4 : enemiesNear(u.region) ? 0.3 : 0.1;
    activity.set(u, a);
    need.fuel += t.fuel * u.strength * a;
    need.ammunition += t.ammo * u.strength * a;
    need.rations += personnelOf(u) * 0.002;
  }
  const fill = {};
  for (const k of Object.keys(need)) {
    fill[k] = need[k] > 0 ? Math.min(1, m.stock[k] / need[k]) : 1;
    m.stock[k] = Math.max(0, m.stock[k] - need[k]);
  }
  m.supplyFill = fill;
  const logisticsIn = new Set(m.units.filter((u) => u.status === 'active' && UNIT_TYPES[u.type].supplyBonus).map((u) => u.region));
  let casualties = m.casualtiesToday ?? 0;
  for (const u of m.units) {
    if (u.status !== 'active') continue;
    const a = activity.get(u);
    const region = u.landing && u.target ? u.target : u.region;
    let delivery = network.factor(region);
    if (logisticsIn.has(u.region)) delivery = Math.min(1, delivery + 0.25);
    const target = delivery * Math.min(fill.fuel, fill.rations, a >= 0.6 ? fill.ammunition : 1);
    u.supply = clamp(u.supply + (target - u.supply) * 0.25, 0, 1);
    const terrain = TERRAIN[STATIC_REGIONS[u.region]?.terrain] ?? TERRAIN.plains;
    const attrition = terrain.attrition * a + (u.supply < 0.3 ? 0.003 : 0);
    if (attrition > 0) {
      const before = personnelOf(u);
      u.strength = Math.max(0.02, u.strength - attrition);
      casualties += before - personnelOf(u);
    }
    if (!u.inCombat) u.org = Math.min(1, u.org + 0.06 * (0.3 + 0.7 * u.supply));
  }
  // war exhaustion
  const active = Math.max(1, m.activePersonnel ?? 1);
  const owned = c.regionIds.length || 1;
  const occupied = c.regionIds.filter((rid) => state.regions[rid].controller !== c.id).length;
  const capitalLost = state.regions[c.capitalRegion]?.controller !== c.id;
  // war weariness: time, losses relative to the army, occupied home regions, lost capital (capped per day)
  const daily = 0.0003 + (casualties / active) * 1.5 + (occupied / owned) * 0.002 + (capitalLost ? 0.004 : 0);
  m.exhaustion = clamp(m.exhaustion + Math.min(0.006, daily), 0, 1);
  m.casualtiesToday = 0;
  void distanceKm;
}
