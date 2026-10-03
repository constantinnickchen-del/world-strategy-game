/**
 * Simple orders ("Aufrüsten"): one decision – e.g. "Panzer" or "Kampfjets" –
 * is turned into the necessary detailed steps (raise a formation, produce the
 * missing equipment in own factories, or buy it abroad). The plan is fully
 * transparent (cost, time, source) and is executed through the regular
 * military commands, so all rules of the detailed system still apply.
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { AIRCRAFT, AIRCRAFT_BY_ID } from '../../data/military/aircraft.js';
import { SHIP_CLASSES } from '../../data/military/navy.js';
import { EQUIPMENT } from '../../data/military/equipment.js';
import { canProduce, itemDef, factoryFor, factoryCapacity, productionCostFactor } from './production.js';
import { procurementOffers } from './procurement.js';
import { mobilizablePopulation, recruitPlan, trainingCapacity } from './manpower.js';
import { personnelOf } from './units.js';

export const QUICK_ORDERS = [
  { id: 'infantry', group: 'Heer', icon: '⚔', name: 'Infanterie', unitType: 'infantry', role: 'Günstige Soldaten mit Gewehren und Fahrzeugen. Gut zur Verteidigung und um Gebiete zu halten.' },
  { id: 'armored', group: 'Heer', icon: '◼', name: 'Panzer', unitType: 'armored', role: 'Kampfpanzer – die stärkste Angriffstruppe am Boden. Teuer, braucht viel Treibstoff.' },
  { id: 'artillery', group: 'Heer', icon: '✸', name: 'Artillerie', unitType: 'artillery', role: 'Schwere Geschütze. Unterstützen Angriffe aus der Distanz.' },
  { id: 'airDefense', group: 'Heer', icon: '⌖', name: 'Flugabwehr', unitType: 'airDefense', role: 'Schützt die eigenen Truppen vor feindlichen Flugzeugen.' },
  { id: 'fighters', group: 'Luftwaffe', icon: '✈', name: 'Kampfjets', aircraftRoles: ['fighter'], count: 10, role: 'Erkämpfen die Luftherrschaft – wer sie hat, gewinnt Schlachten leichter.' },
  { id: 'bombers', group: 'Luftwaffe', icon: '✈', name: 'Bomber', aircraftRoles: ['bomber'], count: 4, role: 'Greifen feindliche Truppen am Boden an.' },
  { id: 'drones', group: 'Luftwaffe', icon: '🛩', name: 'Drohnen', aircraftRoles: ['drone'], count: 20, role: 'Günstige unbemannte Luftunterstützung für die Front.' },
  { id: 'warship', group: 'Marine', icon: '⚓', name: 'Kriegsschiff', shipClasses: ['destroyer', 'frigate', 'corvette', 'patrol'], count: 1, role: 'Sichert die Seeherrschaft, Blockaden und Landungen.' },
  { id: 'submarine', group: 'Marine', icon: '🌊', name: 'U-Boot', shipClasses: ['submarine'], count: 1, role: 'Versenkt feindliche Schiffe und hilft bei Seeblockaden.' },
];

export const QUICK_ORDER_BY_ID = Object.fromEntries(QUICK_ORDERS.map((o) => [o.id, o]));

/** Months a factory type needs for `pp` production points (ignores other orders). */
function factoryMonths(state, c, kind, id, quantity) {
  const def = itemDef(kind, id);
  const cap = factoryCapacity(state, c, factoryFor(kind, id));
  let months = cap > 0 ? (def.pp * quantity) / cap : Infinity;
  if (kind === 'ship') months = Math.max(months, def.minMonths);
  return Math.max(1, Math.ceil(months));
}

/** Cheapest available foreign offer for an item (or null). */
function bestOffer(offers, kind, id) {
  return offers.filter((o) => o.kind === kind && o.item === id && !o.refusal).sort((a, b) => a.unitPrice - b.unitPrice)[0] ?? null;
}

/** How to get `quantity` of an item: own production, else purchase. */
function sourceFor(state, c, offers, kind, id, quantity) {
  if (!canProduce(state, c, kind, id)) {
    const def = itemDef(kind, id);
    return {
      cmd: { type: 'queueProduction', kind, item: id, quantity },
      cost: def.cost * productionCostFactor(c) * quantity,
      months: factoryMonths(state, c, kind, id, quantity),
      how: 'eigene Fabriken',
    };
  }
  const offer = bestOffer(offers, kind, id);
  if (!offer) return null;
  const q = Math.min(quantity, offer.maxQuantity);
  return {
    cmd: { type: 'signContract', supplier: offer.supplier, kind, item: id, quantity: q },
    cost: offer.unitPrice * q,
    months: offer.leadMonths + Math.ceil(q / Math.max(0.01, offer.rate)),
    how: `Kauf bei ${offer.supplierName}`,
  };
}

