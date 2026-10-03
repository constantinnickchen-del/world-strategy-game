/**
 * Arms production in domestic factories.
 *
 * Factories are facilities in regions; their production points (pp) per month
 * are distributed over the production queue in priority order. Every pp costs
 * money (from the defence budget) and raw materials (bought on the world
 * market – military demand raises prices). Ships cannot be built faster than
 * their minimum build time, big ships need big shipyards.
 *
 * Line: { id, kind: 'equipment'|'aircraft'|'ship', item, quantity, done, progress }
 */
import { EQUIPMENT } from '../../data/military/equipment.js';
import { AIRCRAFT_BY_ID } from '../../data/military/aircraft.js';
import { SHIP_CLASSES } from '../../data/military/navy.js';
import { FACILITIES } from '../../data/military/facilities.js';
import { SUPPLIER_HOME_PRODUCTION } from '../../data/military/profiles.js';
import { SUPPLIER_BY_ID } from '../../data/military/suppliers.js';
import { gdpPerCapita } from '../../state/selectors.js';
import { isResearched } from '../technology.js';
import { addNews } from '../news.js';
import { clamp } from '../../util/math.js';

/** Raw material units (world market) per bn of military production. */
export const RESOURCE_PER_BN = { metals: 0.08, rareEarths: 0.05, oil: 0.02 };

export function itemDef(kind, id) {
  if (kind === 'equipment') return EQUIPMENT[id];
  if (kind === 'aircraft') return AIRCRAFT_BY_ID[id];
  if (kind === 'ship') return SHIP_CLASSES[id];
  return null;
}

export function factoryFor(kind, id) {
  if (kind === 'equipment') return EQUIPMENT[id]?.factory ?? null;
  if (kind === 'aircraft') return 'aircraftFactory';
  if (kind === 'ship') return 'shipyard';
  return null;
}

/** Sum of factory levels of a type in regions the country owns and controls. */
export function factoryLevels(state, c, type) {
  let lv = 0;
  for (const rid of c.regionIds) {
    const r = state.regions[rid];
    if (r.controller !== c.id) continue;
    lv += (r.buildings[type] ?? 0) * (1 - r.devastation);
  }
  return lv;
}

export function maxShipyardLevel(state, c) {
  let best = 0;
  for (const rid of c.regionIds) {
    const r = state.regions[rid];
    if (r.controller === c.id) best = Math.max(best, r.buildings.shipyard ?? 0);
  }
  return best;
}

export function factoryCapacity(state, c, type) {
  const mob = [1, 1.1, 1.25][c.military.mobilization] ?? 1;
  return factoryLevels(state, c, type) * FACILITIES[type].pp * mob;
}

/** Labour is cheaper in poorer countries. */
export function productionCostFactor(c) {
  return 0.6 + 0.4 * Math.min(1, gdpPerCapita(c) / 40000);
}

/**
 * Can the country produce this item domestically? Returns an error string or null.
 */
export function canProduce(state, c, kind, id) {
  const def = itemDef(kind, id);
  if (!def) return 'Unbekanntes Produkt.';
  const factory = factoryFor(kind, id);
  if (!factory) return 'Wird nicht in Fabriken hergestellt (automatischer Einkauf).';
  if (factoryLevels(state, c, factory) <= 0) return `Keine ${FACILITIES[factory].name} vorhanden.`;
  if (def.requiresTech && !isResearched(c, def.requiresTech)) return 'Erforderliche Technologie fehlt.';
  if (kind === 'aircraft' && def.origin !== 'national') {
    const home = SUPPLIER_BY_ID[def.origin];
    const own = SUPPLIER_HOME_PRODUCTION[c.id];
    if (own !== def.origin && home?.home !== c.id && !(home?.partners ?? []).includes(c.id)) return `Lizenz liegt bei ${home?.name ?? 'Hersteller'} – nur über Beschaffung erhältlich.`;
  }
  if (kind === 'ship' && maxShipyardLevel(state, c) < def.shipyard) return `Benötigt eine Werft der Stufe ${def.shipyard}.`;
  return null;
}

/** Items the country can put into production (for UI and AI). */
export function producibleItems(state, c) {
  const out = [];
  for (const id of Object.keys(EQUIPMENT)) if (!canProduce(state, c, 'equipment', id)) out.push({ kind: 'equipment', id });
  for (const id of Object.keys(AIRCRAFT_BY_ID)) if (!canProduce(state, c, 'aircraft', id)) out.push({ kind: 'aircraft', id });
  for (const id of Object.keys(SHIP_CLASSES)) if (!canProduce(state, c, 'ship', id)) out.push({ kind: 'ship', id });
  return out;
}

