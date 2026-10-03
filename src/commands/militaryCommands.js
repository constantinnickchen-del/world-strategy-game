/**
 * Military, war and territorial commands (used by the player and the AI).
 * Registered into the main command table in commands.js.
 */
import { UNIT_TYPES, MOBILIZATION_LEVELS } from '../data/military/army.js';
import { FACILITIES } from '../data/military/facilities.js';
import { SUPPLIER_BY_ID } from '../data/military/suppliers.js';
import { STATIC_REGIONS } from '../state/worldIndex.js';
import { newUnit } from '../state/militarySetup.js';
import { unitLabel } from '../systems/military/units.js';
import { setMobilization, mobilizablePopulation, recruitPlan, trainingCapacity } from '../systems/military/manpower.js';
import { canProduce, itemDef, MAX_ORDER_QUANTITY } from '../systems/military/production.js';
import { findOffer, signContract, DOWN_PAYMENT } from '../systems/military/procurement.js';
import { constructionError, startConstruction } from '../systems/military/construction.js';
import { refreshPower } from '../systems/military/power.js';
import { planQuickOrder, QUICK_ORDER_BY_ID, hasHomePort } from '../systems/military/quickOrders.js';
import { planMove, applyMove } from '../systems/war/movement.js';
import {
  declareWarError, declareWar, sideOf, otherSide, peaceTermsError, evaluatePeace, concludePeace,
} from '../systems/war/wars.js';
import { warById, canJoinWarSide } from '../systems/war/queries.js';
import { joinWar } from '../systems/war/wars.js';
import { fireEvent } from '../systems/events.js';
import { changeOpinion } from '../systems/diplomacy.js';
import { addNews } from '../systems/news.js';
import { formatBn } from '../util/format.js';

const MAX_QUEUE = 20;
export const CLAIM_DAYS = 180;

function unitOf(c, unitId) {
  return c.military.units.find((u) => u.id === unitId) ?? null;
}

export function describeTerms(state, terms) {
  if (terms.whitePeace) return 'Weißer Frieden (Vorkriegsgrenzen)';
  const parts = [];
  if (terms.regions?.length) parts.push(`Abtretung von ${terms.regions.map((r) => STATIC_REGIONS[r].name).join(', ')}`);
  if (terms.reparations > 0) parts.push(`Reparationen ${formatBn(terms.reparations)}`);
  return parts.join(' und ') || 'keine Forderungen';
}

