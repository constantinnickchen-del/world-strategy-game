/**
 * Builds the starting armed forces, stockpiles and facilities of every country.
 * Major militaries come from data/military/profiles.js; all others are derived
 * from their budget, population and wealth (deterministic, no random values).
 */
import { MILITARY_PROFILES, BLOC_MODELS, blocOf } from '../data/military/profiles.js';
import { UNIT_TYPES } from '../data/military/army.js';
import { EQUIPMENT } from '../data/military/equipment.js';
import { AIRCRAFT_BY_ID } from '../data/military/aircraft.js';
import { SHIP_CLASSES } from '../data/military/navy.js';
import { FACILITIES } from '../data/military/facilities.js';
import { STATIC_REGIONS } from './worldIndex.js';
import { gdpPerCapita } from './selectors.js';
import { monthlyUpkeep } from '../systems/military/budget.js';
import { refreshPower, activePersonnel } from '../systems/military/power.js';
import { clamp } from '../util/math.js';

const SECOND_MODEL_SHARE = { us: 0.3, cn: 0.15, ru: 0.06, eu: 0.25, mixed: 0.3 };

export function emptyMilitary() {
  return {
    mobilization: 0,
    reserve: 0,
    units: [],
    unitSeq: 0,
    aircraft: {},
    fleets: [],
    stock: Object.fromEntries(Object.keys(EQUIPMENT).map((k) => [k, 0])),
    production: [],
    contracts: [],
    construction: [],
    costFactor: 1,
    exhaustion: 0,
    spending: { budget: 0, upkeep: 0, production: 0, procurement: 0, construction: 0, supplies: 0, total: 0, funding: 1 },
    deterrent: false,
    bloc: 'mixed',
    power: 0,
    landPower: 0,
    airPower: 0,
    navalPower: 0,
    resourceUse: {},
  };
}

/** Owned regions ordered by strategic importance (capital, borders, population). */
function rankedRegions(state, c) {
  const isBorder = (rid) => (STATIC_REGIONS[rid].neighbors ?? []).some((n) => state.regions[n] && state.regions[n].owner !== c.id);
  return [...c.regionIds].sort((a, b) => {
    const score = (rid) => (rid === c.capitalRegion ? 1e12 : 0) + (isBorder(rid) ? 1e10 : 0) + state.regions[rid].population;
    return score(b) - score(a);
  });
}

function addBuilding(state, regionId, type, levels) {
  if (levels <= 0) return;
  const r = state.regions[regionId];
  r.buildings[type] = Math.min(FACILITIES[type].maxLevel, (r.buildings[type] ?? 0) + levels);
}

/** Spreads facility levels over regions (max `perRegion` levels each). */
function placeFacilities(state, regions, type, total, perRegion = 3) {
  let left = total;
  for (const rid of regions) {
    if (left <= 0) break;
    const lv = Math.min(perRegion, left);
    addBuilding(state, rid, type, lv);
    left -= lv;
  }
}

export function newUnit(c, type, region, { status = 'active', strength = 1, equip = 0.85, readiness = 0.75, experience = 0.15 } = {}) {
  c.military.unitSeq += 1;
  const sameType = c.military.units.filter((u) => u.type === type).length + 1;
  return {
    id: `${c.id}-${c.military.unitSeq}`,
    type,
    num: sameType,
    region,
    target: null,
    arrival: null,
    strength,
    equip,
    readiness,
    experience,
    morale: 0.8,
    supply: 1,
    org: 1,
    status,
    reserveFormation: status === 'reserve',
    trainingUntil: null,
    manual: false,
  };
}