/** Puts a finished item into service. */
export function deliverItem(state, c, kind, id, count = 1) {
  const m = c.military;
  if (kind === 'equipment') {
    m.stock[id] = (m.stock[id] ?? 0) + count;
  } else if (kind === 'aircraft') {
    const a = m.aircraft[id] ?? { count: 0, readiness: 1, age: 0 };
    const total = a.count + count;
    a.age = total > 0 ? (a.age * a.count) / total : 0;
    a.readiness = total > 0 ? (a.readiness * a.count + count) / total : 1;
    a.count = total;
    m.aircraft[id] = a;
  } else if (kind === 'ship') {
    let fleet = m.fleets.find((f) => state.regions[f.base]?.controller === c.id);
    if (!fleet) {
      const base = c.regionIds.find((rid) => state.regions[rid].controller === c.id && (state.regions[rid].buildings.navalBase || state.regions[rid].buildings.shipyard));
      if (!base) return;
      fleet = { id: `${c.id}-F${m.fleets.length + 1}-${state.time.day}`, name: `${m.fleets.length + 1}. Flotte`, base, ships: {}, condition: 1, age: 0 };
      m.fleets.push(fleet);
    }
    const before = Object.values(fleet.ships).reduce((s, n) => s + n, 0);
    fleet.ships[id] = (fleet.ships[id] ?? 0) + count;
    fleet.age = before + count > 0 ? (fleet.age * before) / (before + count) : 0;
  }
}

/** @param {{take:Function}} wallet */
/** Largest quantity a single production order or purchase contract may have. */
export const MAX_ORDER_QUANTITY = 1_000_000_000;

export function stepProduction(state, c, wallet) {
  const m = c.military;
  m.resourceUse = {};
  if (!m.production.length) return 0;
  const capLeft = {};
  const metalShortage = c.resources.metals.consumption > 0 ? clamp(c.resources.metals.shortage / c.resources.metals.consumption, 0, 1) : 0;
  const costFactor = productionCostFactor(c);
  let spent = 0;
  for (const line of m.production) {
    const factory = factoryFor(line.kind, line.item);
    if (capLeft[factory] === undefined) capLeft[factory] = factoryCapacity(state, c, factory) * (1 - 0.6 * metalShortage);
    const def = itemDef(line.kind, line.item);
    if (!def || canProduce(state, c, line.kind, line.item)) {
      line.blocked = def ? canProduce(state, c, line.kind, line.item) : 'Unbekannt';
      continue;
    }
    line.blocked = null;
    const remaining = line.quantity - line.done;
    let cap = capLeft[factory];
    if (line.kind === 'ship') {
      const slots = Math.max(1, Math.floor(maxShipyardLevel(state, c) / 2));
      cap = Math.min(cap, (def.pp * Math.min(remaining, slots)) / def.minMonths);
    } else {
      cap = Math.min(cap, remaining * def.pp - line.progress);
    }
    const moneyPerPP = (def.cost * costFactor) / def.pp;
    const affordable = wallet.left / moneyPerPP;
    const alloc = Math.max(0, Math.min(cap, affordable));
    if (alloc <= 0) {
      line.lastRate = 0;
      continue;
    }
    capLeft[factory] -= alloc;
    const money = wallet.take('production', alloc * moneyPerPP);
    spent += money;
    for (const [rid, k] of Object.entries(RESOURCE_PER_BN)) m.resourceUse[rid] = (m.resourceUse[rid] ?? 0) + money * k * 12;
    line.progress += alloc;
    line.lastRate = alloc / def.pp;
    const finished = Math.min(remaining, Math.floor(line.progress / def.pp + 1e-9));
    if (finished > 0) {
      line.progress -= finished * def.pp;
      line.done += finished;
      deliverItem(state, c, line.kind, line.item, finished);
    }
  }
  const completed = m.production.filter((l) => l.done >= l.quantity);
  if (completed.length && c.id === state.playerId) {
    for (const l of completed) {
      addNews(state, { category: 'economy', countryId: c.id, importance: 2, text: `Produktionsauftrag abgeschlossen: ${l.quantity} × ${itemDef(l.kind, l.item).name}.` });
    }
  }
  m.production = m.production.filter((l) => l.done < l.quantity);
  return spent;
}
