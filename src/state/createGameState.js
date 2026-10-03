/**
 * Builds a complete, JSON-serialisable game state for a scenario.
 *
 * The state contains only dynamic data. Static definitions (technologies,
 * events, resources, geometry) are referenced by id and never stored, which
 * keeps saves small and lets content updates apply to old saves.
 */
import { COUNTRIES, REGIONS, SOURCE_YEAR } from '../data/generated/world.js';
import { COUNTRY_PROFILES, GOV_TYPE_LISTS } from '../data/countryProfiles.js';
import { GOVERNMENTS } from '../data/governments.js';
import { RESOURCES, RESOURCE_IDS, basePrice } from '../data/resources.js';
import { SCENARIOS, DEFAULT_SCENARIO } from '../data/scenarios.js';
import { TECHNOLOGIES, TECH_BY_ID } from '../data/technologies.js';
import { BLOCS, OPINION_OVERRIDES, EMBARGOES, TERRITORIAL_CLAIMS } from '../data/diplomacySeeds.js';
import { createRngState, Rng, hashString } from '../core/random.js';
import { parseISODate, addYears } from '../core/calendar.js';
import { ensureRelation, setTreaty, setEmbargo, targetOpinion } from '../systems/diplomacy.js';
import { primeDerivedValues } from './prime.js';
import { setupMilitary } from './militarySetup.js';
import { STATIC_REGIONS } from './worldIndex.js';
import { RESOURCE_HOTSPOTS, TERRAIN_RESOURCE_AFFINITY } from '../data/resourceRegions.js';
import { SUPPLIERS } from '../data/military/suppliers.js';
import { statisticsSystem } from '../systems/statistics.js';

export const SCHEMA_VERSION = 2;

// Defaults by World Bank income group (1 = high income OECD ... 5 = low income)
const BY_INCOME = {
  tax: [0, 0.36, 0.3, 0.25, 0.19, 0.15],
  debt: [0, 0.65, 0.35, 0.5, 0.55, 0.5],
  mil: [0, 0.015, 0.03, 0.016, 0.014, 0.013],
  infl: [0, 0.017, 0.022, 0.035, 0.05, 0.07],
  unemp: [0, 0.055, 0.04, 0.07, 0.07, 0.07],
  stab: [0, 76, 70, 58, 50, 42],
  popGrowth: [0, 0.004, 0.015, 0.009, 0.017, 0.027],
  deficit: [0, 0.01, 0.02, 0.03, 0.035, 0.03],
  debtTolerance: [0, 0.9, 0.7, 0.6, 0.55, 0.5],
  baseRate: [0, 0.015, 0.03, 0.045, 0.06, 0.08],
  admin: [0, 0.055, 0.055, 0.05, 0.045, 0.04],
  infra: [0, 0.03, 0.04, 0.035, 0.03, 0.025],
  research: [0, 0.024, 0.012, 0.009, 0.005, 0.003],
};

const DEFAULT_IDEOLOGY = {
  democracy: 'conservative',
  hybrid: 'nationalist',
  autocracy: 'nationalist',
  oneParty: 'communist',
  monarchy: 'religious',
  theocracy: 'religious',
};

const PALETTE = [
  '#7f9cc9', '#c98f7f', '#8fc97f', '#c9b77f', '#a77fc9', '#7fc9c0', '#c97fa8',
  '#b8c97f', '#7f8bc9', '#c9a17f', '#7fc995', '#c97f7f', '#9fa8b8',
];