export function setupMilitary(state) {
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    const prof = MILITARY_PROFILES[id];
    const m = emptyMilitary();
    c.military = m;
    m.bloc = blocOf(id, prof, c.politics.government);
    m.deterrent = !!prof?.deterrent;
    const gdp = c.economy.gdp;
    const budgetYear = gdp * c.budget.military;
    const gdppc = gdpPerCapita(c);
    const costPerSoldier = 0.00002 + 0.0000014 * (gdppc / 1000);
    const coastal = c.regionIds.some((rid) => STATIC_REGIONS[rid].coastal);
    const regions = rankedRegions(state, c);
    const rich = c.income <= 2;

    // ---- personnel
    const active = prof ? prof.active * 1000 : clamp((budgetYear * 0.45) / costPerSoldier, c.population * 0.0004, c.population * 0.012);
    m.reserve = Math.round(prof ? prof.reserve * 1000 : active * 0.8);
    const groundPersonnel = active * (coastal ? 0.62 : 0.8);
    const equipValue = budgetYear * 3; // replacement value of today's equipment

    // ---- army composition
    const armor = prof?.armor ?? Math.round((equipValue * 0.35 * (rich ? 0.5 : 0.35)) / EQUIPMENT.armor.cost);
    const artillery = prof?.artillery ?? Math.round((equipValue * 0.35 * 0.15) / EQUIPMENT.artillery.cost);
    const plan = {};
    plan.armored = Math.floor((armor * 0.4) / UNIT_TYPES.armored.equipment.armor);
    plan.mechanized = Math.floor((armor * 0.45) / UNIT_TYPES.mechanized.equipment.armor);
    plan.artillery = Math.floor((artillery * 0.5) / UNIT_TYPES.artillery.equipment.artillery);
    const heavyPersonnel = plan.armored * 5000 + plan.mechanized * 6500 + plan.artillery * 4000;
    if (heavyPersonnel > groundPersonnel * 0.6) {
      const f = (groundPersonnel * 0.6) / heavyPersonnel;
      for (const k of ['armored', 'mechanized', 'artillery']) plan[k] = Math.floor(plan[k] * f);
    }
    const coreCount = Math.max(1, Math.round(groundPersonnel / 7000));
    plan.recon = Math.floor(coreCount / 12);
    plan.airDefense = active > 20000 ? Math.max(1, Math.floor(coreCount / 10)) : 0;
    plan.logistics = Math.floor(coreCount / 10);
    let used = 0;
    for (const [k, n] of Object.entries(plan)) used += n * UNIT_TYPES[k].personnel;
    const rest = Math.max(0, groundPersonnel - used);
    const motorShare = rich ? 0.6 : c.income === 3 ? 0.35 : 0.15;
    plan.motorized = Math.floor((rest * motorShare) / UNIT_TYPES.motorized.personnel);
    plan.infantry = Math.max(active > 2000 ? 1 : 0, Math.floor((rest * (1 - motorShare)) / UNIT_TYPES.infantry.personnel));

    const equipFill = rich ? 0.9 : c.income === 3 ? 0.8 : 0.7;
    const readiness = rich ? 0.8 : c.income === 3 ? 0.7 : 0.6;
    const veteran = ['RUS', 'ISR', 'TUR', 'USA', 'SYR', 'UKR', 'IRN', 'SAU'].includes(id) ? 0.35 : 0.12;
    // place units: capital first, then border regions, weighted round robin
    let slot = 0;
    for (const [type, n] of Object.entries(plan)) {
      for (let i = 0; i < n; i++) {
        const region = regions[slot % Math.min(regions.length, Math.max(1, Math.ceil(regions.length * 0.7)))];
        slot++;
        m.units.push(newUnit(c, type, region, { equip: equipFill, readiness, experience: veteran }));
      }
    }
    // reserve formations (activated by mobilisation)
    const reserveUnits = Math.floor((m.reserve * 0.3) / UNIT_TYPES.infantry.personnel);
    for (let i = 0; i < reserveUnits; i++) {
      m.units.push(newUnit(c, 'infantry', regions[i % regions.length], { status: 'reserve', equip: equipFill * 0.8, readiness: 0.3, experience: 0.05 }));
    }
    m.reserve = Math.max(0, m.reserve - reserveUnits * UNIT_TYPES.infantry.personnel);

    // ---- air force
    const roles = prof?.air ?? deriveAir(equipValue, gdp, m.bloc);
    const models = BLOC_MODELS[m.bloc];
    let aircraftTotal = 0;
    for (const [role, count] of Object.entries(roles)) {
      if (!count) continue;
      const list = models[role] ?? [];
      if (!list.length) continue;
      const second = list[1] && (rich || (prof?.industry ?? 0) >= 5) ? Math.round(count * SECOND_MODEL_SHARE[m.bloc]) : 0;
      const firstCount = count - second;
      const add = (modelId, n) => {
        if (n <= 0 || !AIRCRAFT_BY_ID[modelId]) return;
        const gen = AIRCRAFT_BY_ID[modelId].gen;
        m.aircraft[modelId] = { count: (m.aircraft[modelId]?.count ?? 0) + n, readiness: readiness, age: gen >= 5 ? 5 : 18 };
        aircraftTotal += n;
      };
      add(list[0], firstCount);
      if (second) add(list[1], second);
    }

    // ---- navy
    const ships = prof?.ships ?? (coastal ? deriveShips(equipValue) : {});
    const shipTotal = Object.values(ships).reduce((s, n) => s + n, 0);
    const coastalRegions = regions.filter((rid) => STATIC_REGIONS[rid].coastal);

    // ---- facilities
    const industry = prof?.industry ?? (gdp > 400 ? 2 : gdp > 120 ? 1 : 0);
    const econRegions = [...c.regionIds].sort((a, b) => state.regions[b].econ - state.regions[a].econ);
    const econCoastal = econRegions.filter((rid) => STATIC_REGIONS[rid].coastal);
    placeFacilities(state, econRegions, 'vehicleFactory', industry);
    placeFacilities(state, econRegions, 'munitionsFactory', gdp > 15 ? industry + 1 : 0);
    placeFacilities(state, econRegions, 'aircraftFactory', industry >= 3 ? industry - 1 : 0);
    placeFacilities(state, econCoastal, 'shipyard', industry >= 2 ? industry : gdp > 150 && coastal ? 1 : 0, 4);
    if (aircraftTotal > 0) placeFacilities(state, regions, 'airBase', Math.ceil(aircraftTotal / FACILITIES.airBase.capacity), 3);
    if (shipTotal > 0 && coastalRegions.length) {
      const levels = Math.ceil(shipTotal / FACILITIES.navalBase.capacity);
      const baseRegions = [...new Set([...econCoastal.slice(0, 3)])];
      placeFacilities(state, baseRegions, 'navalBase', levels, Math.ceil(levels / baseRegions.length));
      // fleets: one per naval base region
      const bases = baseRegions.filter((rid) => state.regions[rid].buildings.navalBase);
      bases.forEach((rid, i) => {
        const fleet = { id: `${id}-F${i + 1}`, name: `${i + 1}. Flotte`, base: rid, ships: {}, condition: readiness + 0.1, age: 15 };
        for (const [cls, n] of Object.entries(ships)) {
          const share = Math.floor(n / bases.length) + (i < n % bases.length ? 1 : 0);
          if (share > 0) fleet.ships[cls] = share;
        }
        if (Object.keys(fleet.ships).length) m.fleets.push(fleet);
      });
    }
    placeFacilities(state, regions, 'depot', 1 + Math.floor(c.regionIds.length / 5), 1);

    // ---- stockpiles: spare equipment and consumables
    const needs = {};
    for (const u of m.units) {
      for (const [k, n] of Object.entries(UNIT_TYPES[u.type].equipment)) needs[k] = (needs[k] ?? 0) + n;
    }
    for (const [k, n] of Object.entries(needs)) m.stock[k] = Math.round(n * 0.08);
    const active_ = m.units.filter((u) => u.status === 'active');
    const daily = (key) => active_.reduce((s, u) => s + UNIT_TYPES[u.type][key] * u.strength, 0);
    m.stock.ammunition = Math.round(daily('ammo') * 45);
    m.stock.fuel = Math.round(daily('fuel') * 60);
    m.stock.rations = Math.round(active * 0.002 * 90);
    m.stock.spareParts = Math.round((equipValue * 0.01) / EQUIPMENT.spareParts.cost / 12 * 6);
    m.stock.precisionMunitions = c.technology.researched.includes('precisionGuidance') ? Math.round(budgetYear * 0.01 / EQUIPMENT.precisionMunitions.cost) : 0;

    // ---- local cost level: calibrate so that upkeep ≈ 80 % of the military budget
    m.costFactor = 1;
    const upkeep = monthlyUpkeep(state, c).total;
    const target = (budgetYear / 12) * 0.8;
    m.costFactor = upkeep > 0 ? clamp(target / upkeep, 0.15, 4) : 1;
    m.activePersonnel = activePersonnel(c);
    m.baselineShare = m.activePersonnel / Math.max(1, c.population * 0.5);
    refreshPower(c);
  }
}

function deriveAir(equipValue, gdp, bloc) {
  if (gdp < 8) return {};
  const value = equipValue * 0.25;
  const fighter = AIRCRAFT_BY_ID[BLOC_MODELS[bloc].fighter[0]];
  return {
    fighter: Math.floor((value * 0.6) / fighter.cost),
    transport: Math.floor((value * 0.15) / 0.07),
    drone: Math.floor((value * 0.05) / 0.004),
  };
}

function deriveShips(equipValue) {
  const value = equipValue * 0.2;
  const ships = {};
  ships.patrol = Math.min(40, Math.floor((value * 0.25) / SHIP_CLASSES.patrol.cost));
  ships.corvette = Math.floor((value * 0.35) / SHIP_CLASSES.corvette.cost);
  ships.frigate = Math.floor((value * 0.4) / SHIP_CLASSES.frigate.cost);
  for (const k of Object.keys(ships)) if (!ships[k]) delete ships[k];
  return ships;
}
