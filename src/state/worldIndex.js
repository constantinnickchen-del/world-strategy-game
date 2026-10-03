/**
 * Static world data index + derived (non-saved) caches.
 *
 * Static facts (region names, adjacency, label positions) come from the
 * generated world module and never enter the save file. Dynamic facts derived
 * from the state (e.g. which countries border each other, which depends on
 * region ownership) are cached per state object and invalidated through
 * `state.world.ownershipVersion`.
 */
import { REGIONS, COUNTRIES } from '../data/generated/world.js';

export const STATIC_REGIONS = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const STATIC_COUNTRIES = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));

const caches = new WeakMap();

function cacheFor(state) {
  let c = caches.get(state);
  if (!c || c.version !== state.world.ownershipVersion) {
    c = { version: state.world.ownershipVersion, neighbors: new Map() };
    caches.set(state, c);
  }
  return c;
}

/** Countries sharing a land border with `countryId` (based on current region ownership). */
export function neighborCountryIds(state, countryId) {
  const cache = cacheFor(state);
  let list = cache.neighbors.get(countryId);
  if (list) return list;
  const set = new Set();
  for (const rid of state.countries[countryId]?.regionIds ?? []) {
    for (const nid of STATIC_REGIONS[rid]?.neighbors ?? []) {
      const owner = state.regions[nid]?.owner;
      if (owner && owner !== countryId) set.add(owner);
    }
  }
  list = [...set].sort();
  cache.neighbors.set(countryId, list);
  return list;
}

export function areNeighbors(state, a, b) {
  return neighborCountryIds(state, a).includes(b);
}

/** Call after changing region ownership so derived caches are rebuilt. */
export function markOwnershipChanged(state) {
  state.world.ownershipVersion++;
}
