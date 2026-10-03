/**
 * Map modes: how a country is coloured and what the hover tooltip shows.
 * Each mode: { id, name, icon, color(state, country, ui) -> css, legend(state, ui), value(state, country) -> string }
 * Adding a map mode = adding an entry here.
 */
import { gdpPerCapita } from '../state/selectors.js';
import { getOpinion, hasTreaty, hasEmbargo } from '../systems/diplomacy.js';
import { RESOURCES } from '../data/resources.js';
import { formatUsd, formatPct, formatNumber, formatSignedPct } from '../util/format.js';
import { IDEOLOGIES, GOVERNMENTS } from '../data/governments.js';

// Single-hue sequential ramp (brass), dark -> light on the dark map surface.
const SEQ = ['#2a2f33', '#4a4330', '#6f5f37', '#957b3d', '#bb9846', '#dcb85e', '#f2d690'];
// Diverging: rust <- neutral grey -> teal
const DIV_NEG = [196, 85, 59];
const DIV_MID = [92, 101, 112];
const DIV_POS = [63, 167, 150];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const SEQ_RGB = SEQ.map(hexToRgb);

function rgb([r, g, b]) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** t in [0,1] -> sequential colour */
export function sequential(t) {
  const x = Math.max(0, Math.min(1, t)) * (SEQ_RGB.length - 1);
  const i = Math.min(SEQ_RGB.length - 2, Math.floor(x));
  return rgb(mix(SEQ_RGB[i], SEQ_RGB[i + 1], x - i));
}

/** t in [-1,1] -> diverging colour */
export function diverging(t) {
  const v = Math.max(-1, Math.min(1, t));
  return rgb(v < 0 ? mix(DIV_MID, DIV_NEG, -v) : mix(DIV_MID, DIV_POS, v));
}

const gradientLegend = (min, max, css) => ({ type: 'gradient', min, max, css });

const SEQ_CSS = `linear-gradient(90deg, ${SEQ.join(',')})`;
const DIV_CSS = `linear-gradient(90deg, ${rgb(DIV_NEG)}, ${rgb(DIV_MID)}, ${rgb(DIV_POS)})`;

