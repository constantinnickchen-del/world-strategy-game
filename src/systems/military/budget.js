/**
 * Military finances.
 *
 * The defence budget (share of GDP, set by the head of state) is a ceiling.
 * Each month it pays, in this order:
 *   1. upkeep: personnel, maintenance of equipment/aircraft/ships, facilities
 *   2. procurement contract installments
 *   3. construction of facilities
 *   4. production lines
 *   5. automatic purchases of supplies (fuel, rations, ammunition, spare parts)
 * Money that is not needed is not spent (it stays in the general budget).
 * If the budget does not even cover upkeep, readiness decays.
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { EQUIPMENT } from '../../data/military/equipment.js';
import { AIRCRAFT_BY_ID } from '../../data/military/aircraft.js';
import { SHIP_CLASSES } from '../../data/military/navy.js';
import { FACILITIES } from '../../data/military/facilities.js';
import { gdpPerCapita } from '../../state/selectors.js';
import { equipmentValue } from './units.js';

export function costPerSoldierYear(c) {
  return 0.00002 + 0.0000014 * (gdpPerCapita(c) / 1000);
}

const unitEquipValueCache = {};
function unitEquipValue(type) {
  if (unitEquipValueCache[type] === undefined) unitEquipValueCache[type] = equipmentValue(type, EQUIPMENT);
  return unitEquipValueCache[type];
}

/** Monthly upkeep in bn, split by category. */
export function monthlyUpkeep(state, c) {
  const m = c.military;
  const perSoldier = costPerSoldierYear(c) / 12;
  let personnel = m.reserve * perSoldier * 0.05;
  let equipment = 0;
  for (const u of m.units) {
    const t = UNIT_TYPES[u.type];
    const factor = u.status === 'reserve' ? 0.25 : 1;
    personnel += t.personnel * u.strength * perSoldier * factor;
    equipment += unitEquipValue(u.type) * u.equip * u.strength * (0.06 / 12) * (u.status === 'reserve' ? 0.35 : 1);
  }
  let aircraft = 0;
  for (const [id, a] of Object.entries(m.aircraft)) aircraft += AIRCRAFT_BY_ID[id].maintenance * a.count / 12;
  let ships = 0;
  for (const f of m.fleets) {
    for (const [cls, n] of Object.entries(f.ships)) {
      ships += (SHIP_CLASSES[cls].maintenance * n) / 12;
      personnel += SHIP_CLASSES[cls].crew * n * perSoldier;
    }
  }
  let facilities = 0;
  for (const rid of c.regionIds) {
    const b = state.regions[rid].buildings;
    for (const [type, lv] of Object.entries(b)) facilities += (FACILITIES[type].upkeep * lv) / 12;
  }
  const k = m.costFactor;
  const out = { personnel: personnel * k, equipment: equipment * k, aircraft: aircraft * k, ships: ships * k, facilities: facilities * k };
  out.total = out.personnel + out.equipment + out.aircraft + out.ships + out.facilities;
  return out;
}

export function monthlyMilitaryBudget(c) {
  return (c.economy.gdp * c.budget.military) / 12;
}

/** A simple wallet used during one monthly military tick. */
export function createWallet(amount) {
  return {
    left: amount,
    spent: {},
    take(category, wanted) {
      const got = Math.max(0, Math.min(this.left, wanted));
      this.left -= got;
      this.spent[category] = (this.spent[category] ?? 0) + got;
      return got;
    },
  };
}