const INITIAL_TECHS = {
  1: ['eGovernment', 'industry40', 'smartGrid', 'precisionFarming', 'telemedicine', 'eLearning', 'fiveG', 'drones', 'fintech', 'renewables', 'precisionGuidance', 'advancedAvionics'],
  2: ['eGovernment', 'industry40', 'smartGrid', 'precisionFarming', 'telemedicine', 'fiveG', 'drones'],
  3: ['eGovernment', 'industry40', 'smartGrid', 'precisionFarming', 'telemedicine'],
  4: ['precisionFarming', 'telemedicine'],
  5: [],
};
const EXTRA_TECHS = {
  USA: ['fracking', 'cyberDefense', 'additiveManufacturing', 'genomics', 'highSpeedRail', 'stealthAirframes', 'navalAutomation', 'carrierOperations', 'armorComposites'],
  CHN: ['fintech', 'renewables', 'cyberDefense', 'drones', 'highSpeedRail', 'fiveG', 'eLearning', 'advancedAvionics', 'precisionGuidance', 'stealthAirframes', 'navalAutomation', 'carrierOperations', 'armorComposites'],
  RUS: ['drones', 'cyberDefense', 'hypersonics', 'eLearning', 'advancedAvionics', 'precisionGuidance', 'stealthAirframes', 'armorComposites', 'navalAutomation', 'carrierOperations'],
  ISR: ['cyberDefense', 'genomics', 'armorComposites'],
  GBR: ['cyberDefense', 'genomics', 'navalAutomation', 'carrierOperations', 'armorComposites'],
  FRA: ['cyberDefense', 'highSpeedRail', 'navalAutomation', 'carrierOperations', 'armorComposites'],
  ITA: ['navalAutomation', 'carrierOperations'],
  IND: ['drones', 'advancedAvionics', 'navalAutomation', 'carrierOperations'],
  JPN: ['highSpeedRail', 'additiveManufacturing', 'navalAutomation'],
  KOR: ['additiveManufacturing', 'highSpeedRail', 'navalAutomation', 'armorComposites'],
  TUR: ['drones', 'precisionGuidance'],
  IRN: ['drones'],
  PAK: ['drones'],
  DEU: ['additiveManufacturing', 'storage', 'armorComposites'],
  CAN: ['fracking'],
};