export const MAP_MODES = [
  {
    id: 'political',
    name: 'Politisch',
    icon: '🗺',
    color: (state, c) => c.color,
    legend: () => ({ type: 'text', text: 'Länder und ihre Gebiete' }),
    value: (state, c) => `${GOVERNMENTS[c.politics.government].name} · ${IDEOLOGIES[c.politics.ideology].name}`,
  },
  {
    id: 'relations',
    name: 'Beziehungen',
    icon: '🤝',
    needsPlayer: true,
    color: (state, c) => (c.id === state.playerId ? '#c8a25a' : diverging(getOpinion(state, state.playerId, c.id) / 100)),
    legend: () => gradientLegend('Feindlich (−100)', 'Freundlich (+100)', DIV_CSS),
    value: (state, c) => (c.id === state.playerId ? 'Ihr Land' : `Meinung: ${Math.round(getOpinion(state, state.playerId, c.id))}`),
  },
  {
    id: 'treaties',
    name: 'Verträge',
    icon: '📜',
    needsPlayer: true,
    color: (state, c) => {
      const p = state.playerId;
      if (c.id === p) return '#c8a25a';
      if (hasEmbargo(state, p, c.id) || hasEmbargo(state, c.id, p)) return '#c4553b';
      if (hasTreaty(state, p, c.id, 'alliance')) return '#3fa796';
      if (hasTreaty(state, p, c.id, 'trade')) return '#4a7fa8';
      if (hasTreaty(state, p, c.id, 'nonAggression')) return '#7d8a96';
      return '#2e3a46';
    },
    legend: () => ({
      type: 'swatches',
      items: [
        ['#c8a25a', 'Ihr Land'],
        ['#3fa796', 'Bündnis'],
        ['#4a7fa8', 'Handelsabkommen'],
        ['#7d8a96', 'Nichtangriffspakt'],
        ['#c4553b', 'Embargo'],
        ['#2e3a46', 'Kein Vertrag'],
      ],
    }),
    value: (state, c) => {
      const p = state.playerId;
      if (c.id === p) return 'Ihr Land';
      const parts = [];
      if (hasTreaty(state, p, c.id, 'alliance')) parts.push('Bündnis');
      if (hasTreaty(state, p, c.id, 'trade')) parts.push('Handelsabkommen');
      if (hasTreaty(state, p, c.id, 'nonAggression') && !hasTreaty(state, p, c.id, 'alliance')) parts.push('Nichtangriffspakt');
      if (hasEmbargo(state, p, c.id)) parts.push('Embargo (von Ihnen)');
      if (hasEmbargo(state, c.id, p)) parts.push('Embargo (gegen Sie)');
      return parts.join(', ') || 'Keine Verträge';
    },
  },
  {
    id: 'gdppc',
    name: 'Wohlstand',
    icon: '💰',
    color: (state, c) => sequential(Math.log10(Math.max(300, gdpPerCapita(c)) / 300) / Math.log10(100000 / 300)),
    legend: () => gradientLegend('300 $', '100.000 $ BIP/Kopf', SEQ_CSS),
    value: (state, c) => `BIP pro Kopf: ${formatUsd(gdpPerCapita(c))}`,
  },
  {
    id: 'growth',
    name: 'Wachstum',
    icon: '📈',
    color: (state, c) => diverging(c.economy.growth / 0.06),
    legend: () => gradientLegend('−6 %', '+6 % pro Jahr', DIV_CSS),
    value: (state, c) => `Wachstum: ${formatSignedPct(c.economy.growth)}`,
  },
  {
    id: 'stability',
    name: 'Stabilität',
    icon: '🏛',
    color: (state, c) => sequential(c.politics.stability / 100),
    legend: () => gradientLegend('0', '100', SEQ_CSS),
    value: (state, c) => `Stabilität: ${Math.round(c.politics.stability)} · Zustimmung: ${Math.round(c.politics.approval)}`,
  },
  {
    id: 'infrastructure',
    name: 'Infrastruktur',
    icon: '🛤',
    color: (state, c) => sequential(c.infrastructure / 100),
    legend: () => gradientLegend('0', '100', SEQ_CSS),
    value: (state, c) => `Infrastruktur: ${formatNumber(c.infrastructure, 1)}`,
  },
  {
    id: 'military',
    name: 'Militär',
    icon: '🛡',
    color: (state, c) => sequential(Math.log10(1 + c.military.power) / Math.log10(1 + maxOf(state, (x) => x.military.power))),
    legend: () => gradientLegend('schwach', 'stark', SEQ_CSS),
    value: (state, c) => `Militärstärke: ${formatNumber(c.military.power)}`,
  },
  {
    id: 'resources',
    name: 'Rohstoffe',
    icon: '⛏',
    hasResourcePicker: true,
    color: (state, c, ui) => {
      const rid = ui.mapResource;
      const share = c.resources[rid].production / Math.max(1e-9, state.market[rid].supply);
      return share <= 0.0005 ? '#262d33' : sequential(0.15 + 0.85 * Math.sqrt(Math.min(1, share / 0.25)));
    },
    legend: (state, ui) => gradientLegend('keine Förderung', `≥ 25 % der Weltförderung (${RESOURCES[ui.mapResource].name})`, SEQ_CSS),
    value: (state, c, ui) => {
      const rid = ui.mapResource;
      const share = c.resources[rid].production / Math.max(1e-9, state.market[rid].supply);
      return `${RESOURCES[rid].name}: ${formatPct(share)} der Weltförderung`;
    },
  },
];

export const MAP_MODE_BY_ID = Object.fromEntries(MAP_MODES.map((m) => [m.id, m]));

const maxCache = new WeakMap();
function maxOf(state, fn) {
  // cached per state object and day
  const key = `${state.time.day}|${fn}`;
  let entry = maxCache.get(state);
  if (!entry || entry.key !== key) {
    let m = 0;
    for (const id of state.countryOrder) m = Math.max(m, fn(state.countries[id]));
    entry = { key, value: m };
    maxCache.set(state, entry);
  }
  return entry.value;
}
