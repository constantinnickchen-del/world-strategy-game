/**
 * Military equipment and consumables (abstract strategic values only).
 *
 * All money values are bn USD (constant 2019 prices), like the rest of the game.
 *   cost      price of one unit when produced domestically
 *   pp        production points per unit (factory capacity, see facilities.js)
 *   factory   which factory type produces it (null = bought automatically)
 *   priceLink market resource whose price index scales the cost (fuel ↔ oil, rations ↔ food)
 */
export const EQUIPMENT = {
  infantryEquipment: { name: 'Infanterieausrüstung', unit: 'Sätze', cost: 0.000005, pp: 0.002, factory: 'munitionsFactory' },
  vehicles: { name: 'Fahrzeuge & Transporter', unit: 'Fzg.', cost: 0.00015, pp: 0.12, factory: 'vehicleFactory' },
  armor: { name: 'Gepanzerte Fahrzeuge', unit: 'Fzg.', cost: 0.005, pp: 4, factory: 'vehicleFactory' },
  artillery: { name: 'Artilleriesysteme', unit: 'Systeme', cost: 0.003, pp: 2.5, factory: 'vehicleFactory' },
  airDefense: { name: 'Luftabwehrsysteme', unit: 'Batterien', cost: 0.08, pp: 40, factory: 'vehicleFactory' },
  radar: { name: 'Radaranlagen', unit: 'Anlagen', cost: 0.03, pp: 15, factory: 'vehicleFactory' },
  drones: { name: 'Drohnen', unit: 'Systeme', cost: 0.002, pp: 1, factory: 'aircraftFactory' },
  ammunition: { name: 'Munition', unit: 't', cost: 0.00001, pp: 0.005, factory: 'munitionsFactory' },
  precisionMunitions: { name: 'Präzisionsmunition', unit: 'Stück', cost: 0.0002, pp: 0.1, factory: 'munitionsFactory', requiresTech: 'precisionGuidance' },
  spareParts: { name: 'Ersatzteile', unit: 't', cost: 0.00005, pp: 0.02, factory: 'munitionsFactory' },
  fuel: { name: 'Treibstoff', unit: 't', cost: 0.0000008, factory: null, priceLink: 'oil' },
  rations: { name: 'Verpflegung', unit: 't', cost: 0.000003, factory: null, priceLink: 'food' },
};

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);
/** Equipment that units need permanently (as opposed to consumables). */
export const DURABLE_EQUIPMENT = ['infantryEquipment', 'vehicles', 'armor', 'artillery', 'airDefense', 'radar', 'drones'];
export const CONSUMABLES = ['ammunition', 'precisionMunitions', 'fuel', 'rations', 'spareParts'];
