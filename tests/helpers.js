import { createGameState } from '../src/state/createGameState.js';
import { Simulation } from '../src/core/Simulation.js';

const cache = new Map();

/** Fresh game state (deep copy of a cached template for speed). */
export function newState({ playerId = 'DEU', seed = 'test' } = {}) {
  const key = `${playerId}|${seed}`;
  if (!cache.has(key)) cache.set(key, JSON.stringify(createGameState({ playerId, seed })));
  return JSON.parse(cache.get(key));
}

export function simulateDays(state, days, sim = new Simulation()) {
  sim.advanceDays(state, days);
  return state;
}

export function ctxFor(state, sim = new Simulation()) {
  return sim.context(state);
}
