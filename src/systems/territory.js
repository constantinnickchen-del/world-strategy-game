/**
 * Monthly territory upkeep: war damage slowly heals, unrest in annexed or
 * occupied regions fades, and national totals are recomputed from regions
 * (population, resource capacity, GDP) before the economy runs.
 */
import { refreshTerritory } from '../state/territory.js';
import { STATIC_REGIONS } from '../state/worldIndex.js';
import { addNews } from './news.js';

export const territorySystem = {
  id: 'territory',
  monthly(state) {
    for (const r of Object.values(state.regions)) {
      if (!r.siege) r.devastation = Math.max(0, r.devastation - 0.03);
      const occupied = r.controller !== r.owner;
      r.unrest = Math.max(0, Math.min(100, r.unrest + (occupied ? 2 : -3)));
    }
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      refreshTerritory(state, c);
      // territorial claims being prepared become official
      if (c.claimsInProgress?.length) {
        for (const p of c.claimsInProgress.filter((x) => state.time.day >= x.until)) {
          const r = state.regions[p.region];
          if (r && r.owner !== c.id && !r.claims.includes(c.id)) {
            r.claims.push(c.id);
            addNews(state, { category: 'diplomacy', countryId: c.id, others: [r.owner], importance: c.id === state.playerId || r.owner === state.playerId ? 2 : 1, text: `${c.name} erhebt offiziell Anspruch auf ${STATIC_REGIONS[p.region].name} (${state.countries[r.owner].name}).` });
          }
        }
        c.claimsInProgress = c.claimsInProgress.filter((x) => state.time.day < x.until);
      }
    }
  },
};
