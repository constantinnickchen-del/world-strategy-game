/**
 * Declarative effects. Events (and later decisions, laws, scripted content)
 * describe consequences as data; this module applies and describes them.
 *
 * resolveEffects() turns "auto" placeholders into concrete values when an
 * event fires, so the player sees exactly what an option will do and saves
 * contain fully resolved data.
 */
import { RESOURCES, RESOURCE_IDS } from '../data/resources.js';
import { IDEOLOGIES } from '../data/governments.js';
import { addModifier, formatModValue, isPositiveMod, STATS } from './modifiers.js';
import { changeOpinion, setTreaty, TREATIES } from './diplomacy.js';
import { BUDGET_IDS, BUDGET_CATEGORIES } from '../state/selectors.js';
import { techCost } from './technology.js';
import { addNews } from './news.js';
import { clamp } from '../util/math.js';
import { formatBn } from '../util/format.js';

export function resolveEffects(state, country, effects, { rng, data = {} }) {
  return effects.map((eff) => {
    const e = { ...eff };
    if (e.type === 'capacity' && e.resource === 'auto') {
      const producing = RESOURCE_IDS.filter((r) => r !== 'food' && country.resources[r].capacity > 0);
      e.resource = producing.length
        ? rng.weighted(producing, (r) => country.resources[r].capacity + 1)
        : rng.pick(['oil', 'gas', 'metals', 'rareEarths', 'coal']);
    }
    if (e.treaty === '$treaty') e.treaty = data.treaty;
    return e;
  });
}

function addTreasury(country, amount) {
  const e = country.economy;
  e.treasury += amount;
  if (e.treasury < 0) {
    e.debt += -e.treasury;
    e.treasury = 0;
  }
}

/**
 * @param {object} state
 * @param {object|null} country  target country (null for world effects)
 * @param {object[]} effects     resolved effects
 * @param {{otherId?:string|null, label?:string}} ctx
 */
export function applyEffects(state, country, effects, { otherId = null, label = '' } = {}) {
  for (const eff of effects) {
    switch (eff.type) {
      case 'treasury':
        addTreasury(country, country.economy.gdp * eff.gdpShare);
        break;
      case 'approval':
        country.politics.approval = clamp(country.politics.approval + eff.value, 0, 100);
        break;
      case 'stability':
        country.politics.stability = clamp(country.politics.stability + eff.value, 0, 100);
        break;
      case 'modifier':
        addModifier(state, country, { stat: eff.stat, value: eff.value, months: eff.months, label: eff.label ?? label, source: 'event' });
        break;
      case 'capacity': {
        const r = country.resources[eff.resource];
        r.capacity = r.capacity > 0 ? r.capacity * (1 + eff.factor) : eff.factor * 10;
        break;
      }
      case 'infrastructure':
        for (const rid of country.regionIds) {
          const reg = state.regions[rid];
          reg.infrastructure = clamp(reg.infrastructure + eff.value, 0, 100);
        }
        break;
      case 'opinion':
        if (otherId) changeOpinion(state, country.id, otherId, eff.value);
        break;
      case 'treaty':
        if (otherId && eff.treaty) {
          setTreaty(state, country.id, otherId, eff.treaty, true);
          addNews(state, {
            category: 'diplomacy',
            countryId: country.id,
            others: [otherId],
            importance: 2,
            text: `${country.name} und ${state.countries[otherId].name} schließen ein ${TREATIES[eff.treaty].name}.`,
          });
        }
        break;
      case 'researchProgress': {
        const cur = country.technology.current;
        if (cur) country.technology.progress[cur] = (country.technology.progress[cur] ?? 0) + techCost(state, cur) * eff.share;
        break;
      }
      case 'budgetCut':
        for (const id of BUDGET_IDS) {
          if (id === 'military') continue;
          country.budget[id] = Math.max(BUDGET_CATEGORIES[id].min, country.budget[id] * (1 - eff.share));
        }
        break;
      case 'militaryEquipment':
        country.military.equipment = Math.max(0, country.military.equipment * (1 + eff.share));
        break;
      case 'governmentChange':
        country.politics.ideology = eff.ideology;
        if (eff.ideology === 'military') {
          country.politics.government = 'autocracy';
          country.politics.nextElection = null;
        }
        addNews(state, {
          category: 'politics',
          countryId: country.id,
          importance: 2,
          text: `Machtwechsel in ${country.name}: Neue Führung (${IDEOLOGIES[eff.ideology].name}).`,
        });
        break;
      case 'modifierAll':
        for (const id of state.countryOrder) {
          const c = state.countries[id];
          if (c.eliminated || !matchesFilter(state, c, eff.filter)) continue;
          addModifier(state, c, { stat: eff.stat, value: eff.value, months: eff.months, label: eff.label ?? label, source: 'world' });
        }
        break;
      default:
        throw new Error(`Unknown effect type "${eff.type}"`);
    }
  }
}

