/**
 * Unit level helpers: combat values, personnel, equipment needs.
 * Units are brigade-sized formations stored in country.military.units:
 *   { id, type, num, region, target, arrival, strength, equip, readiness,
 *     experience, morale, supply, org, status: 'active'|'reserve'|'training',
 *     trainingUntil, manual, inCombat }
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { getMod } from '../modifiers.js';

export function personnelOf(u) {
  return Math.round(UNIT_TYPES[u.type].personnel * u.strength);
}

/** Overall effectiveness multiplier 0..~1.5 */
export function effectiveness(u) {
  if (u.status !== 'active') return u.status === 'reserve' ? 0.25 * u.strength * (0.3 + 0.7 * u.equip) : 0;
  return u.strength * (0.3 + 0.7 * u.equip) * (0.4 + 0.6 * u.readiness) * (0.35 + 0.65 * u.supply) * (0.5 + 0.5 * u.morale) * (1 + 0.5 * u.experience);
}

export function techMultiplier(c) {
  return Math.max(0.2, 1 + getMod(c, 'militaryPower'));
}

export function attackValue(u, c) {
  return UNIT_TYPES[u.type].attack * effectiveness(u) * (0.3 + 0.7 * u.org) * techMultiplier(c);
}

export function defenseValue(u, c) {
  return UNIT_TYPES[u.type].defense * effectiveness(u) * (0.3 + 0.7 * u.org) * techMultiplier(c);
}

/** Equipment still missing for the unit to be at full equipment (per category). */
export function equipmentNeed(u) {
  const t = UNIT_TYPES[u.type];
  const need = {};
  const missing = Math.max(0, 1 - u.equip) * u.strength;
  for (const [k, v] of Object.entries(t.equipment)) need[k] = v * missing;
  return need;
}

/** Full equipment value of a unit (bn) – used for losses and maintenance. */
export function equipmentValue(type, EQUIPMENT) {
  let v = 0;
  for (const [k, n] of Object.entries(UNIT_TYPES[type].equipment)) v += n * EQUIPMENT[k].cost;
  return v;
}

/** Display name, e.g. "3. Panzertruppe". */
export function unitLabel(u) {
  return `${u.num}. ${UNIT_TYPES[u.type].name}`;
}
