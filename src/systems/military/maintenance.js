/**
 * Maintenance: readiness of units, aircraft and ships depends on funding and
 * spare parts; equipment ages and old equipment loses reliability.
 */
import { AIRCRAFT_BY_ID } from '../../data/military/aircraft.js';
import { SHIP_CLASSES } from '../../data/military/navy.js';
import { EQUIPMENT } from '../../data/military/equipment.js';
import { equipmentValue } from './units.js';
import { clamp } from '../../util/math.js';

const SPARES_PER_BN = 0.003; // share of equipment value needed as spare parts per month

/** Value of everything that needs spare parts (bn). */
export function maintainedValue(c) {
  const m = c.military;
  let v = 0;
  for (const u of m.units) if (u.status !== 'reserve') v += equipmentValue(u.type, EQUIPMENT) * u.equip * u.strength;
  for (const [id, a] of Object.entries(m.aircraft)) v += AIRCRAFT_BY_ID[id].cost * a.count;
  for (const f of m.fleets) for (const [cls, n] of Object.entries(f.ships)) v += SHIP_CLASSES[cls].cost * n;
  return v;
}

export function sparePartsNeed(c) {
  return (maintainedValue(c) * SPARES_PER_BN) / EQUIPMENT.spareParts.cost;
}

/** @param {number} funding share of upkeep that could be paid (0..1) */
export function stepMaintenance(state, c, funding) {
  const m = c.military;
  const need = sparePartsNeed(c);
  const used = Math.min(need, m.stock.spareParts);
  m.stock.spareParts -= used;
  const spares = need > 0 ? used / need : 1;
  m.lastSparesFill = spares;
  const target = clamp(funding * (0.45 + 0.55 * spares), 0.1, 1);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  for (const u of m.units) {
    const t = u.status === 'reserve' ? Math.min(0.35, target) : target;
    u.readiness = clamp(u.readiness + (t - u.readiness) * 0.15, 0.05, 1);
    if (!u.inCombat) {
      u.morale = clamp(u.morale + (0.8 - u.morale) * 0.1, 0, 1);
      u.org = Math.min(1, u.org + 0.25);
      if (u.experience > 0.1) u.experience -= 0.003;
    }
    u.strength = r3(u.strength);
    u.equip = r3(u.equip);
    u.readiness = r3(u.readiness);
    u.experience = r3(u.experience);
    u.morale = r3(u.morale);
    u.supply = r3(u.supply);
    u.org = r3(u.org);
  }
  for (const [id, a] of Object.entries(m.aircraft)) {
    const model = AIRCRAFT_BY_ID[id];
    a.age += 1 / 12;
    const ageCap = 1 - Math.max(0, a.age - model.serviceLife) * 0.04;
    const t = clamp(target * model.reliability * ageCap / 0.9, 0.05, 1);
    a.readiness = clamp(a.readiness + (t - a.readiness) * 0.12, 0.02, 1);
    if (a.count <= 0.0001) delete m.aircraft[id];
  }
  for (const f of m.fleets) {
    f.age = (f.age ?? 10) + 1 / 12;
    const supportShips = f.ships.supply ?? 0;
    const support = Math.min(0.1, supportShips * (SHIP_CLASSES.supply.fleetSupport ?? 0));
    const ageCap = 1 - Math.max(0, f.age - 30) * 0.03;
    const t = clamp((target + support) * ageCap, 0.05, 1);
    f.condition = clamp(f.condition + (t - f.condition) * 0.1, 0.05, 1);
  }
}
