/**
 * Ordered system pipeline. The order matters and documents the causal flow
 * of one simulated month:
 *
 *   market -> trade -> economy -> population -> politics -> technology
 *   -> infrastructure -> military -> diplomacy -> statistics -> events
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
import { militarySystem } from './military.js';
import { diplomacySystem } from './diplomacy.js';
import { statisticsSystem } from './statistics.js';
import { eventsSystem } from './events.js';
import { aiSystem } from '../ai/countryAI.js';

export const DEFAULT_SYSTEMS = [
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
  eventsSystem,
  aiSystem,
];
