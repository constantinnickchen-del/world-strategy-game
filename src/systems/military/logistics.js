/**
 * Logistics: supplies (fuel, ammunition, rations, spare parts) and their
 * delivery to the units.
 *
 * - Stocks are refilled monthly: fuel and rations are bought (priced from the
 *   oil and food world markets; oil shortages limit fuel), ammunition and
 *   spare parts come from production lines or emergency purchases.
 * - Units consume supplies daily in war, a training share in peace.
 * - Delivery depends on infrastructure and on a connection through own or
 *   allied territory to the home country – encircled units starve.
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { EQUIPMENT } from '../../data/military/equipment.js';
import { FACILITIES } from '../../data/military/facilities.js';
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { aircraftCount } from './power.js';
import { personnelOf } from './units.js';
import { sparePartsNeed } from './maintenance.js';
import { clamp } from '../../util/math.js';

export const STOCK_DAYS = { fuel: 90, ammunition: 60, rations: 90 };
const RATIONS_PER_SOLDIER = 0.002; // t per day

/** Daily consumption of all active units at the given activity level (1 = combat). */
export function dailyNeeds(c, activity = 1) {
  const need = { fuel: 0, ammunition: 0, rations: 0 };
  for (const u of c.military.units) {
    if (u.status !== 'active') continue;
    const t = UNIT_TYPES[u.type];
    need.fuel += t.fuel * u.strength * activity;
    need.ammunition += t.ammo * u.strength * activity;
    need.rations += personnelOf(u) * RATIONS_PER_SOLDIER;
  }
  need.fuel += aircraftCount(c) * 1.5 * activity;
  return need;
}

export function unitPrice(state, c, id) {
  const def = EQUIPMENT[id];
  let price = def.cost;
  if (def.priceLink) {
    const m = state.market[def.priceLink];
    price *= m.price / m.basePrice;
    if (def.priceLink === 'oil' && c.resources.oil.production > c.resources.oil.consumption) price *= 0.7;
  }
  return price;
}

/** Share of fuel the country can actually obtain (oil shortages through embargoes / blockades). */
export function fuelAvailability(c) {
  const oil = c.resources.oil;
  if (oil.consumption <= 0) return 1;
  return clamp(1 - oil.shortage / oil.consumption, 0.1, 1);
}

/** Monthly purchases to keep supplies at target levels. */
export function stepSupplies(state, c, wallet) {
  const m = c.military;
  const daily = dailyNeeds(c, 1);
  const targets = {
    fuel: daily.fuel * STOCK_DAYS.fuel,
    ammunition: daily.ammunition * STOCK_DAYS.ammunition,
    rations: daily.rations * STOCK_DAYS.rations,
    spareParts: sparePartsNeed(c) * 4,
  };
  // peacetime training consumption (≈ 3 days of combat per month)
  const training = dailyNeeds(c, 0.1);
  m.stock.fuel = Math.max(0, m.stock.fuel - training.fuel * 30);
  m.stock.ammunition = Math.max(0, m.stock.ammunition - training.ammunition * 30);
  m.stock.rations = Math.max(0, m.stock.rations - daily.rations * 30);
  let spent = 0;
  for (const [id, target] of Object.entries(targets)) {
    const gap = target - m.stock[id];
    if (gap <= 0) continue;
    let qty = gap;
    // emergency purchases of factory goods are limited and expensive
    let price = unitPrice(state, c, id);
    if (EQUIPMENT[id].factory) {
      qty = gap * 0.3;
      price *= 1.4;
    }
    if (id === 'fuel') qty *= fuelAvailability(c);
    const money = wallet.take('supplies', qty * price);
    spent += money;
    m.stock[id] += money / price;
  }
  return spent;
}

/** Equips units from stock and returns how much was used. */
export function refitUnits(c) {
  const m = c.military;
  const needs = {};
  // formations in training are equipped too, so they are ready when training ends
  const units = m.units.filter((u) => u.equip < 0.999 && u.status !== 'reserve');
  for (const u of units) {
    const missing = (1 - u.equip) * u.strength;
    for (const [k, v] of Object.entries(UNIT_TYPES[u.type].equipment)) needs[k] = (needs[k] ?? 0) + v * missing;
  }
  const fill = {};
  for (const [k, v] of Object.entries(needs)) fill[k] = v > 0 ? Math.min(1, m.stock[k] / v) : 1;
  for (const u of units) {
    const t = UNIT_TYPES[u.type];
    let f = 1;
    for (const k of Object.keys(t.equipment)) f = Math.min(f, fill[k] ?? 1);
    if (f <= 0) continue;
    const add = (1 - u.equip) * f;
    for (const [k, v] of Object.entries(t.equipment)) m.stock[k] = Math.max(0, m.stock[k] - v * add * u.strength);
    u.equip = Math.min(1, u.equip + add);
  }
}

/** Regions a side can supply through (own + allies' controlled regions). */
export function supplyNetwork(state, sideIds) {
  const set = new Set(sideIds);
  const start = [];
  for (const id of sideIds) {
    const c = state.countries[id];
    if (!c || c.eliminated) continue;
    for (const rid of c.regionIds) if (state.regions[rid].controller === id) start.push(rid);
  }
  const connected = new Set(start);
  const queue = [...start];
  while (queue.length) {
    const rid = queue.pop();
    for (const n of STATIC_REGIONS[rid].neighbors) {
      if (connected.has(n)) continue;
      const r = state.regions[n];
      if (r && set.has(r.controller)) {
        connected.add(n);
        queue.push(n);
      }
    }
  }
  return connected;
}

/** Delivery efficiency 0..1 to a region for a country. */
export function deliveryFactor(state, c, regionId, network) {
  const r = state.regions[regionId];
  if (!r) return 0;
  if (!network.has(regionId)) return 0.1; // cut off
  const infra = r.infrastructure / 100;
  const depot = Math.min(0.3, (r.buildings.depot ?? 0) * (FACILITIES.depot.supplyBonus ?? 0));
  const ownTerritory = r.owner === c.id ? 0.1 : 0;
  return clamp(0.35 + 0.55 * infra * (1 - r.devastation * 0.5) + depot + ownTerritory, 0.1, 1);
}
