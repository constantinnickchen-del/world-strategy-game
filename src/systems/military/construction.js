/**
 * Construction of military facilities (factories, shipyards, bases, depots).
 * Projects are paid monthly from the defence budget; unpaid months stall.
 * Project: { id, region, type, monthsDone, months, monthlyCost }
 */
import { FACILITIES } from '../../data/military/facilities.js';
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { addNews } from '../news.js';

export function constructionError(state, c, regionId, type) {
  const def = FACILITIES[type];
  if (!def) return 'Unbekannter Anlagentyp.';
  const r = state.regions[regionId];
  if (!r) return 'Unbekannte Region.';
  if (r.owner !== c.id || r.controller !== c.id) return 'Nur in eigenen, kontrollierten Regionen möglich.';
  if (def.coastal && !STATIC_REGIONS[regionId].coastal) return 'Benötigt eine Küstenregion.';
  const queued = c.military.construction.filter((p) => p.region === regionId && p.type === type).length;
  if ((r.buildings[type] ?? 0) + queued >= def.maxLevel) return `Maximale Stufe (${def.maxLevel}) erreicht.`;
  if (c.military.construction.length >= 12) return 'Höchstens 12 Bauprojekte gleichzeitig.';
  return null;
}

export function startConstruction(state, c, regionId, type) {
  const def = FACILITIES[type];
  state.world.seq = (state.world.seq ?? 0) + 1;
  const p = { id: `B${state.world.seq}`, region: regionId, type, monthsDone: 0, months: def.months, monthlyCost: def.cost / def.months };
  c.military.construction.push(p);
  return p;
}

export function stepConstruction(state, c, wallet) {
  const m = c.military;
  let spent = 0;
  for (const p of m.construction) {
    const r = state.regions[p.region];
    if (r.owner !== c.id || r.controller !== c.id) {
      p.stalled = 'Region nicht unter Kontrolle';
      continue;
    }
    const cost = p.monthlyCost * m.costFactor;
    if (wallet.left < cost) {
      p.stalled = 'Budget reicht nicht';
      continue;
    }
    spent += wallet.take('construction', cost);
    p.stalled = null;
    p.monthsDone += 1;
    if (p.monthsDone >= p.months) {
      r.buildings[p.type] = (r.buildings[p.type] ?? 0) + 1;
      if (c.id === state.playerId) {
        addNews(state, { category: 'economy', countryId: c.id, importance: 2, text: `Fertiggestellt: ${FACILITIES[p.type].name} (Stufe ${r.buildings[p.type]}) in ${STATIC_REGIONS[p.region].name}.` });
      }
    }
  }
  m.construction = m.construction.filter((p) => p.monthsDone < p.months);
  return spent;
}
