/**
 * Daily war pipeline: movement → front management → battles/air/sea per war
 * → supply & exhaustion per belligerent → capitulations → cleanup.
 */
import { activeWars, warsOf, sideOf, otherSide, cleanupWars, concludePeace, separatePeace } from './wars.js';
import { stepMovement, friendlyCountries } from './movement.js';
import { stepWarDay, stepWarSupply } from './combat.js';
import { runFrontAI } from './frontAI.js';
import { supplyNetwork, deliveryFactor } from '../military/logistics.js';
import { refreshPower } from '../military/power.js';
import { controlledRegionIds } from '../../state/territory.js';

export const CAPITULATION_DAYS = 30;

function belligerents(state) {
  const set = new Set();
  for (const w of activeWars(state)) for (const id of [...w.attackers, ...w.defenders]) set.add(id);
  return [...set];
}

export const warSystem = {
  id: 'war',
  daily(state, ctx) {
    stepMovement(state);
    const wars = activeWars(state);
    for (const id of state.countryOrder) state.countries[id].military.atWar = false;
    if (!wars.length) return;
    const fighting = belligerents(state);
    for (const id of fighting) {
      const c = state.countries[id];
      c.military.atWar = true;
      for (const u of c.military.units) u.inCombat = false;
      const automatic = id !== state.playerId || c.military.autoFront !== false;
      if (automatic && (state.time.day + id.charCodeAt(0)) % 2 === 0) runFrontAI(state, c, { onlyAutomatic: id === state.playerId });
    }
    for (const war of wars) stepWarDay(state, war, ctx);
    for (const id of fighting) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      const friends = friendlyCountries(state, id);
      const connected = supplyNetwork(state, [...friends]);
      stepWarSupply(state, c, { friendIds: friends, factor: (rid) => deliveryFactor(state, c, rid, connected) });
      refreshPower(c);
    }
    // capitulation: a country that controls none of its own territory for a month gives up
    for (const id of fighting) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      const own = controlledRegionIds(state, id).filter((rid) => state.regions[rid].owner === id).length;
      c.military.noControlDays = own === 0 ? (c.military.noControlDays ?? 0) + 1 : 0;
      if (c.military.noControlDays >= CAPITULATION_DAYS) {
        for (const w of warsOf(state, id)) {
          const side = sideOf(w, id);
          if (w[side].length > 1) {
            // a coalition member gives up alone – the rest of its side fights on
            separatePeace(state, w, id, ctx);
            continue;
          }
          const winners = otherSide(side);
          // a fully occupied AI state can be conquered completely; the player always keeps the capital
          const regions = c.regionIds.filter((rid) => w[winners].includes(state.regions[rid].controller) && (id !== state.playerId || rid !== c.capitalRegion));
          concludePeace(state, w, winners, { regions, reparations: 0 }, ctx);
        }
        c.military.noControlDays = 0;
      }
    }
    cleanupWars(state, ctx);
  },
};
