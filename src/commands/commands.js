/**
 * Commands are the only way the player AND the AI change policy.
 *
 *   executeCommand(state, { type, countryId, ...payload }, ctx) -> { ok, error?, message? }
 *
 * Every command has a validator that returns an error string (or null) and an
 * executor. The UI uses `validateCommand` to enable/disable controls and show
 * the reason, so buttons never do something the rules forbid. Because commands
 * are plain data they can later be logged, replayed or sent over a network.
 */
import { BUDGET_CATEGORIES, TAX_LIMITS } from '../state/selectors.js';
import { TECH_BY_ID } from '../data/technologies.js';
import { canResearch } from '../systems/technology.js';
import {
  TREATIES, IMPROVE_RELATIONS, ensureRelation, getRelation, hasTreaty, setTreaty, hasEmbargo, setEmbargo,
  changeOpinion, evaluateProposal, tradeBlocked,
} from '../systems/diplomacy.js';
import { fireEvent, resolveInstance, optionUnavailable } from '../systems/events.js';
import { MILITARY_COMMANDS } from './militaryCommands.js';
import { areEnemies } from '../systems/war/wars.js';
import { addNews } from '../systems/news.js';
import { formatBn } from '../util/format.js';

const round3 = (v) => Math.round(v * 1000) / 1000;

export function improveRelationsCost(country) {
  return Math.max(IMPROVE_RELATIONS.minCost, country.economy.gdp * IMPROVE_RELATIONS.costGdpShare);
}

function otherCountryError(state, cmd) {
  if (!state.countries[cmd.targetId] || state.countries[cmd.targetId].eliminated) return 'Unbekanntes Zielland.';
  if (cmd.targetId === cmd.countryId) return 'Nicht mit dem eigenen Land möglich.';
  return null;
}

