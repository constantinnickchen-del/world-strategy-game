/**
 * Research. Research points depend on spending relative to GDP, development
 * level and (logarithmically) economy size, so small countries are not locked
 * out and superpowers do not finish the tree in a year. Technologies already
 * known by many countries are cheaper (technology diffusion).
 */
import { TECHNOLOGIES, TECH_BY_ID } from '../data/technologies.js';
import { getMod } from './modifiers.js';
import { addNews } from './news.js';
import { gdpPerCapita } from '../state/selectors.js';
import { clamp } from '../util/math.js';

export function researchPointsPerMonth(c) {
  const spending = Math.pow(c.budget.research / 0.025, 0.7);
  const dev = clamp(0.6 + gdpPerCapita(c) / 30000, 0.6, 1.6);
  const size = clamp(0.6 + 0.25 * Math.log10(Math.max(1, c.economy.gdp) / 50), 0.5, 1.6);
  const stability = 0.6 + 0.4 * (c.politics.stability / 100);
  return 15 * spending * dev * size * stability * Math.max(0.1, 1 + getMod(c, 'researchSpeed'));
}

export function isResearched(c, techId) {
  return c.technology.researched.includes(techId);
}

export function canResearch(c, techId) {
  const t = TECH_BY_ID[techId];
  return !!t && !isResearched(c, techId) && t.requires.every((r) => isResearched(c, r));
}

export function availableTechs(c) {
  return TECHNOLOGIES.filter((t) => canResearch(c, t.id));
}

/** Effective cost after diffusion discount (up to -50 % when everybody knows it). */
export function techCost(state, techId) {
  const t = TECH_BY_ID[techId];
  const share = state.stats.techDiffusion?.[techId] ?? 0;
  return Math.round(t.cost * (1 - 0.5 * share));
}

export function completeTech(state, c, techId) {
  const t = TECH_BY_ID[techId];
  c.technology.researched.push(techId);
  delete c.technology.progress[techId];
  if (c.technology.current === techId) c.technology.current = null;
  const isPlayer = state.playerId === c.id;
  addNews(state, {
    category: 'research',
    countryId: c.id,
    importance: isPlayer ? 2 : 1,
    text: `${c.name} hat „${t.name}" erforscht.`,
  });
}

function updateDiffusion(state) {
  const counts = {};
  let n = 0;
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    if (c.eliminated) continue;
    n++;
    for (const t of c.technology.researched) counts[t] = (counts[t] ?? 0) + 1;
  }
  state.stats.techDiffusion = Object.fromEntries(TECHNOLOGIES.map((t) => [t.id, Math.round(((counts[t.id] ?? 0) / Math.max(1, n)) * 1000) / 1000]));
}

export const technologySystem = {
  id: 'technology',
  monthly(state) {
    updateDiffusion(state);
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      const pts = researchPointsPerMonth(c);
      c.technology.pointsPerMonth = pts;
      const cur = c.technology.current;
      if (!cur) continue;
      if (!canResearch(c, cur)) {
        c.technology.current = null;
        continue;
      }
      c.technology.progress[cur] = (c.technology.progress[cur] ?? 0) + pts;
      if (c.technology.progress[cur] >= techCost(state, cur)) completeTech(state, c, cur);
    }
  },
};
