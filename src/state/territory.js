/**
 * Territory: who owns and who controls each region, and everything that
 * follows from it (GDP, population, resource capacity, capital, existence).
 *
 *   region.owner       legal owner (changes only by peace treaty / annexation)
 *   region.controller  who actually controls it (changes by occupation in war)
 *
 * All national totals that depend on territory are derived here, so a change
 * of control or ownership immediately moves economy, resources and people.
 */
import { RESOURCE_IDS } from '../data/resources.js';
import { STATIC_REGIONS, markOwnershipChanged } from './worldIndex.js';
import { addNews } from '../systems/news.js';

/** Share of a region's economic output the legal owner keeps while it is occupied. */
export const OCCUPIED_OWNER_OUTPUT = 0.3;
/** Share of an occupied region's output the occupier can extract. */
export const OCCUPIER_OUTPUT = 0.12;
/** Resource extraction efficiency in occupied regions. */
export const OCCUPIED_RESOURCE_OUTPUT = 0.5;

const controlCache = new WeakMap();

/** Region ids controlled by a country (cached per control version). */
export function controlledRegionIds(state, countryId) {
  let entry = controlCache.get(state);
  if (!entry || entry.version !== state.world.controlVersion) {
    const map = new Map();
    for (const r of Object.values(state.regions)) {
      let list = map.get(r.controller);
      if (!list) map.set(r.controller, (list = []));
      list.push(r.id);
    }
    for (const list of map.values()) list.sort();
    entry = { version: state.world.controlVersion, map };
    controlCache.set(state, entry);
  }
  return entry.map.get(countryId) ?? [];
}

export function isOccupied(region) {
  return region.controller !== region.owner;
}

export function markControlChanged(state) {
  state.world.controlVersion = (state.world.controlVersion ?? 0) + 1;
}

/** Changes who controls a region (occupation or liberation). */
export function setController(state, regionId, countryId) {
  const r = state.regions[regionId];
  if (!r || r.controller === countryId) return;
  r.controller = countryId;
  r.siege = null;
  r.occupiedSince = countryId === r.owner ? null : state.time.day;
  markControlChanged(state);
}

/** Economic output of a country derived from its regions. */
export function computeGdp(state, c) {
  let gdp = 0;
  for (const rid of c.regionIds) {
    const r = state.regions[rid];
    const out = r.controller === c.id ? 1 : OCCUPIED_OWNER_OUTPUT;
    gdp += r.econ * out * (1 - 0.5 * r.devastation);
  }
  for (const rid of controlledRegionIds(state, c.id)) {
    const r = state.regions[rid];
    if (r.owner !== c.id) gdp += r.econ * OCCUPIER_OUTPUT * (1 - r.devastation);
  }
  return Math.max(0.01, gdp);
}

/** Resource capacity per resource from the regions a country controls. */
export function computeResourceCapacity(state, c, rid) {
  let cap = 0;
  for (const regId of controlledRegionIds(state, c.id)) {
    const r = state.regions[regId];
    const v = r.resources[rid];
    if (!v) continue;
    cap += v * (r.owner === c.id ? 1 : OCCUPIED_RESOURCE_OUTPUT) * (1 - 0.6 * r.devastation);
  }
  return cap;
}

/** Recomputes population, resource capacity and GDP of a country from its territory. */
export function refreshTerritory(state, c) {
  let pop = 0;
  let occupiedPop = 0;
  for (const rid of c.regionIds) {
    const r = state.regions[rid];
    pop += r.population;
    if (r.controller !== c.id) occupiedPop += r.population;
  }
  c.population = pop;
  c.occupiedShare = pop > 0 ? occupiedPop / pop : 0;
  for (const rid of RESOURCE_IDS) c.resources[rid].capacity = computeResourceCapacity(state, c, rid);
  c.economy.gdp = computeGdp(state, c);
}

/** Moves the capital to the most populous owned and controlled region. */
export function relocateCapital(state, c, { announce = true } = {}) {
  const candidates = c.regionIds.filter((id) => state.regions[id].controller === c.id);
  const pool = candidates.length ? candidates : c.regionIds;
  if (!pool.length) return null;
  const best = pool.reduce((a, b) => (state.regions[b].population > state.regions[a].population ? b : a));
  if (best !== c.capitalRegion) {
    const old = c.capitalRegion;
    c.capitalRegion = best;
    if (announce) {
      addNews(state, {
        category: 'politics',
        countryId: c.id,
        importance: c.id === state.playerId ? 3 : 2,
        text: `${c.name} verlegt den Regierungssitz von ${STATIC_REGIONS[old]?.name ?? old} nach ${STATIC_REGIONS[best].name}.`,
      });
    }
  }
  return best;
}

/**
 * Permanently transfers a region to a new owner (peace treaty, annexation).
 * Units of the former owner in the region are handled by the military module.
 */
export function transferRegion(state, regionId, newOwner) {
  const r = state.regions[regionId];
  if (!r || r.owner === newOwner) return;
  const from = state.countries[r.owner];
  const to = state.countries[newOwner];
  from.regionIds = from.regionIds.filter((id) => id !== regionId);
  to.regionIds.push(regionId);
  to.regionIds.sort();
  r.owner = newOwner;
  r.controller = newOwner;
  r.siege = null;
  r.occupiedSince = null;
  r.unrest = from && r.cores.includes(from.id) ? 40 : 10;
  r.claims = r.claims.filter((c) => c !== newOwner);
  // Facilities partly survive the change of owner
  for (const k of Object.keys(r.buildings)) r.buildings[k] = Math.floor(r.buildings[k] / 2);
  markOwnershipChanged(state);
  markControlChanged(state);
  if (from.capitalRegion === regionId) relocateCapital(state, from);
  refreshTerritory(state, from);
  refreshTerritory(state, to);
  if (!from.regionIds.length) eliminateCountry(state, from, to);
}

export function eliminateCountry(state, c, conqueror) {
  if (c.eliminated) return;
  c.eliminated = true;
  c.military.units = [];
  c.military.fleets = [];
  for (const m of Object.keys(c.military.aircraft)) c.military.aircraft[m].count = 0;
  addNews(state, {
    category: 'world',
    countryId: c.id,
    others: conqueror ? [conqueror.id] : [],
    importance: 3,
    text: `${c.name} hat als Staat aufgehört zu existieren${conqueror ? ` – das gesamte Gebiet steht unter der Kontrolle von ${conqueror.name}` : ''}.`,
  });
}

/** Static + dynamic description of a region for the UI. */
export function regionInfo(state, regionId) {
  return { static: STATIC_REGIONS[regionId], dynamic: state.regions[regionId] };
}