export const COMMANDS = {
  setTaxRate: {
    validate(state, { value }) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Ungültiger Wert.';
      if (value < TAX_LIMITS.min || value > TAX_LIMITS.max) return `Steuersatz muss zwischen ${TAX_LIMITS.min * 100} und ${TAX_LIMITS.max * 100} % liegen.`;
      return null;
    },
    execute(state, { countryId, value }) {
      state.countries[countryId].economy.taxRate = round3(value);
    },
  },

  setBudget: {
    validate(state, { category, value }) {
      const def = BUDGET_CATEGORIES[category];
      if (!def) return 'Unbekannter Haushaltsposten.';
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Ungültiger Wert.';
      if (value < def.min - 1e-9 || value > def.max + 1e-9) return `${def.name}: erlaubt sind ${def.min * 100}–${def.max * 100} % des BIP.`;
      return null;
    },
    execute(state, { countryId, category, value }) {
      state.countries[countryId].budget[category] = round3(value);
    },
  },

  setResearch: {
    validate(state, { countryId, techId }) {
      if (techId === null) return null;
      if (!TECH_BY_ID[techId]) return 'Unbekannte Technologie.';
      if (!canResearch(state.countries[countryId], techId)) return 'Voraussetzungen nicht erfüllt oder bereits erforscht.';
      return null;
    },
    execute(state, { countryId, techId }) {
      state.countries[countryId].technology.current = techId;
    },
  },

  repayDebt: {
    validate(state, { countryId, amount }) {
      const e = state.countries[countryId].economy;
      if (!(amount > 0)) return 'Betrag muss positiv sein.';
      if (amount > e.treasury + 1e-9) return 'Nicht genug Geld in der Staatskasse.';
      if (amount > e.debt + 1e-9) return 'Betrag übersteigt die Staatsschulden.';
      return null;
    },
    execute(state, { countryId, amount }) {
      const e = state.countries[countryId].economy;
      e.treasury -= amount;
      e.debt -= amount;
      return { message: `${formatBn(amount)} Schulden getilgt.` };
    },
  },

  improveRelations: {
    validate(state, cmd) {
      const err = otherCountryError(state, cmd);
      if (err) return err;
      const c = state.countries[cmd.countryId];
      const rel = getRelation(state, cmd.countryId, cmd.targetId);
      const last = rel?.lastImprove?.[cmd.countryId];
      if (last !== undefined && state.time.day - last < IMPROVE_RELATIONS.cooldownDays) {
        return `Erst wieder in ${IMPROVE_RELATIONS.cooldownDays - (state.time.day - last)} Tagen möglich.`;
      }
      if (c.economy.treasury < improveRelationsCost(c)) return `Benötigt ${formatBn(improveRelationsCost(c))} in der Staatskasse.`;
      if ((rel?.opinion ?? 0) >= 100) return 'Beziehung ist bereits maximal.';
      return null;
    },
    execute(state, { countryId, targetId }) {
      const c = state.countries[countryId];
      const cost = improveRelationsCost(c);
      c.economy.treasury -= cost;
      const rel = ensureRelation(state, countryId, targetId);
      rel.lastImprove[countryId] = state.time.day;
      rel.base = Math.min(80, rel.base + 2); // lasting goodwill
      changeOpinion(state, countryId, targetId, IMPROVE_RELATIONS.opinion);
      return { message: `Beziehungen zu ${state.countries[targetId].name} verbessert (−${formatBn(cost)}).` };
    },
  },

  proposeTreaty: {
    validate(state, cmd) {
      const err = otherCountryError(state, cmd);
      if (err) return err;
      if (!TREATIES[cmd.treaty]) return 'Unbekannter Vertrag.';
      if (hasTreaty(state, cmd.countryId, cmd.targetId, cmd.treaty)) return 'Vertrag besteht bereits.';
      if (tradeBlocked(state, cmd.countryId, cmd.targetId)) return 'Zuerst muss das Embargo aufgehoben werden.';
      if (areEnemies(state, cmd.countryId, cmd.targetId)) return 'Mitten im Krieg nicht möglich – zuerst Frieden schließen.';
      if (cmd.targetId === state.playerId && state.events.pending.some((p) => p.eventId === 'treatyProposal' && p.otherId === cmd.countryId)) {
        return 'Es liegt bereits ein Vorschlag vor.';
      }
      return null;
    },
    execute(state, { countryId, targetId, treaty }, ctx) {
      const from = state.countries[countryId];
      const to = state.countries[targetId];
      const rel = ensureRelation(state, countryId, targetId);
      rel.lastProposal = { ...(rel.lastProposal ?? {}), [countryId]: state.time.day };
      if (targetId === state.playerId) {
        fireEvent(state, 'treatyProposal', targetId, { otherId: countryId, data: { treaty } }, ctx);
        return { message: 'Vorschlag übermittelt.' };
      }
      const verdict = evaluateProposal(state, countryId, targetId, treaty);
      const involvesPlayer = countryId === state.playerId;
      if (verdict.accept) {
        setTreaty(state, countryId, targetId, treaty, true);
        changeOpinion(state, countryId, targetId, 5);
        addNews(state, {
          category: 'diplomacy',
          countryId,
          others: [targetId],
          importance: involvesPlayer || treaty === 'alliance' ? 2 : 1,
          text: `${from.name} und ${to.name} schließen ein ${TREATIES[treaty].name}.`,
        });
        return { message: `${to.name} hat das ${TREATIES[treaty].name} angenommen.`, accepted: true };
      }
      changeOpinion(state, countryId, targetId, -2);
      if (involvesPlayer) {
        addNews(state, { category: 'diplomacy', countryId, others: [targetId], importance: 1, text: `${to.name} lehnt ein ${TREATIES[treaty].name} mit ${from.name} ab.` });
      }
      return { message: `${to.name} hat abgelehnt.`, accepted: false };
    },
  },

  cancelTreaty: {
    validate(state, cmd) {
      const err = otherCountryError(state, cmd);
      if (err) return err;
      if (!TREATIES[cmd.treaty]) return 'Unbekannter Vertrag.';
      if (!hasTreaty(state, cmd.countryId, cmd.targetId, cmd.treaty)) return 'Kein solcher Vertrag.';
      return null;
    },
    execute(state, { countryId, targetId, treaty }) {
      setTreaty(state, countryId, targetId, treaty, false);
      if (treaty === 'nonAggression') setTreaty(state, countryId, targetId, 'alliance', false);
      changeOpinion(state, countryId, targetId, treaty === 'alliance' ? -25 : -15);
      addNews(state, {
        category: 'diplomacy',
        countryId,
        others: [targetId],
        importance: 2,
        text: `${state.countries[countryId].name} kündigt das ${TREATIES[treaty].name} mit ${state.countries[targetId].name}.`,
      });
    },
  },

  setEmbargo: {
    validate(state, cmd) {
      const err = otherCountryError(state, cmd);
      if (err) return err;
      const has = hasEmbargo(state, cmd.countryId, cmd.targetId);
      if (cmd.active && has) return 'Embargo besteht bereits.';
      if (!cmd.active && !has) return 'Kein Embargo vorhanden.';
      if (cmd.active && hasTreaty(state, cmd.countryId, cmd.targetId, 'alliance')) return 'Nicht gegen Verbündete möglich.';
      return null;
    },
    execute(state, { countryId, targetId, active }) {
      setEmbargo(state, countryId, targetId, active);
      if (active) {
        setTreaty(state, countryId, targetId, 'trade', false);
        changeOpinion(state, countryId, targetId, -20);
      } else {
        changeOpinion(state, countryId, targetId, 5);
      }
      addNews(state, {
        category: 'diplomacy',
        countryId,
        others: [targetId],
        importance: 2,
        text: active
          ? `${state.countries[countryId].name} verhängt ein Handelsembargo gegen ${state.countries[targetId].name}.`
          : `${state.countries[countryId].name} hebt das Embargo gegen ${state.countries[targetId].name} auf.`,
      });
    },
  },

  resolveEvent: {
    validate(state, { countryId, uid, option }) {
      const inst = state.events.pending.find((p) => p.uid === uid);
      if (!inst || inst.countryId !== countryId) return 'Ereignis nicht gefunden.';
      if (!inst.options[option]) return 'Ungültige Option.';
      return optionUnavailable(state, inst, option);
    },
    execute(state, { uid, option }, ctx) {
      const inst = state.events.pending.find((p) => p.uid === uid);
      resolveInstance(state, inst, option, ctx);
    },
  },
};

Object.assign(COMMANDS, MILITARY_COMMANDS);

export function validateCommand(state, cmd) {
  const def = COMMANDS[cmd?.type];
  if (!def) return `Unbekannter Befehl ${cmd?.type}.`;
  const country = state.countries[cmd.countryId];
  if (!country || country.eliminated) return 'Unbekanntes Land.';
  return def.validate(state, cmd);
}

export function executeCommand(state, cmd, ctx = {}) {
  const error = validateCommand(state, cmd);
  if (error) return { ok: false, error };
  const result = COMMANDS[cmd.type].execute(state, cmd, ctx) ?? {};
  ctx.bus?.emit('command', { cmd, result });
  return { ok: true, ...result };
}
