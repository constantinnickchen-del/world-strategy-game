/**
 * Aggregated military strength (used by diplomacy, AI and the UI).
 * Everything is derived from actual units, aircraft and ships.
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { AIRCRAFT_BY_ID } from '../../data/military/aircraft.js';
import { SHIP_CLASSES } from '../../data/military/navy.js';
import { effectiveness, techMultiplier, personnelOf } from './units.js';

export const LAND_WEIGHT = 35;
export const AIR_WEIGHT = 0.25;
export const NAVAL_WEIGHT = 3;

export function landPower(c) {
  let p = 0;
  for (const u of c.military.units) {
    const t = UNIT_TYPES[u.type];
    p += ((t.attack + t.defense) / 2) * effectiveness(u);
  }
  return p * techMultiplier(c);
}

export function airPowerOf(c, { roles = null } = {}) {
  let p = 0;
  for (const [id, a] of Object.entries(c.military.aircraft)) {
    const m = AIRCRAFT_BY_ID[id];
    if (roles && !roles.includes(m.role)) continue;
    p += (m.airAttack + m.groundAttack * 0.5) * a.count * a.readiness;
  }
  return p * techMultiplier(c);
}

export function navalPowerOf(c) {
  let p = 0;
  for (const f of c.military.fleets) {
    for (const [cls, n] of Object.entries(f.ships)) p += (SHIP_CLASSES[cls].naval + SHIP_CLASSES[cls].antiSub * 0.3) * n * f.condition;
  }
  return p * techMultiplier(c);
}

export function activePersonnel(c) {
  let n = 0;
  for (const u of c.military.units) if (u.status !== 'reserve') n += personnelOf(u);
  for (const f of c.military.fleets) for (const [cls, k] of Object.entries(f.ships)) n += SHIP_CLASSES[cls].crew * k;
  return n;
}

export function shipCount(c, cls = null) {
  let n = 0;
  for (const f of c.military.fleets) for (const [k, v] of Object.entries(f.ships)) if (!cls || k === cls) n += v;
  return n;
}

export function aircraftCount(c, role = null) {
  let n = 0;
  for (const [id, a] of Object.entries(c.military.aircraft)) if (!role || AIRCRAFT_BY_ID[id].role === role) n += a.count;
  return n;
}

export function refreshPower(c) {
  const m = c.military;
  m.landPower = landPower(c);
  m.airPower = airPowerOf(c);
  m.navalPower = navalPowerOf(c);
  // weights put army, air force and navy on a comparable scale (a brigade ≈ several hundred points)
  m.power = m.landPower * LAND_WEIGHT + m.airPower * AIR_WEIGHT + m.navalPower * NAVAL_WEIGHT;
  return m.power;
}
