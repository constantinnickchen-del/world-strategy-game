/**
 * Military AI: force planning, mobilisation, production orders, procurement,
 * recruitment and facility construction. Acts only through commands.
 */
import { executeCommand } from '../commands/commands.js';
import { UNIT_TYPES } from '../data/military/army.js';
import { EQUIPMENT } from '../data/military/equipment.js';
import { AIRCRAFT, AIRCRAFT_BY_ID } from '../data/military/aircraft.js';
import { SHIP_CLASSES } from '../data/military/navy.js';
import { FACILITIES, FACTORY_TYPES } from '../data/military/facilities.js';
import { STATIC_REGIONS, neighborCountryIds } from '../state/worldIndex.js';
import { getOpinion } from '../systems/diplomacy.js';
import { factoryCapacity, canProduce, itemDef, factoryFor, maxShipyardLevel } from '../systems/military/production.js';
import { procurementOffers } from '../systems/military/procurement.js';
import { dailyNeeds, STOCK_DAYS } from '../systems/military/logistics.js';
import { sparePartsNeed } from '../systems/military/maintenance.js';
import { aircraftCount, shipCount } from '../systems/military/power.js';
import { warsOf, sideOf, isAtWar } from '../systems/war/wars.js';

function cmd(state, ctx, c, type, payload) {
  return executeCommand(state, { type, countryId: c.id, ...payload }, ctx);
}

/** 0 = safe … 2+ = facing a much stronger hostile neighbour or enemy. */
export function threatLevel(state, c) {
  let threat = 0;
  const own = Math.max(1, c.military.landPower);
  const hostile = new Set(neighborCountryIds(state, c.id).filter((id) => getOpinion(state, c.id, id) < -30));
  for (const w of warsOf(state, c.id)) for (const id of w[sideOf(w, c.id) === 'attackers' ? 'defenders' : 'attackers']) hostile.add(id);
  for (const id of state.countryOrder) if (state.countries[id].ai.warPlan?.target === c.id) hostile.add(id);
  for (const id of hostile) {
    const e = state.countries[id];
    if (e.eliminated) continue;
    threat = Math.max(threat, (e.military.landPower / own) * (e.military.mobilization > 0 ? 1.3 : 1));
  }
  return Math.min(3, threat);
}

function queuedPP(c, factory) {
  let pp = 0;
  for (const l of c.military.production) if (factoryFor(l.kind, l.item) === factory) pp += (l.quantity - l.done) * itemDef(l.kind, l.item).pp - l.progress;
  return pp;
}

function unitEquipmentDeficit(c) {
  const need = {};
  for (const u of c.military.units) {
    if (u.status === 'reserve') continue;
    const missing = (1 - u.equip) * u.strength;
    for (const [k, v] of Object.entries(UNIT_TYPES[u.type].equipment)) need[k] = (need[k] ?? 0) + v * missing;
  }
  for (const k of Object.keys(need)) need[k] = Math.max(0, need[k] - c.military.stock[k]);
  return need;
}

function bestModel(state, c, role) {
  const options = AIRCRAFT.filter((a) => a.role === role && !canProduce(state, c, 'aircraft', a.id));
  return options.sort((a, b) => (b.airAttack + b.groundAttack) / b.cost - (a.airAttack + a.groundAttack) / a.cost || (a.id < b.id ? -1 : 1))[0] ?? null;
}

