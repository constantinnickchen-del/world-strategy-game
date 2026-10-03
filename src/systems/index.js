/**
 * Ordered system pipeline. The order matters and documents the causal flow
 * of one simulated month:
 *
 *   territory -> market -> trade -> economy -> population -> politics -> technology
 *   -> infrastructure -> military -> diplomacy -> statistics -> events
 *
 * Daily: war (movement, front AI, battles, sieges, air/sea, supply) -> events -> AI.
 *
 * Daily hooks (AI, country events) are staggered per country.
 * To add a system: implement { id, daily?, monthly?, yearly? } and insert it here.
 */
import { marketSystem } from './market.js';
import { tradeSystem } from './trade.js';
import { economySystem } from './economy.js';
import { populationSystem } from './population.js';
import { politicsSystem } from './politics.js';
import { technologySystem } from './technology.js';
import { infrastructureSystem } from './infrastructure.js';
import { militarySystem } from './military/index.js';
import { warSystem } from './war/index.js';
import { territorySystem } from './territory.js';
import { diplomacySystem } from './diplomacy.js';
import { statisticsSystem } from './statistics.js';
import { eventsSystem } from './events.js';
import { aiSystem } from '../ai/countryAI.js';

export const DEFAULT_SYSTEMS = [
  territorySystem,
  marketSystem,
  tradeSystem,
  economySystem,
  populationSystem,
  politicsSystem,
  technologySystem,
  infrastructureSystem,
  militarySystem,
  diplomacySystem,
  statisticsSystem,
  warSystem,
  eventsSystem,
  aiSystem,
];
