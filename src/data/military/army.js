/**
 * Army unit templates (brigade-sized formations).
 *
 *   personnel   soldiers at full strength
 *   equipment   durable equipment at full strength
 *   attack      offensive combat value      defense   defensive combat value
 *   hardness    0..1 share of armoured targets (hard to damage without anti-armour)
 *   piercing    anti-armour capability (0..15)
 *   airDefense  value against enemy aircraft
 *   mobility    km per day on good roads
 *   fuel / ammo daily consumption in combat (t); peacetime is a fraction of it
 *   trainMonths time to raise the unit from recruits (reservists: 1 month)
 *   supplyBonus logistics units improve supply of units in the same region
 */
export const UNIT_TYPES = {
  infantry: {
    name: 'Infanterie', icon: '⚔', personnel: 8000,
    equipment: { infantryEquipment: 8000, vehicles: 250, artillery: 12 },
    attack: 10, defense: 15, hardness: 0.05, piercing: 3, airDefense: 1, mobility: 25, fuel: 15, ammo: 60, trainMonths: 4,
  },
  motorized: {
    name: 'Motorisierte Infanterie', icon: '🚚', personnel: 7000,
    equipment: { infantryEquipment: 7000, vehicles: 900, artillery: 12 },
    attack: 12, defense: 13, hardness: 0.1, piercing: 3, airDefense: 1, mobility: 60, fuel: 60, ammo: 60, trainMonths: 5,
  },
  mechanized: {
    name: 'Mechanisierte Infanterie', icon: '🛡', personnel: 6500,
    equipment: { infantryEquipment: 6500, vehicles: 350, armor: 250, artillery: 18 },
    attack: 19, defense: 19, hardness: 0.6, piercing: 9, airDefense: 2, mobility: 50, fuel: 140, ammo: 90, trainMonths: 6,
  },
  armored: {
    name: 'Panzertruppe', icon: '◼', personnel: 5000,
    equipment: { infantryEquipment: 5000, vehicles: 300, armor: 350, artillery: 24 },
    attack: 30, defense: 16, hardness: 0.85, piercing: 15, airDefense: 2, mobility: 45, fuel: 220, ammo: 110, trainMonths: 7,
  },
  artillery: {
    name: 'Artillerie', icon: '✸', personnel: 4000,
    equipment: { infantryEquipment: 4000, vehicles: 300, artillery: 120 },
    attack: 24, defense: 5, hardness: 0.15, piercing: 4, airDefense: 1, mobility: 35, fuel: 50, ammo: 300, trainMonths: 5,
  },
  recon: {
    name: 'Aufklärung', icon: '👁', personnel: 2500,
    equipment: { infantryEquipment: 2500, vehicles: 250, drones: 30 },
    attack: 6, defense: 6, hardness: 0.3, piercing: 4, airDefense: 1, mobility: 70, fuel: 40, ammo: 20, trainMonths: 4, combatBonus: 0.08,
  },
  airDefense: {
    name: 'Flugabwehr', icon: '⌖', personnel: 3000,
    equipment: { infantryEquipment: 3000, vehicles: 200, airDefense: 12, radar: 4 },
    attack: 2, defense: 6, hardness: 0.3, piercing: 2, airDefense: 40, mobility: 40, fuel: 40, ammo: 40, trainMonths: 6,
  },
  logistics: {
    name: 'Logistik', icon: '⛟', personnel: 4000,
    equipment: { infantryEquipment: 4000, vehicles: 1200 },
    attack: 1, defense: 3, hardness: 0.1, piercing: 0, airDefense: 0, mobility: 50, fuel: 120, ammo: 5, trainMonths: 3, supplyBonus: 0.25,
  },
};

export const UNIT_TYPE_IDS = Object.keys(UNIT_TYPES);

/** Terrain: defence multiplier for defenders, attrition, how long a siege takes. */
export const TERRAIN = {
  plains: { name: 'Ebene', defense: 1.0, siege: 1.0, attrition: 0 },
  forest: { name: 'Wald', defense: 1.25, siege: 1.2, attrition: 0.001 },
  jungle: { name: 'Dschungel', defense: 1.4, siege: 1.5, attrition: 0.003 },
  mountains: { name: 'Gebirge', defense: 1.6, siege: 1.6, attrition: 0.002 },
  desert: { name: 'Wüste', defense: 1.1, siege: 1.0, attrition: 0.002 },
  arctic: { name: 'Arktis', defense: 1.3, siege: 1.3, attrition: 0.004 },
  urban: { name: 'Stadt', defense: 1.45, siege: 1.8, attrition: 0.001 },
};

export const MOBILIZATION_LEVELS = [
  { id: 0, name: 'Frieden', description: 'Reserveverbände bleiben in Bereitschaft (geringe Kosten, geringe Einsatzbereitschaft).' },
  { id: 1, name: 'Teilmobilmachung', description: 'Reservisten werden eingezogen, Reserveverbände aktiviert. Kostet Arbeitskräfte und Zustimmung.' },
  { id: 2, name: 'Generalmobilmachung', description: 'Alle Reserven und Wehrpflichtige werden eingezogen. Maximale Kapazität, starke wirtschaftliche Belastung.' },
];