function govTypeOf(id) {
  const prof = COUNTRY_PROFILES[id];
  if (prof?.gov) return prof.gov;
  for (const [type, list] of Object.entries(GOV_TYPE_LISTS)) if (list.includes(id)) return type;
  return 'hybrid';
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Infrastructure 0..100 from GDP per capita. */
function infraFromGdpPc(gdppc) {
  if (gdppc <= 0) return 20;
  return clamp(20 + 60 * (Math.log10(gdppc / 800) / Math.log10(80)), 12, 88);
}

/**
 * @param {{scenarioId?:string, playerId?:string|null, seed?:string|number}} options
 */
export function createGameState({ scenarioId = DEFAULT_SCENARIO, playerId = null, seed = Date.now() } = {}) {
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario ${scenarioId}`);
  const rngState = createRngState(`${seed}`);
  const startDay = parseISODate(scenario.startDate);

  const state = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      scenarioId,
      seed: `${seed}`,
      gameId: `g${hashString(`${seed}-${scenarioId}`).toString(36)}`,
      dataYear: SOURCE_YEAR,
    },
    time: { day: startDay, startDay },
    rng: rngState,
    playerId,
    countryOrder: [],
    countries: {},
    regions: {},
    world: { ownershipVersion: 0, controlVersion: 0, seq: 0 },
    market: {},
    diplomacy: { relations: {} },
    events: { pending: [], cooldowns: {}, log: [] },
    wars: [],
    truces: {},
    procurement: { suppliers: Object.fromEntries(SUPPLIERS.map((sup) => [sup.id, { backlog: 0 }])) },
    news: [],
    stats: { worldGdpHistory: [] },
  };
  const setupRng = new Rng(createRngState(`${seed}-setup`));

  // Regions
  for (const r of REGIONS) {
    const gdppc = r.population > 0 ? (r.gdp * 1e6) / r.population : 0;
    state.regions[r.id] = {
      id: r.id,
      owner: r.owner,
      controller: r.owner,
      population: r.population,
      infrastructure: Math.round(infraFromGdpPc(gdppc) * 10) / 10,
      econ: Math.max(0.0005, r.gdp / 1000), // bn USD of annual output
      resources: {},
      buildings: {},
      siege: null,
      occupiedSince: null,
      devastation: 0,
      unrest: 0,
      cores: [r.owner],
      claims: [],
    };
  }

  // Countries
  for (const base of COUNTRIES) {
    const prof = { ...COUNTRY_PROFILES[base.id], ...scenario.overrides[base.id] };
    const inc = base.income;
    const gov = govTypeOf(base.id);
    const regions = base.regions.map((id) => REGIONS.find((r) => r.id === id));
    const population = regions.reduce((s, r) => s + r.population, 0);
    const gdp = Math.max(0.05, regions.reduce((s, r) => s + r.gdp, 0) / 1000); // bn USD
    const tax = prof.tax ?? BY_INCOME.tax[inc];
    const debt = (prof.debt ?? BY_INCOME.debt[inc]) * gdp;
    const baseRate = prof.baseRate ?? BY_INCOME.baseRate[inc];
    const inflation = prof.infl ?? BY_INCOME.infl[inc];
    const stability = prof.stab ?? clamp(BY_INCOME.stab[inc] + GOVERNMENTS[gov].stabilityBase - 58, 20, 90);
    const debtTolerance = prof.debtTolerance ?? BY_INCOME.debtTolerance[inc];

    const budget = {
      administration: BY_INCOME.admin[inc],
      welfare: 0.1,
      infrastructure: BY_INCOME.infra[inc],
      research: BY_INCOME.research[inc],
      military: prof.mil ?? BY_INCOME.mil[inc],
    };
    const country = {
      id: base.id,
      name: prof.name ?? base.name,
      formalName: base.formalName,
      iso2: base.iso2,
      continent: base.continent,
      subregion: base.subregion,
      income: inc,
      color: PALETTE[(base.mapColor - 1 + PALETTE.length) % PALETTE.length],
      capitalRegion: base.capitalRegion,
      regionIds: [...base.regions],
      eliminated: false,
      population,
      infrastructure: 0,
      ai: {
        day: (hashString(base.id) % 28) + 1,
        personality: {
          economy: Math.round(setupRng.range(0.2, 0.9) * 100) / 100,
          militarism: Math.round(clamp(setupRng.range(0.1, 0.7) + (budget.military > 0.03 ? 0.25 : 0), 0, 1) * 100) / 100,
          diplomacy: Math.round(setupRng.range(0.2, 0.9) * 100) / 100,
          research: Math.round(setupRng.range(0.2, 0.9) * 100) / 100,
        },
      },
      politics: {
        government: gov,
        ideology: prof.ideology ?? DEFAULT_IDEOLOGY[gov],
        approval: clamp(50 + (stability - 60) * 0.3 + setupRng.range(-5, 5), 20, 75),
        stability,
        nextElection: GOVERNMENTS[gov].electionYears
          ? addYears(startDay, 1 + Math.floor(setupRng.range(0, GOVERNMENTS[gov].electionYears)))
          : null,
        lastElection: null,
        taxTolerance: tax,
        welfareBaseline: 0.1,
      },
      economy: {
        gdp,
        gdpRef: gdp,
        popRef: population,
        growth: 0.025,
        potentialGrowth: 0.025,
        growthShock: 0,
        inflation,
        inflationAnchor: clamp(inflation, 0.01, 0.4),
        unemployment: prof.unemp ?? BY_INCOME.unemp[inc],
        naturalUnemployment: prof.unemp ?? BY_INCOME.unemp[inc],
        taxRate: tax,
        baseRate,
        interestRate: baseRate + 0.8 * Math.max(0, inflation - 0.02),
        debtTolerance,
        debt,
        treasury: gdp * 0.02,
        priceLevel: 1,
        costIndex: 1,
        costIndexAvg: 1,
        commodityShare: 0,
        rentShare: prof.rent ?? 0.1,
        lastRevenue: 0,
        lastExpenses: 0,
        lastInterest: 0,
        lastResourceRent: 0,
        lastBalance: 0,
        lastTaxEfficiency: 0.8,
        deficitTarget: prof.deficit ?? BY_INCOME.deficit[inc],
      },
      budget,
      resources: {},
      trade: { exports: 0, imports: 0, balance: 0, unmetValue: 0, partners: [] },
      technology: { current: null, progress: {}, researched: [], pointsPerMonth: 0 },
      military: null, // see militarySetup.js
      modifiers: [],
      history: { gdp: [], growth: [], inflation: [], unemployment: [], approval: [], stability: [], debtRatio: [], treasury: [] },
      yearly: { year: [], gdp: [], population: [] },
    };
    country.economy.popGrowthBase = prof.popGrowth ?? BY_INCOME.popGrowth[inc];
    state.countries[base.id] = country;
    state.countryOrder.push(base.id);
  }
  if (playerId && !state.countries[playerId]) throw new Error(`Unknown player country ${playerId}`);

  setupResources(state);
  setupTechnology(state);
  calibrateBudgets(state);
  setupDiplomacy(state);
  setupMilitary(state);
  primeDerivedValues(state);
  statisticsSystem.monthly(state); // first history sample = scenario start
  return state;
}

function setupResources(state) {
  const ids = state.countryOrder;
  const totalPop = ids.reduce((s, id) => s + state.countries[id].population, 0);
  const totalGdp = ids.reduce((s, id) => s + state.countries[id].economy.gdp, 0);
  for (const rid of RESOURCE_IDS) {
    const def = RESOURCES[rid];
    const listed = Object.values(def.producers).reduce((a, b) => a + b, 0);
    const popShare = def.baseShareByPopulation ?? 0;
    const scale = 1000 / (listed + popShare);
    // demand weights
    let weightSum = 0;
    const weights = {};
    for (const id of ids) {
      const c = state.countries[id];
      const devFactor = 1 + 0.12 * (c.income - 1); // developing economies are more commodity intensive per $
      const w = def.demand.gdp * (c.economy.gdp / totalGdp) * devFactor + def.demand.pop * (c.population / totalPop);
      weights[id] = w;
      weightSum += w;
    }
    for (const id of ids) {
      const c = state.countries[id];
      let capacity = (def.producers[id] ?? 0) * scale;
      if (popShare) capacity += popShare * scale * (c.population / totalPop);
      distributeResource(state, c, rid, capacity);
      c.resources[rid] = {
        capacity: Math.round(capacity * 1000) / 1000,
        demandBase: (weights[id] / weightSum) * 1000,
        production: capacity,
        consumption: (weights[id] / weightSum) * 1000,
        exported: 0,
        imported: 0,
        shortage: 0,
      };
    }
    state.market[rid] = {
      price: basePrice(rid),
      basePrice: basePrice(rid),
      supply: 1000,
      demand: 1000,
      history: [],
    };
  }
}

const FOOD_TERRAIN = { desert: 0.2, arctic: 0.1, urban: 0.4, mountains: 0.5, jungle: 0.7, forest: 0.8, plains: 1.2 };
const HOTSPOT_SHARE = 0.7;

/** Places a country's resource capacity into its regions (hotspots first, then by area and terrain). */
function distributeResource(state, c, rid, capacity) {
  if (capacity <= 0) return;
  const regions = c.regionIds.map((id) => STATIC_REGIONS[id]);
  const totalPop = regions.reduce((s, r) => s + r.population, 0) || 1;
  const totalArea = regions.reduce((s, r) => s + Math.max(1, r.areaKm), 0) || 1;
  const hot = new Set(RESOURCE_HOTSPOTS[rid] ?? []);
  const isHot = (r) => r.provinces.some((p) => hot.has(p));
  const base = (r) => {
    if (rid === 'food') return (0.5 * (r.population / totalPop) + 0.5 * (Math.max(1, r.areaKm) / totalArea)) * (FOOD_TERRAIN[r.terrain] ?? 1);
    const jitter = 0.4 + hashString(`${rid}:${r.id}`) / 4294967296; // deterministic geology
    return Math.sqrt(Math.max(1, r.areaKm)) * (TERRAIN_RESOURCE_AFFINITY[rid]?.[r.terrain] ?? 1) * jitter;
  };
  const hotRegions = rid === 'food' ? [] : regions.filter(isHot);
  const shares = new Map();
  const baseSum = regions.reduce((s, r) => s + base(r), 0) || 1;
  const hotShare = hotRegions.length ? HOTSPOT_SHARE : 0;
  for (const r of regions) shares.set(r.id, (1 - hotShare) * (base(r) / baseSum));
  const hotBase = hotRegions.reduce((s, r) => s + base(r), 0) || 1;
  for (const r of hotRegions) shares.set(r.id, shares.get(r.id) + hotShare * (base(r) / hotBase));
  for (const [id, share] of shares) {
    const v = capacity * share;
    if (v > 0.0005) state.regions[id].resources[rid] = Math.round(v * 10000) / 10000;
  }
}

function setupTechnology(state) {
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    const list = new Set([...(INITIAL_TECHS[c.income] ?? []), ...(EXTRA_TECHS[id] ?? [])]);
    // only keep techs whose prerequisites are also present (keeps the tree consistent)
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of list) {
        if (!TECH_BY_ID[t] || TECH_BY_ID[t].requires.some((r) => !list.has(r))) {
          list.delete(t);
          changed = true;
        }
      }
    }
    for (const tech of TECHNOLOGIES) if (list.has(tech.id)) c.technology.researched.push(tech.id);
  }
}

/**
 * Sets welfare spending so that every country starts close to its real-world
 * budget balance. This avoids a wild first year without hand-tuning 190 budgets.
 */
function calibrateBudgets(state) {
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    const e = c.economy;
    const taxEff = 0.85;
    const revenueShare = e.taxRate * taxEff;
    const interestShare = (e.debt * e.interestRate) / e.gdp;
    const other = c.budget.administration + c.budget.infrastructure + c.budget.research + c.budget.military;
    const welfare = revenueShare - interestShare - other + e.deficitTarget;
    c.budget.welfare = Math.round(clamp(welfare, 0.02, 0.3) * 1000) / 1000;
    c.politics.welfareBaseline = c.budget.welfare;
    c.ai.baseline = { ...c.budget, taxRate: c.economy.taxRate };
  }
}

function setupDiplomacy(state) {
  const exists = (id) => !!state.countries[id];
  for (const bloc of BLOCS) {
    const members = bloc.members.filter(exists);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const rel = ensureRelation(state, members[i], members[j]);
        rel.base = Math.max(rel.base, bloc.opinion);
        for (const t of bloc.treaties) setTreaty(state, members[i], members[j], t, true);
      }
    }
  }
  for (const [a, b, opinion] of OPINION_OVERRIDES) {
    if (!exists(a) || !exists(b)) continue;
    ensureRelation(state, a, b).base = opinion;
  }
  for (const [a, b] of EMBARGOES) {
    if (exists(a) && exists(b)) setEmbargo(state, a, b, true);
  }
  for (const [claimant, where, kind] of TERRITORIAL_CLAIMS) {
    if (!exists(claimant)) continue;
    const regionIds = where.startsWith('territory:')
      ? Object.values(STATIC_REGIONS).filter((r) => r.territory === where.slice(10)).map((r) => r.id)
      : Object.values(STATIC_REGIONS).filter((r) => r.provinces.includes(where)).map((r) => r.id);
    for (const rid of regionIds) {
      const r = state.regions[rid];
      if (r.owner === claimant) continue;
      const list = kind === 'core' ? r.cores : r.claims;
      if (!list.includes(claimant)) list.push(claimant);
    }
  }
  // Start opinions at their equilibrium (base + treaty bonuses - embargo penalty).
  for (const rel of Object.values(state.diplomacy.relations)) rel.opinion = targetOpinion(rel);
}
