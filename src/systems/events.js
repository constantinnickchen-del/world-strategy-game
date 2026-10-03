/**
 * Event engine.
 *
 * Country events are checked once per month per country, staggered over the
 * days of the month (country.ai.day) to spread CPU load. World events are
 * checked on the first of every month. Player events wait in
 * `state.events.pending` for a decision; AI countries decide immediately.
 */
import { EVENTS, EVENT_BY_ID } from '../data/events.js';
import { TREATIES } from './diplomacy.js';
import { resolveEffects, applyEffects } from './effects.js';
import { addNews } from './news.js';

/** Days after which an unanswered player event is decided automatically. */
export const PLAYER_EVENT_TIMEOUT_DAYS = 60;
const EVENT_LOG_LIMIT = 100;

const COUNTRY_EVENTS = EVENTS.filter((e) => e.scope === 'country');
const WORLD_EVENTS = EVENTS.filter((e) => e.scope === 'world');

export function eventText(state, instance) {
  const def = EVENT_BY_ID[instance.eventId];
  const c = instance.countryId ? state.countries[instance.countryId] : null;
  const o = instance.otherId ? state.countries[instance.otherId] : null;
  return def.text
    .replaceAll('{country}', c?.name ?? 'der Welt')
    .replaceAll('{other}', o?.name ?? '')
    .replaceAll('{treaty}', instance.data?.treaty ? TREATIES[instance.data.treaty].name : '')
    .replaceAll('{attacker}', state.countries[instance.data?.attacker]?.name ?? '')
    .replaceAll('{defender}', state.countries[instance.data?.defender]?.name ?? '')
    .replaceAll('{terms}', instance.data?.termsText ?? '');
}

function cooldownKey(scopeId, eventId) {
  return `${scopeId}:${eventId}`;
}

function onCooldown(state, scopeId, eventId) {
  const until = state.events.cooldowns[cooldownKey(scopeId, eventId)];
  return until !== undefined && until > state.time.day;
}

/**
 * Creates an event instance and either queues it for the player or lets the AI decide.
 * Also usable from scripted content / decisions (`scope: 'triggered'` events).
 */
export function fireEvent(state, eventId, countryId, { otherId = null, data = {} } = {}, ctx) {
  const def = EVENT_BY_ID[eventId];
  if (!def) throw new Error(`Unknown event ${eventId}`);
  const country = countryId ? state.countries[countryId] : null;
  const instance = {
    uid: `${eventId}-${countryId ?? 'world'}-${state.time.day}-${(state.world.seq = (state.world.seq ?? 0) + 1)}`,
    eventId,
    countryId,
    otherId,
    data,
    day: state.time.day,
    options: def.options.map((o) => ({ label: o.label, effects: country || def.scope === 'world' ? resolveEffects(state, country, o.effects, { rng: ctx.rng, data }) : o.effects })),
  };
  if (def.cooldown) state.events.cooldowns[cooldownKey(countryId ?? 'world', eventId)] = state.time.day + Math.round(def.cooldown * 30.44);

  if (def.scope === 'world') {
    resolveInstance(state, instance, 0, ctx);
    return instance;
  }
  if (countryId === state.playerId) {
    state.events.pending.push(instance);
    ctx.bus?.emit('event:pending', instance);
  } else {
    const idx = aiChooseOption(def, ctx, state, instance);
    resolveInstance(state, instance, idx, ctx);
  }
  return instance;
}

/** Why an option cannot be chosen right now (null = available). */
export function optionUnavailable(state, instance, index) {
  const def = EVENT_BY_ID[instance.eventId];
  const opt = def.options[index];
  if (!opt?.available) return null;
  return opt.available(state, state.countries[instance.countryId], instance) ?? null;
}

/** The option an advisor (or an AI government) picks for an event instance. */
export function advisorChoice(state, instance, ctx) {
  return aiChooseOption(EVENT_BY_ID[instance.eventId], ctx, state, instance);
}

function aiChooseOption(def, ctx, state = null, instance = null) {
  const indices = def.options.map((_, i) => i).filter((i) => !state || !instance || !optionUnavailable(state, instance, i));
  return ctx.rng.weighted(indices, (i) => def.options[i].ai ?? 1) ?? indices[0] ?? 0;
}

/** Applies an option of an event instance. Works for player and AI. */
export function resolveInstance(state, instance, optionIndex, ctx) {
  const def = EVENT_BY_ID[instance.eventId];
  const option = instance.options[optionIndex];
  if (!option) throw new Error(`Invalid option ${optionIndex} for ${instance.eventId}`);
  const country = instance.countryId ? state.countries[instance.countryId] : null;
  applyEffects(state, country, option.effects, { otherId: instance.otherId, label: def.title, data: instance.data, ctx });
  state.events.pending = state.events.pending.filter((p) => p.uid !== instance.uid);
  state.events.log.push({ eventId: instance.eventId, countryId: instance.countryId, otherId: instance.otherId, day: state.time.day, option: optionIndex });
  if (state.events.log.length > EVENT_LOG_LIMIT) state.events.log.splice(0, state.events.log.length - EVENT_LOG_LIMIT);

  const involvesPlayer = instance.countryId === state.playerId || instance.otherId === state.playerId;
  const big = country && country.economy.gdp > 1500;
  if (def.scope === 'world' || involvesPlayer || big || def.id === 'coupAttempt') {
    addNews(state, {
      category: def.scope === 'world' ? 'world' : 'event',
      countryId: instance.countryId,
      others: instance.otherId ? [instance.otherId] : [],
      importance: def.scope === 'world' || instance.countryId === state.playerId ? 3 : involvesPlayer ? 2 : 1,
      text: `${def.title}: ${eventText(state, instance)}${def.options.length > 1 ? ` – Entscheidung: ${option.label}.` : ''}`,
    });
  }
  ctx.bus?.emit('event:resolved', { instance, optionIndex });
}

function checkCountryEvents(state, c, ctx) {
  // At most one random event per country per month.
  const candidates = [];
  for (const def of COUNTRY_EVENTS) {
    if (onCooldown(state, c.id, def.id)) continue;
    if (state.events.pending.some((p) => p.eventId === def.id && p.countryId === c.id)) continue;
    if (!def.condition(c, state, ctx)) continue;
    if (ctx.rng.chance(1 / def.mtth)) candidates.push(def);
  }
  if (!candidates.length) return;
  const def = ctx.rng.pick(candidates);
  let otherId = null;
  if (def.target) {
    otherId = def.target(c, state, ctx);
    if (!otherId) return;
  }
  fireEvent(state, def.id, c.id, { otherId }, ctx);
}

export const eventsSystem = {
  id: 'events',
  daily(state, ctx) {
    const dom = ctx.date.day;
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (!c.eliminated && c.ai.day === dom) checkCountryEvents(state, c, ctx);
    }
    // Unanswered player events are eventually decided by the advisors.
    for (const inst of [...state.events.pending]) {
      if (state.time.day - inst.day >= PLAYER_EVENT_TIMEOUT_DAYS) resolveInstance(state, inst, aiChooseOption(EVENT_BY_ID[inst.eventId], ctx, state, inst), ctx);
    }
  },
  monthly(state, ctx) {
    for (const def of WORLD_EVENTS) {
      if (onCooldown(state, 'world', def.id)) continue;
      if (!def.condition(null, state, ctx)) continue;
      if (ctx.rng.chance(1 / def.mtth)) {
        fireEvent(state, def.id, null, {}, ctx);
        break; // at most one world event per month
      }
    }
  },
};
