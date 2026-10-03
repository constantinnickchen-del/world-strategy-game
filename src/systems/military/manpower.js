/**
 * Personnel: active soldiers, reservists, recruits, mobilisation.
 *
 * - Active personnel = units that are not in reserve status (+ ship crews).
 * - Reservists replace losses and form reserve formations.
 * - Mobilisation activates reserve formations and raises training capacity,
 *   but withdraws workers from the economy (growth drag) and costs approval
 *   in peacetime.
 */
import { UNIT_TYPES } from '../../data/military/army.js';
import { activePersonnel } from './power.js';
import { isAtWar } from '../war/wars.js';
import { addNews } from '../news.js';
import { MOBILIZATION_LEVELS } from '../../data/military/army.js';

export const MOBILIZABLE_SHARE = 0.18; // share of population fit for service

export function mobilizablePopulation(c) {
  return Math.max(0, c.population * MOBILIZABLE_SHARE - (c.military.activePersonnel ?? 0) - c.military.reserve);
}

/** Monthly training capacity (recruits that can be turned into soldiers). */
export function trainingCapacity(c) {
  return Math.round(c.population * 0.00004 * (1 + 1.5 * c.military.mobilization));
}

/** Economic and political side effects of the size of the armed forces. */
export function mobilizationEffects(state, c) {
  const m = c.military;
  if (!m) return { growth: 0, unemployment: 0, approval: 0, stability: 0 };
  const workforce = Math.max(1, c.population * 0.5);
  const share = (m.activePersonnel ?? 0) / workforce;
  const extra = Math.max(0, share - (m.baselineShare ?? share));
  const atWar = isAtWar(state, c.id);
  return {
    // soldiers are missing as workers: a moderate, capped drag on growth
    growth: -Math.min(0.03, 0.5 * extra) - (atWar ? 0.01 + 0.04 * m.exhaustion : 0),
    unemployment: -0.8 * extra,
    approval: (atWar ? 0 : -4 * m.mobilization) - 25 * m.exhaustion,
    stability: -18 * m.exhaustion,
  };
}

function setUnitsForMobilization(state, c) {
  const m = c.military;
  const reserveUnits = m.units.filter((u) => u.reserveFormation);
  const activeTarget = m.mobilization === 0 ? 0 : m.mobilization === 1 ? Math.ceil(reserveUnits.length / 2) : reserveUnits.length;
  reserveUnits.forEach((u, i) => {
    if (i < activeTarget && u.status === 'reserve') {
      u.status = 'active';
      u.readiness = Math.min(u.readiness, 0.35);
    } else if (i >= activeTarget && u.status === 'active' && !u.inCombat) {
      u.status = 'reserve';
    }
  });
}

export function setMobilization(state, c, level) {
  const m = c.military;
  const old = m.mobilization;
  m.mobilization = level;
  setUnitsForMobilization(state, c);
  if (level !== old && (c.id === state.playerId || level === 2)) {
    addNews(state, {
      category: 'politics',
      countryId: c.id,
      importance: c.id === state.playerId ? 2 : 1,
      text: `${c.name}: ${MOBILIZATION_LEVELS[level].name} angeordnet.`,
    });
  }
}

export function stepManpower(state, c) {
  const m = c.military;
  // reserve formations are tagged on first run (units created in reserve status)
  for (const u of m.units) if (u.reserveFormation === undefined) u.reserveFormation = u.status === 'reserve';
  // training completes
  for (const u of m.units) {
    if (u.status === 'training' && u.trainingUntil !== null && state.time.day >= u.trainingUntil) {
      u.status = 'active';
      u.trainingUntil = null;
    }
  }
  setUnitsForMobilization(state, c);
  // reservists: discharged soldiers join the reserve, general mobilisation conscripts more
  m.activePersonnel = activePersonnel(c);
  m.reserve += (m.activePersonnel * 0.03) / 12;
  if (m.mobilization === 2) m.reserve += Math.min(mobilizablePopulation(c), c.population * 0.0004);
  m.reserve = Math.round(Math.min(m.reserve, c.population * MOBILIZABLE_SHARE));
  // replace losses from the reserve
  const atWar = isAtWar(state, c.id);
  for (const u of m.units) {
    if (u.status === 'reserve' || u.strength >= 1) continue;
    const t = UNIT_TYPES[u.type];
    const want = Math.min(1 - u.strength, atWar ? 0.25 : 0.1) * t.personnel;
    const got = Math.min(want, m.reserve);
    if (got <= 0) break;
    m.reserve -= got;
    u.strength = Math.min(1, u.strength + got / t.personnel);
    u.experience = Math.max(0, u.experience * (1 - got / t.personnel / 2)); // fresh soldiers dilute experience
  }
  m.trainingLeft = trainingCapacity(c);
  if (m.baselineShare === undefined) m.baselineShare = m.activePersonnel / Math.max(1, c.population * 0.5);
}
