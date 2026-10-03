/**
 * Ship classes (generic designs; every country with a large enough shipyard can
 * build them, suppliers also sell some of them).
 *
 *   naval      surface combat value        antiSub   anti-submarine value
 *   airDefense fleet air defence           blockade  contribution to blockades
 *   crew       personnel                   minMonths minimum build time per hull
 *   shipyard   required shipyard level     maintenance bn per ship and year
 *   carries    aircraft capacity (carriers)  landing   army units it can land (amphibious)
 */
export const SHIP_CLASSES = {
  patrol: { name: 'Patrouillenboot', naval: 2, antiSub: 1, airDefense: 1, blockade: 1, crew: 40, cost: 0.05, pp: 20, minMonths: 6, shipyard: 1, maintenance: 0.003, serviceLife: 25 },
  corvette: { name: 'Korvette', naval: 6, antiSub: 4, airDefense: 3, blockade: 2, crew: 100, cost: 0.3, pp: 120, minMonths: 12, shipyard: 1, maintenance: 0.015, serviceLife: 30 },
  frigate: { name: 'Fregatte', naval: 10, antiSub: 9, airDefense: 8, blockade: 3, crew: 180, cost: 0.7, pp: 300, minMonths: 24, shipyard: 2, maintenance: 0.035, serviceLife: 35 },
  destroyer: { name: 'Zerstörer', naval: 18, antiSub: 10, airDefense: 16, blockade: 4, crew: 300, cost: 1.6, pp: 650, minMonths: 30, shipyard: 3, maintenance: 0.08, serviceLife: 35 },
  cruiser: { name: 'Kreuzer', naval: 26, antiSub: 7, airDefense: 22, blockade: 5, crew: 400, cost: 2.8, pp: 1100, minMonths: 40, shipyard: 4, maintenance: 0.13, serviceLife: 35 },
  submarine: { name: 'U-Boot', naval: 14, antiSub: 8, airDefense: 0, blockade: 6, crew: 50, cost: 0.8, pp: 350, minMonths: 30, shipyard: 3, maintenance: 0.04, serviceLife: 30 },
  supply: { name: 'Versorgungsschiff', naval: 0, antiSub: 0, airDefense: 2, blockade: 0, crew: 100, cost: 0.4, pp: 160, minMonths: 18, shipyard: 2, maintenance: 0.015, serviceLife: 35, fleetSupport: 0.05 },
  amphibious: { name: 'Landungsschiff', naval: 2, antiSub: 0, airDefense: 4, blockade: 0, crew: 250, cost: 1.0, pp: 400, minMonths: 28, shipyard: 3, maintenance: 0.04, serviceLife: 35, landing: 1 },
  carrier: { name: 'Flugzeugträger', naval: 30, antiSub: 6, airDefense: 10, blockade: 4, crew: 4500, cost: 9, pp: 3600, minMonths: 72, shipyard: 6, maintenance: 0.4, serviceLife: 50, carries: 60, requiresTech: 'carrierOperations' },
};

export const SHIP_CLASS_IDS = Object.keys(SHIP_CLASSES);