export const MILITARY_COMMANDS = {
  setMobilization: {
    validate(state, { level }) {
      return MOBILIZATION_LEVELS[level] ? null : 'Unbekannte Mobilisierungsstufe.';
    },
    execute(state, { countryId, level }) {
      setMobilization(state, state.countries[countryId], level);
      return { message: `${MOBILIZATION_LEVELS[level].name} angeordnet.` };
    },
  },

  raiseUnit: {
    validate(state, { countryId, unitType, regionId }) {
      const c = state.countries[countryId];
      const t = UNIT_TYPES[unitType];
      if (!t) return 'Unbekannter Einheitentyp.';
      const r = state.regions[regionId];
      if (!r || r.owner !== countryId || r.controller !== countryId) return 'Nur in eigenen, kontrollierten Regionen.';
      const fromReserve = c.military.reserve >= t.personnel;
      if (!fromReserve && mobilizablePopulation(c) < t.personnel) return 'Nicht genug wehrfähige Bevölkerung.';
      if (!fromReserve && (c.military.trainingLeft ?? trainingCapacity(c)) < recruitPlan(c, unitType).places) return `Ausbildungsplätze für diesen Monat belegt (${Math.round(c.military.trainingLeft ?? 0)} frei) – nächsten Monat wieder möglich oder Mobilmachung anordnen.`;
      return null;
    },
    execute(state, { countryId, unitType, regionId }) {
      const c = state.countries[countryId];
      const t = UNIT_TYPES[unitType];
      const fromReserve = c.military.reserve >= t.personnel;
      const plan = recruitPlan(c, unitType);
      if (fromReserve) c.military.reserve -= t.personnel;
      else c.military.trainingLeft = (c.military.trainingLeft ?? trainingCapacity(c)) - plan.places;
      const u = newUnit(c, unitType, regionId, { status: 'training', equip: 0, readiness: 0.4, experience: fromReserve ? 0.1 : 0 });
      u.trainingUntil = state.time.day + Math.round((fromReserve ? 1 : plan.months) * 30.44);
      c.military.units.push(u);
      return { message: `${unitLabel(u)} wird aufgestellt (${fromReserve ? 'Reservisten, 1 Monat' : `Rekruten, ${plan.months} Monate`}). Ausrüstung kommt aus dem Lager.` };
    },
  },

  disbandUnit: {
    validate(state, { countryId, unitId }) {
      const u = unitOf(state.countries[countryId], unitId);
      if (!u) return 'Verband nicht gefunden.';
      if (u.inCombat) return 'Verband befindet sich im Gefecht.';
      return null;
    },
    execute(state, { countryId, unitId }) {
      const c = state.countries[countryId];
      const u = unitOf(c, unitId);
      const t = UNIT_TYPES[u.type];
      c.military.reserve += t.personnel * u.strength;
      for (const [k, v] of Object.entries(t.equipment)) c.military.stock[k] += v * u.equip * u.strength;
      c.military.units = c.military.units.filter((x) => x !== u);
      refreshPower(c);
      return { message: `${unitLabel(u)} aufgelöst – Personal in die Reserve, Ausrüstung ins Lager.` };
    },
  },

  moveUnit: {
    validate(state, { countryId, unitId, regionId }) {
      const c = state.countries[countryId];
      const u = unitOf(c, unitId);
      if (!u) return 'Verband nicht gefunden.';
      return planMove(state, c, u, regionId).error ?? null;
    },
    execute(state, { countryId, unitId, regionId }) {
      const c = state.countries[countryId];
      const u = unitOf(c, unitId);
      const plan = planMove(state, c, u, regionId);
      applyMove(state, u, plan);
      u.manual = true;
      const name = STATIC_REGIONS[regionId].name;
      const msg = plan.type === 'attack' ? `${unitLabel(u)} greift ${name} an.` : plan.type === 'landing' ? `${unitLabel(u)}: Landung in ${name} in ${plan.days} Tagen.` : `${unitLabel(u)} verlegt nach ${name} (${plan.days} Tage${plan.type === 'sea' ? ', Seeweg' : ''}).`;
      return { message: msg };
    },
  },

  setUnitAutomatic: {
    validate(state, { countryId, unitId }) {
      return unitOf(state.countries[countryId], unitId) ? null : 'Verband nicht gefunden.';
    },
    execute(state, { countryId, unitId }) {
      unitOf(state.countries[countryId], unitId).manual = false;
    },
  },

  /** Simple order: turns e.g. "Panzer" into raise + produce/buy steps (see quickOrders.js). */
  quickOrder: {
    validate(state, { countryId, order }) {
      const plan = planQuickOrder(state, state.countries[countryId], order);
      if (plan.error) return plan.error;
      for (const step of plan.steps) {
        const err = MILITARY_COMMANDS[step.type].validate(state, { ...step, countryId });
        if (err) return err;
      }
      return null;
    },
    execute(state, { countryId, order }, ctx) {
      const plan = planQuickOrder(state, state.countries[countryId], order);
      for (const step of plan.steps) MILITARY_COMMANDS[step.type].execute(state, { ...step, countryId }, ctx);
      return { message: `Bestellt: ${plan.gives} – ${formatBn(plan.cost)}, fertig in ca. ${plan.months} Monat${plan.months === 1 ? '' : 'en'}.`, order: QUICK_ORDER_BY_ID[order].name };
    },
  },

  setFrontStance: {
    validate(state, { stance }) {
      return ['offensive', 'balanced', 'defensive'].includes(stance) ? null : 'Unbekannte Strategie.';
    },
    execute(state, { countryId, stance }) {
      const m = state.countries[countryId].military;
      m.stance = stance;
      m.autoFront = true;
      const text = { offensive: 'Offensive: Der Generalstab greift an, sobald er nicht deutlich unterlegen ist.', balanced: 'Ausgewogen: Angriffe nur mit klarer Überlegenheit.', defensive: 'Verteidigung: Front halten, nur eigene Gebiete werden zurückerobert.' };
      return { message: text[stance] };
    },
  },

  setAutoFront: {
    validate: () => null,
    execute(state, { countryId, active }) {
      state.countries[countryId].military.autoFront = !!active;
      return { message: active ? 'Der Generalstab führt die Front automatisch.' : 'Automatische Frontführung deaktiviert.' };
    },
  },

  queueProduction: {
    validate(state, { countryId, kind, item, quantity }) {
      const c = state.countries[countryId];
      if (!(Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_ORDER_QUANTITY)) return 'Menge: 1 bis 1.000.000.000.';
      if (c.military.production.length >= MAX_QUEUE) return `Höchstens ${MAX_QUEUE} Produktionsaufträge.`;
      return canProduce(state, c, kind, item);
    },
    execute(state, { countryId, kind, item, quantity }) {
      const c = state.countries[countryId];
      state.world.seq = (state.world.seq ?? 0) + 1;
      c.military.production.push({ id: `P${state.world.seq}`, kind, item, quantity, done: 0, progress: 0 });
      return { message: `Produktionsauftrag: ${quantity} × ${itemDef(kind, item).name}.` };
    },
  },

  cancelProduction: {
    validate(state, { countryId, lineId }) {
      return state.countries[countryId].military.production.some((l) => l.id === lineId) ? null : 'Auftrag nicht gefunden.';
    },
    execute(state, { countryId, lineId }) {
      const m = state.countries[countryId].military;
      m.production = m.production.filter((l) => l.id !== lineId);
    },
  },

  prioritizeProduction: {
    validate(state, { countryId, lineId, direction }) {
      const list = state.countries[countryId].military.production;
      const i = list.findIndex((l) => l.id === lineId);
      if (i < 0) return 'Auftrag nicht gefunden.';
      if (direction === 'up' && i === 0) return 'Bereits höchste Priorität.';
      if (direction === 'down' && i === list.length - 1) return 'Bereits niedrigste Priorität.';
      return null;
    },
    execute(state, { countryId, lineId, direction }) {
      const list = state.countries[countryId].military.production;
      const i = list.findIndex((l) => l.id === lineId);
      const j = direction === 'up' ? i - 1 : i + 1;
      [list[i], list[j]] = [list[j], list[i]];
    },
  },

  signContract: {
    validate(state, { countryId, supplier, kind, item, quantity }) {
      if (!SUPPLIER_BY_ID[supplier]) return 'Unbekannter Lieferant.';
      const offer = findOffer(state, countryId, supplier, kind, item);
      if (!offer) return 'Dieses Angebot existiert nicht.';
      if (offer.refusal) return offer.refusal;
      if (!(Number.isInteger(quantity) && quantity > 0 && quantity <= offer.maxQuantity)) return 'Menge: 1 bis 1.000.000.000.';
      const down = quantity * offer.unitPrice * DOWN_PAYMENT;
      const treasury = Math.max(0, state.countries[countryId].economy.treasury);
      if (down > treasury) return `Die Anzahlung (${formatBn(down)}) übersteigt die Staatskasse (${formatBn(treasury)}) – kleinere Menge wählen.`;
      if (kind === 'ship' && !hasHomePort(state, state.countries[countryId])) return 'Kein Hafen – zuerst eine Marinebasis oder Werft bauen.';
      if (state.countries[countryId].military.contracts.filter((c) => c.status !== 'completed').length >= 12) return 'Höchstens 12 laufende Verträge.';
      return null;
    },
    execute(state, { countryId, supplier, kind, item, quantity }) {
      const c = state.countries[countryId];
      const offer = findOffer(state, countryId, supplier, kind, item);
      const ct = signContract(state, c, offer, quantity);
      return { message: `Vertrag unterzeichnet: ${quantity} × ${offer.name} von ${offer.supplierName} für ${formatBn(quantity * offer.unitPrice)} (Anzahlung ${formatBn(quantity * offer.unitPrice * 0.15)}). Erste Lieferung in ${offer.leadMonths} Monaten.`, contractId: ct.id };
    },
  },

  cancelContract: {
    validate(state, { countryId, contractId }) {
      const ct = state.countries[countryId].military.contracts.find((x) => x.id === contractId);
      if (!ct || ct.status === 'completed') return 'Vertrag nicht gefunden.';
      return null;
    },
    execute(state, { countryId, contractId }) {
      const m = state.countries[countryId].military;
      m.contracts = m.contracts.filter((x) => x.id !== contractId);
      return { message: 'Vertrag storniert. Die Anzahlung ist verloren.' };
    },
  },

  /** Starts one or several levels at once (all levels are built in parallel). */
  buildFacility: {
    validate(state, { countryId, regionId, facility, levels = 1 }) {
      if (!(Number.isInteger(levels) && levels >= 1 && levels <= 10)) return 'Anzahl der Stufen: 1 bis 10.';
      return constructionError(state, state.countries[countryId], regionId, facility, levels);
    },
    execute(state, { countryId, regionId, facility, levels = 1 }) {
      let p = null;
      for (let i = 0; i < levels; i++) p = startConstruction(state, state.countries[countryId], regionId, facility);
      const def = FACILITIES[facility];
      return { message: `Bau begonnen: ${levels > 1 ? `${levels} Stufen ` : ''}${def.name} in ${STATIC_REGIONS[regionId].name} (${p.months} Monate, ${formatBn(def.cost * levels)}${levels > 1 ? ', alle Stufen parallel' : ''}).` };
    },
  },

  setResearchFocus: {
    validate(state, { value }) {
      return typeof value === 'number' && value >= 0 && value <= 1 ? null : 'Ungültiger Wert.';
    },
    execute(state, { countryId, value }) {
      state.countries[countryId].technology.focus = Math.round(value * 100) / 100;
    },
  },

  fabricateClaim: {
    validate(state, { countryId, regionId }) {
      const r = state.regions[regionId];
      if (!r) return 'Unbekannte Region.';
      if (r.owner === countryId) return 'Region gehört bereits Ihnen.';
      if (r.claims.includes(countryId) || r.cores.includes(countryId)) return 'Anspruch besteht bereits.';
      const c = state.countries[countryId];
      if ((c.claimsInProgress ?? []).some((p) => p.region === regionId)) return 'Anspruch wird bereits vorbereitet.';
      if ((c.claimsInProgress ?? []).length >= 3) return 'Höchstens 3 Ansprüche gleichzeitig vorbereiten.';
      const near = STATIC_REGIONS[regionId].neighbors.some((n) => state.regions[n]?.owner === countryId) || (STATIC_REGIONS[regionId].coastal && c.regionIds.some((rid) => STATIC_REGIONS[rid].coastal));
      if (!near) return 'Ansprüche nur auf benachbarte oder über See erreichbare Regionen.';
      return null;
    },
    execute(state, { countryId, regionId }) {
      const c = state.countries[countryId];
      c.claimsInProgress = [...(c.claimsInProgress ?? []), { region: regionId, until: state.time.day + CLAIM_DAYS }];
      const owner = state.regions[regionId].owner;
      changeOpinion(state, countryId, owner, -15);
      return { message: `Gebietsanspruch auf ${STATIC_REGIONS[regionId].name} wird vorbereitet (${CLAIM_DAYS} Tage). ${state.countries[owner].name} reagiert verärgert.` };
    },
  },

  declareWar: {
    validate(state, { countryId, targetId, goals }) {
      return declareWarError(state, countryId, targetId, goals ?? []);
    },
    execute(state, { countryId, targetId, goals }, ctx) {
      const war = declareWar(state, countryId, targetId, goals, ctx);
      return { message: `${war.name} hat begonnen.`, warId: war.id };
    },
  },

  joinWar: {
    validate(state, { countryId, warId, side }) {
      if (!['attackers', 'defenders'].includes(side)) return 'Ungültige Seite.';
      return canJoinWarSide(state, countryId, warById(state, warId), side);
    },
    execute(state, { countryId, warId, side }, ctx) {
      joinWar(state, warById(state, warId), countryId, side, ctx);
      return { message: 'Kriegseintritt erklärt.' };
    },
  },

  proposePeace: {
    validate(state, { countryId, warId, terms }) {
      const war = warById(state, warId);
      if (!war) return 'Krieg nicht gefunden.';
      const side = sideOf(war, countryId);
      if (!side) return 'Sie sind nicht Kriegspartei.';
      if (war[side][0] !== countryId) return 'Nur der Anführer einer Kriegspartei kann Frieden schließen.';
      if (war.lastPeaceProposal?.[countryId] !== undefined && state.time.day - war.lastPeaceProposal[countryId] < 30) return 'Ein neues Angebot ist frühestens nach 30 Tagen möglich.';
      return peaceTermsError(state, war, side, terms ?? {});
    },
    execute(state, { countryId, warId, terms }, ctx) {
      const war = warById(state, warId);
      const side = sideOf(war, countryId);
      war.lastPeaceProposal = { ...(war.lastPeaceProposal ?? {}), [countryId]: state.time.day };
      const enemyLeader = war[otherSide(side)][0];
      const full = { ...terms, reparationsFrom: enemyLeader };
      if (enemyLeader === state.playerId) {
        fireEvent(state, 'warPeaceOffer', enemyLeader, { otherId: countryId, data: { warId, side, terms: full, termsText: describeTerms(state, full), attacker: war.attackers[0], defender: war.defenders[0] } }, ctx);
        return { message: 'Friedensangebot übermittelt.' };
      }
      const verdict = evaluatePeace(state, war, side, full);
      if (verdict.accept) {
        concludePeace(state, war, side, full, ctx);
        return { message: `Frieden geschlossen: ${describeTerms(state, full)}.`, accepted: true };
      }
      if (countryId === state.playerId) {
        addNews(state, { category: 'diplomacy', countryId, others: [enemyLeader], importance: 2, text: `${state.countries[enemyLeader].name} lehnt das Friedensangebot ab (benötigt ${verdict.needed}, Verhandlungsstärke ${verdict.score + verdict.needed}).` });
      }
      return { message: `${state.countries[enemyLeader].name} lehnt ab.`, accepted: false };
    },
  },
};