function homeRegion(state, c) {
  if (state.regions[c.capitalRegion]?.controller === c.id) return c.capitalRegion;
  return c.regionIds.find((rid) => state.regions[rid].controller === c.id) ?? null;
}

function planUnit(state, c, order) {
  const t = UNIT_TYPES[order.unitType];
  const regionId = homeRegion(state, c);
  if (!regionId) return { error: 'Keine Region unter eigener Kontrolle.' };
  const m = c.military;
  const fromReserve = m.reserve >= t.personnel;
  if (!fromReserve && mobilizablePopulation(c) < t.personnel) return { error: 'Nicht genug wehrfähige Bevölkerung.' };
  const recruit = recruitPlan(c, order.unitType);
  if (!fromReserve && (m.trainingLeft ?? trainingCapacity(c)) < recruit.places) return { error: 'Ausbildungsplätze für diesen Monat belegt – nächsten Monat wieder möglich (oder Mobilmachung anordnen).' };
  const steps = [{ type: 'raiseUnit', unitType: order.unitType, regionId }];
  let cost = 0;
  let months = fromReserve ? 1 : recruit.months;
  const sources = [];
  const missingNames = [];
  const offers = procurementOffers(state, c.id);
  // equipment the new formation needs beyond what is in the depots (units still waiting for equipment count too)
  const waiting = {};
  for (const u of m.units) {
    if (u.status === 'reserve' || u.equip >= 0.999) continue;
    for (const [k, n] of Object.entries(UNIT_TYPES[u.type].equipment)) waiting[k] = (waiting[k] ?? 0) + n * (1 - u.equip) * u.strength;
  }
  for (const [k, n] of Object.entries(t.equipment)) {
    const missing = Math.ceil(Math.max(0, n + (waiting[k] ?? 0) - m.stock[k]));
    if (missing <= 0) continue;
    const src = sourceFor(state, c, offers, 'equipment', k, Math.min(missing, Math.ceil(n * 1.05)));
    if (!src) {
      missingNames.push(EQUIPMENT[k].name);
      continue;
    }
    steps.push(src.cmd);
    cost += src.cost;
    months = Math.max(months, src.months);
    sources.push(src.how);
  }
  return {
    steps,
    cost,
    months,
    gives: `1 Verband ${t.name} (${t.personnel.toLocaleString('de-DE')} Soldaten${t.equipment.armor ? `, ${t.equipment.armor} Panzer` : ''}${t.equipment.artillery >= 100 ? `, ${t.equipment.artillery} Geschütze` : ''})`,
    sources: sources.length ? [`Ausrüstung: ${[...new Set(sources)].join(', ')}`] : ['Ausrüstung vorhanden (Lager)'],
    warning: missingNames.length ? `Nicht beschaffbar: ${missingNames.join(', ')} – der Verband bleibt teilweise unausgerüstet.` : null,
    personnel: fromReserve ? 'aus der Reserve' : 'neue Rekruten',
  };
}

function planAircraft(state, c, order) {
  const offers = procurementOffers(state, c.id);
  const models = AIRCRAFT.filter((a) => order.aircraftRoles.includes(a.role));
  const value = (a) => a.airAttack + a.groundAttack;
  const own = models.filter((a) => !canProduce(state, c, 'aircraft', a.id)).sort((a, b) => value(b) - value(a))[0];
  let src = own ? sourceFor(state, c, offers, 'aircraft', own.id, order.count) : null;
  let model = own;
  if (!src) {
    const options = models
      .map((a) => ({ a, o: bestOffer(offers, 'aircraft', a.id) }))
      .filter((x) => x.o)
      .sort((x, y) => value(y.a) / y.o.unitPrice - value(x.a) / x.o.unitPrice);
    if (!options.length) return { error: 'Keine eigene Flugzeugfabrik mit passendem Muster und kein Hersteller, der an Sie liefert.' };
    model = options[0].a;
    src = sourceFor(state, c, offers, 'aircraft', model.id, order.count);
  }
  return {
    steps: [src.cmd],
    cost: src.cost,
    months: src.months,
    gives: `${src.cmd.quantity} × ${model.name}`,
    sources: [src.how],
    warning: null,
  };
}