function matchesFilter(state, c, filter) {
  if (!filter) return true;
  if (filter.producerOf) {
    const cap = c.resources[filter.producerOf].capacity;
    let total = 0;
    for (const id of state.countryOrder) total += state.countries[id].resources[filter.producerOf].capacity;
    if (cap / Math.max(1e-9, total) < (filter.minShare ?? 0)) return false;
  }
  return true;
}

/** Human readable description: [{text, positive}] */
export function describeEffects(state, country, effects, { otherId = null } = {}) {
  const other = otherId ? state.countries[otherId]?.name : '';
  const out = [];
  for (const eff of effects) {
    switch (eff.type) {
      case 'treasury': {
        const bn = country.economy.gdp * eff.gdpShare;
        out.push({ text: `Staatskasse ${bn >= 0 ? '+' : ''}${formatBn(bn)}`, positive: bn >= 0 });
        break;
      }
      case 'approval':
        out.push({ text: `Zustimmung ${eff.value > 0 ? '+' : ''}${eff.value}`, positive: eff.value > 0 });
        break;
      case 'stability':
        out.push({ text: `Stabilität ${eff.value > 0 ? '+' : ''}${eff.value}`, positive: eff.value > 0 });
        break;
      case 'modifier':
        out.push({
          text: `${STATS[eff.stat].label} ${formatModValue(eff.stat, eff.value)} für ${eff.months} Monate`,
          positive: isPositiveMod(eff.stat, eff.value),
        });
        break;
      case 'capacity':
        out.push({ text: `Förderkapazität ${RESOURCES[eff.resource].name} +${Math.round(eff.factor * 100)} %`, positive: true });
        break;
      case 'infrastructure':
        out.push({ text: `Infrastruktur ${eff.value > 0 ? '+' : ''}${eff.value}`, positive: eff.value > 0 });
        break;
      case 'opinion':
        out.push({ text: `Beziehung zu ${other} ${eff.value > 0 ? '+' : ''}${eff.value}`, positive: eff.value > 0 });
        break;
      case 'treaty':
        out.push({ text: `${TREATIES[eff.treaty]?.name ?? 'Vertrag'} mit ${other}`, positive: true });
        break;
      case 'researchProgress':
        out.push({ text: `Forschungsfortschritt +${Math.round(eff.share * 100)} % des aktuellen Projekts`, positive: true });
        break;
      case 'budgetCut':
        out.push({ text: `Zivile Ausgaben −${Math.round(eff.share * 100)} %`, positive: false });
        break;
      case 'militaryEquipment':
        out.push({ text: `Militärausrüstung ${eff.share > 0 ? '+' : ''}${Math.round(eff.share * 100)} %`, positive: eff.share > 0 });
        break;
      case 'governmentChange':
        out.push({ text: `Neue Regierung: ${IDEOLOGIES[eff.ideology].name}`, positive: false });
        break;
      case 'modifierAll':
        out.push({
          text: `${eff.filter ? 'Betroffene Länder' : 'Alle Länder'}: ${STATS[eff.stat].label} ${formatModValue(eff.stat, eff.value)} für ${eff.months} Monate`,
          positive: isPositiveMod(eff.stat, eff.value),
        });
        break;
      default:
        out.push({ text: eff.type, positive: true });
    }
  }
  return out;
}