function chooseProduction(state, c, factory, threat) {
  const m = c.military;
  const daily = dailyNeeds(c, 1);
  if (factory === 'munitionsFactory') {
    if (m.stock.ammunition < daily.ammunition * (STOCK_DAYS.ammunition + 60)) return { kind: 'equipment', item: 'ammunition' };
    if (m.stock.spareParts < sparePartsNeed(c) * 6) return { kind: 'equipment', item: 'spareParts' };
    const def = unitEquipmentDeficit(c);
    if (def.infantryEquipment > 500) return { kind: 'equipment', item: 'infantryEquipment' };
    if (!canProduce(state, c, 'equipment', 'precisionMunitions') && m.stock.precisionMunitions < aircraftCount(c) * 40) return { kind: 'equipment', item: 'precisionMunitions' };
    return threat > 0.6 ? { kind: 'equipment', item: 'ammunition' } : null;
  }
  if (factory === 'vehicleFactory') {
    const def = unitEquipmentDeficit(c);
    const ranked = ['armor', 'artillery', 'vehicles', 'airDefense', 'radar']
      .map((k) => ({ k, value: (def[k] ?? 0) * EQUIPMENT[k].cost }))
      .filter((x) => x.value > 0.01)
      .sort((a, b) => b.value - a.value);
    if (ranked.length) return { kind: 'equipment', item: ranked[0].k };
    if (threat > 0.8) return { kind: 'equipment', item: 'armor' };
    return null;
  }
  if (factory === 'aircraftFactory') {
    const fighters = aircraftCount(c, 'fighter') + aircraftCount(c, 'interceptor');
    const desired = (m.aiBaseline?.fighters ?? fighters) * (1 + threat * 0.4);
    const fighter = bestModel(state, c, 'fighter');
    if (fighter && fighters < desired) return { kind: 'aircraft', item: fighter.id };
    const drone = bestModel(state, c, 'drone');
    if (drone && aircraftCount(c, 'drone') < (m.aiBaseline?.drones ?? 0) * (1 + threat) + 10) return { kind: 'aircraft', item: drone.id };
    return null;
  }
  if (factory === 'shipyard') {
    const ships = shipCount(c);
    const desired = (m.aiBaseline?.ships ?? ships) * (1 + threat * 0.25);
    if (ships >= desired) return null;
    const level = maxShipyardLevel(state, c);
    const pick = ['destroyer', 'frigate', 'submarine', 'corvette', 'patrol'].find((cls) => SHIP_CLASSES[cls].shipyard <= level && !canProduce(state, c, 'ship', cls));
    return pick ? { kind: 'ship', item: pick } : null;
  }
  return null;
}