/** Ships need a home port: a controlled region with a naval base or a shipyard. */
export function hasHomePort(state, c) {
  return c.regionIds.some((rid) => state.regions[rid].controller === c.id && (state.regions[rid].buildings.navalBase || state.regions[rid].buildings.shipyard));
}

function planShip(state, c, order) {
  if (!hasHomePort(state, c)) return { error: 'Kein Hafen für Kriegsschiffe – bauen Sie zuerst eine Marinebasis oder Werft in einer Küstenregion (Militär → Anlagen).' };
  const offers = procurementOffers(state, c.id);
  for (const cls of order.shipClasses) {
    if (!canProduce(state, c, 'ship', cls)) {
      const src = sourceFor(state, c, offers, 'ship', cls, order.count);
      return { steps: [src.cmd], cost: src.cost, months: src.months, gives: `${order.count} × ${SHIP_CLASSES[cls].name}`, sources: [src.how], warning: null };
    }
  }
  for (const cls of order.shipClasses) {
    const offer = bestOffer(offers, 'ship', cls);
    if (offer) {
      const src = sourceFor(state, c, offers, 'ship', cls, order.count);
      return { steps: [src.cmd], cost: src.cost, months: src.months, gives: `${order.count} × ${SHIP_CLASSES[cls].name}`, sources: [src.how], warning: null };
    }
  }
  return { error: 'Die Werften sind zu klein und kein Hersteller liefert an Sie.' };
}

/**
 * Plan for a simple order: { steps, cost, months, gives, sources, warning } or { error }.
 */
export function planQuickOrder(state, c, orderId) {
  const order = QUICK_ORDER_BY_ID[orderId];
  if (!order) return { error: 'Unbekannter Auftrag.' };
  if (c.military.production.length >= 18) return { error: 'Die Produktionswarteschlange ist voll.' };
  if (order.unitType) return planUnit(state, c, order);
  if (order.aircraftRoles) return planAircraft(state, c, order);
  return planShip(state, c, order);
}

/** Simple totals for the player-facing overview. */
export function forceSummary(c) {
  const m = c.military;
  let soldiers = 0;
  let units = 0;
  let tanks = m.stock.armor ?? 0;
  let guns = m.stock.artillery ?? 0;
  for (const u of m.units) {
    if (u.status === 'reserve') continue;
    soldiers += personnelOf(u);
    if (u.status === 'active') units++;
    const t = UNIT_TYPES[u.type];
    tanks += (t.equipment.armor ?? 0) * u.equip * u.strength;
    guns += (t.equipment.artillery ?? 0) * u.equip * u.strength;
  }
  let aircraft = 0;
  let fighters = 0;
  let bombers = 0;
  let drones = 0;
  for (const [id, a] of Object.entries(m.aircraft)) {
    const role = AIRCRAFT_BY_ID[id].role;
    aircraft += a.count;
    if (role === 'fighter' || role === 'interceptor') fighters += a.count;
    if (role === 'bomber') bombers += a.count;
    if (role === 'drone') drones += a.count;
  }
  let ships = 0;
  let warships = 0;
  let submarines = 0;
  let carriers = 0;
  for (const f of m.fleets) {
    for (const [cls, n] of Object.entries(f.ships)) {
      ships += n;
      if (SHIP_CLASSES[cls].naval >= 6 && cls !== 'submarine') warships += n;
      if (cls === 'submarine') submarines += n;
      if (cls === 'carrier') carriers += n;
    }
  }
  return {
    soldiers: Math.round(soldiers),
    reserve: Math.round(m.reserve),
    units,
    tanks: Math.round(tanks),
    guns: Math.round(guns),
    aircraft,
    fighters,
    bombers,
    drones,
    ships,
    warships,
    submarines,
    carriers,
    power: m.power,
    landPower: m.landPower,
    airPower: m.airPower,
    navalPower: m.navalPower,
  };
}

/** Sums force summaries of several countries (a war side). */
export function sideSummary(state, ids) {
  const total = {};
  for (const id of ids) {
    const s = forceSummary(state.countries[id]);
    for (const [k, v] of Object.entries(s)) total[k] = (total[k] ?? 0) + v;
  }
  return total;
}
