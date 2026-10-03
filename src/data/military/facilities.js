/**
 * Military facilities built in regions (levels 1..maxLevel).
 *   cost bn per level, months build time, upkeep bn per level and year,
 *   pp production points per level and month (factories),
 *   capacity aircraft/ships supported per level (bases), coastal = needs a coast.
 */
export const FACILITIES = {
  vehicleFactory: { name: 'Fahrzeugfabrik', icon: '🏭', cost: 0.5, months: 18, upkeep: 0.02, pp: 80, maxLevel: 10, produces: 'Fahrzeuge, Panzer, Artillerie, Luftabwehr, Radar' },
  munitionsFactory: { name: 'Munitionsfabrik', icon: '💥', cost: 0.3, months: 12, upkeep: 0.012, pp: 60, maxLevel: 10, produces: 'Munition, Infanterieausrüstung, Ersatzteile' },
  aircraftFactory: { name: 'Flugzeugfabrik', icon: '✈', cost: 1.0, months: 24, upkeep: 0.04, pp: 50, maxLevel: 10, produces: 'Flugzeuge, Drohnen' },
  shipyard: { name: 'Werft', icon: '⚓', cost: 1.2, months: 30, upkeep: 0.05, pp: 60, maxLevel: 10, coastal: true, produces: 'Schiffe (Größe abhängig von der Stufe)' },
  airBase: { name: 'Luftwaffenstützpunkt', icon: '🛫', cost: 0.3, months: 12, upkeep: 0.015, capacity: 80, maxLevel: 10 },
  navalBase: { name: 'Marinebasis', icon: '⛴', cost: 0.6, months: 18, upkeep: 0.03, capacity: 25, maxLevel: 10, coastal: true },
  depot: { name: 'Militärdepot', icon: '📦', cost: 0.15, months: 6, upkeep: 0.006, maxLevel: 5, supplyBonus: 0.15 },
};

export const FACILITY_IDS = Object.keys(FACILITIES);
export const FACTORY_TYPES = ['vehicleFactory', 'munitionsFactory', 'aircraftFactory', 'shipyard'];