export function militaryAdvisor(state, c, ctx) {
  const m = c.military;
  if (!m.aiBaseline) m.aiBaseline = { fighters: aircraftCount(c, 'fighter') + aircraftCount(c, 'interceptor'), drones: aircraftCount(c, 'drone'), ships: shipCount(c), units: m.units.length };
  const threat = threatLevel(state, c);
  m.threat = Math.round(threat * 100) / 100;
  const atWar = isAtWar(state, c.id);

  // mobilisation
  const defending = warsOf(state, c.id).some((w) => sideOf(w, c.id) === 'defenders');
  const desiredMob = atWar ? (defending || m.exhaustion < 0.3 ? 2 : 1) : c.ai.warPlan ? 1 : threat > 1.5 ? 1 : 0;
  if (desiredMob !== m.mobilization) cmd(state, ctx, c, 'setMobilization', { level: desiredMob });

  const room = Math.max(0, m.spending.budget - m.spending.upkeep - m.spending.procurement - m.spending.construction);

  // production: keep factories loaded for ~4 months
  for (const factory of FACTORY_TYPES) {
    const cap = factoryCapacity(state, c, factory);
    if (cap <= 0 || queuedPP(c, factory) > cap * 3) continue;
    const pick = chooseProduction(state, c, factory, threat);
    if (!pick) continue;
    const def = itemDef(pick.kind, pick.item);
    const byCapacity = Math.ceil((cap * 4) / def.pp);
    const byMoney = Math.floor((room * 5) / def.cost);
    const quantity = Math.max(1, Math.min(byCapacity, byMoney, 100000));
    if (byMoney >= 1) cmd(state, ctx, c, 'queueProduction', { kind: pick.kind, item: pick.item, quantity });
  }

  // procurement: buy what cannot be produced at home
  if (room > 0.02 && state.time.day - (m.lastContractDay ?? -9999) > 120 && m.contracts.filter((x) => x.status !== 'completed').length < 3) {
    const offers = procurementOffers(state, c.id).filter((o) => !o.refusal);
    const wants = [];
    const fighters = aircraftCount(c, 'fighter') + aircraftCount(c, 'interceptor');
    const desiredFighters = Math.max(m.aiBaseline.fighters, 4) * (1 + threat * 0.4);
    if (factoryCapacity(state, c, 'aircraftFactory') <= 0 && fighters < desiredFighters * 0.85) wants.push({ kind: 'aircraft', role: 'fighter', qty: Math.ceil(desiredFighters - fighters) });
    const deficit = unitEquipmentDeficit(c);
    if (factoryCapacity(state, c, 'vehicleFactory') <= 0 && (deficit.armor ?? 0) > 20) wants.push({ kind: 'equipment', item: 'armor', qty: Math.ceil(deficit.armor) });
    if (factoryCapacity(state, c, 'munitionsFactory') <= 0 && m.stock.ammunition < dailyNeeds(c, 1).ammunition * 40) wants.push({ kind: 'equipment', item: 'ammunition', qty: Math.ceil(dailyNeeds(c, 1).ammunition * 60) });
    for (const w of wants) {
      const candidates = offers.filter((o) => o.kind === w.kind && (w.item ? o.item === w.item : AIRCRAFT_BY_ID[o.item]?.role === w.role));
      if (!candidates.length) continue;
      const value = (o) => (w.kind === 'aircraft' ? (AIRCRAFT_BY_ID[o.item].airAttack + 10) / o.unitPrice : 1 / o.unitPrice);
      const best = candidates.sort((a, b) => value(b) - value(a))[0];
      const affordable = Math.floor((room * 24 * 0.6) / best.unitPrice);
      const qty = Math.min(best.maxQuantity, w.qty, affordable);
      if (qty >= 1 && cmd(state, ctx, c, 'signContract', { supplier: best.supplier, kind: best.kind, item: best.item, quantity: qty }).ok) {
        m.lastContractDay = state.time.day;
        break;
      }
    }
  }

  // recruitment when threatened and affordable – bounded by the peacetime force and population
  const activeUnits = m.units.filter((u) => u.status !== 'reserve').length;
  const unitCap = m.aiBaseline.units * (1 + 0.4 * Math.min(2, threat)) + (atWar ? 6 : 0);
  const personnelCap = c.population * (atWar ? 0.03 : 0.015);
  if ((threat > 0.7 || atWar || c.ai.warPlan) && activeUnits < unitCap && (m.activePersonnel ?? 0) < personnelCap && m.spending.funding >= 0.99 && room > m.spending.upkeepNeed * 0.08) {
    const stockArmor = m.stock.armor;
    const type = stockArmor > UNIT_TYPES.mechanized.equipment.armor * 0.6 ? 'mechanized' : m.stock.vehicles > 600 ? 'motorized' : 'infantry';
    const border = c.regionIds.filter((rid) => state.regions[rid].controller === c.id && STATIC_REGIONS[rid].neighbors.some((n) => state.regions[n] && state.regions[n].owner !== c.id));
    const region = border[0] ?? c.capitalRegion;
    if (state.regions[region]?.controller === c.id) cmd(state, ctx, c, 'raiseUnit', { unitType: type, regionId: region });
  }

  // disband when the budget cannot carry the forces for long
  if (!atWar && m.spending.funding < 0.85) {
    const weakest = m.units.filter((u) => !u.inCombat).sort((a, b) => a.strength * a.equip - b.strength * b.equip)[0];
    if (weakest) cmd(state, ctx, c, 'disbandUnit', { unitId: weakest.id });
  }

  // construction
  if (room > 0.05 && m.construction.length < 2) {
    const owned = c.regionIds.filter((rid) => state.regions[rid].controller === c.id);
    const total = (type) => owned.reduce((s, rid) => s + (state.regions[rid].buildings[type] ?? 0), 0);
    const best = [...owned].sort((a, b) => state.regions[b].econ - state.regions[a].econ);
    const coastal = best.filter((rid) => STATIC_REGIONS[rid].coastal);
    const plan = [];
    if (aircraftCount(c) > total('airBase') * FACILITIES.airBase.capacity) plan.push({ facility: 'airBase', region: best[0] });
    if (shipCount(c) > total('navalBase') * FACILITIES.navalBase.capacity && coastal.length) plan.push({ facility: 'navalBase', region: coastal[0] });
    if (total('munitionsFactory') === 0 && c.economy.gdp > 30) plan.push({ facility: 'munitionsFactory', region: best[0] });
    if (threat > 0.5 && c.economy.gdp > 250 && total('vehicleFactory') < 3) plan.push({ facility: 'vehicleFactory', region: best[0] });
    for (const p of plan) {
      if (p.region && cmd(state, ctx, c, 'buildFacility', { regionId: p.region, facility: p.facility }).ok) break;
    }
  }
}
