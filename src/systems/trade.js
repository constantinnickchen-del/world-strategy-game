/**
 * Bilateral commodity trade.
 *
 * For every resource, importers distribute their deficit over exporters using
 * a gravity-style weight (exporter surplus × diplomatic factor × proximity).
 * Embargoes block a pair completely, trade agreements and alliances favour it.
 * Exporters cannot sell more than their surplus; unmet import demand becomes a
 * shortage that hurts growth and raises inflation in the economy system.
 */
import { RESOURCE_IDS } from '../data/resources.js';
import { getRelation } from './diplomacy.js';
import { neighborCountryIds } from '../state/worldIndex.js';
import { getMod } from './modifiers.js';
import { activeWars } from './war/wars.js';

const PASSES = 2;
const TOP_PARTNERS = 6;

/** Diplomatic trade factor of a stored relation (embargo = 0). */
export function relationTradeFactor(rel) {
  if (!rel) return 1;
  if (rel.embargoes.length) return 0;
  let w = 1 + rel.opinion / 200;
  if (rel.treaties.trade) w *= 2.2;
  if (rel.treaties.alliance) w *= 1.3;
  return w;
}

/** Gravity weight between an importer and an exporter. */
export function tradeWeight(state, importer, exporter) {
  let w = relationTradeFactor(getRelation(state, importer.id, exporter.id));
  if (importer.continent === exporter.continent) w *= 1.5;
  if (neighborCountryIds(state, importer.id).includes(exporter.id)) w *= 1.8;
  return Math.max(0, w);
}

export const tradeSystem = {
  id: 'trade',
  monthly(state) {
    const countries = state.countryOrder.map((id) => state.countries[id]).filter((c) => !c.eliminated);
    const n = countries.length;
    // Bilateral trade value matrix (index based – this is the hot loop of the monthly tick).
    const partner = new Float64Array(n * n);
    const index = new Map(countries.map((c, i) => [c.id, i]));
    // Diplomatic factors from the (sparse) stored relations; untouched pairs keep factor 1.
    const relFactor = new Float32Array(n * n).fill(1);
    for (const [key, rel] of Object.entries(state.diplomacy.relations)) {
      const [a, b] = key.split('|');
      const i = index.get(a);
      const j = index.get(b);
      if (i === undefined || j === undefined) continue;
      relFactor[i * n + j] = relFactor[j * n + i] = relationTradeFactor(rel);
    }
    // Wars stop trade between enemies; naval blockades choke the trade of the blockaded country.
    const blockade = new Float32Array(n);
    for (const w of activeWars(state)) {
      for (const a of w.attackers) {
        for (const d of w.defenders) {
          const i = index.get(a);
          const j = index.get(d);
          if (i !== undefined && j !== undefined) relFactor[i * n + j] = relFactor[j * n + i] = 0;
        }
      }
      for (const [id, b] of Object.entries(w.blockade ?? {})) {
        const i = index.get(id);
        if (i !== undefined) blockade[i] = Math.max(blockade[i], b);
      }
    }
    for (let i = 0; i < n; i++) {
      if (!blockade[i]) continue;
      const neighbors = new Set(neighborCountryIds(state, countries[i].id));
      for (let j = 0; j < n; j++) {
        if (neighbors.has(countries[j].id)) continue; // land routes stay open
        relFactor[i * n + j] *= 1 - blockade[i];
        relFactor[j * n + i] *= 1 - blockade[i];
      }
    }
    const weights = new Float32Array(n * n).fill(-1);
    const weightOf = (i, j) => {
      const k = i * n + j;
      let w = weights[k];
      if (w < 0) {
        const imp = countries[i];
        const exp = countries[j];
        w = relFactor[k];
        if (w > 0) {
          if (imp.continent === exp.continent) w *= 1.5;
          if (neighborCountryIds(state, imp.id).includes(exp.id)) w *= 1.8;
        }
        weights[k] = w = Math.max(0, w);
      }
      return w;
    };
    for (const c of countries) {
      c.trade.exports = 0;
      c.trade.imports = 0;
      c.trade.unmetValue = 0;
    }

    const expIdx = new Int32Array(n);
    const impIdx = new Int32Array(n);
    const left = new Float64Array(n);
    const need = new Float64Array(n);
    for (const rid of RESOURCE_IDS) {
      const price = state.market[rid].price;
      let E = 0;
      let I = 0;
      for (let i = 0; i < n; i++) {
        const r = countries[i].resources[rid];
        r.exported = 0;
        r.imported = 0;
        r.shortage = 0;
        const net = r.production - r.consumption;
        if (net > 1e-6) {
          expIdx[E] = i;
          left[E++] = net;
        } else if (net < -1e-6) {
          impIdx[I] = i;
          need[I++] = -net;
        }
      }
      if (!E || !I) {
        for (let a = 0; a < I; a++) {
          const c = countries[impIdx[a]];
          c.resources[rid].shortage = need[a];
          c.trade.unmetValue += need[a] * price;
        }
        continue;
      }
      const Q = new Float64Array(I * E);
      const requested = new Float64Array(E);
      for (let pass = 0; pass < PASSES; pass++) {
        Q.fill(0);
        requested.fill(0);
        for (let a = 0; a < I; a++) {
          if (need[a] <= 1e-9) continue;
          const row = a * E;
          let total = 0;
          for (let b = 0; b < E; b++) {
            if (left[b] <= 1e-9) continue;
            const w = weightOf(impIdx[a], expIdx[b]) * left[b];
            Q[row + b] = w;
            total += w;
          }
          if (total <= 0) continue;
          const f = need[a] / total;
          for (let b = 0; b < E; b++) {
            if (Q[row + b] > 0) {
              Q[row + b] *= f;
              requested[b] += Q[row + b];
            }
          }
        }
        for (let b = 0; b < E; b++) {
          if (requested[b] <= 0) continue;
          const scale = requested[b] > left[b] ? left[b] / requested[b] : 1;
          const ex = countries[expIdx[b]];
          for (let a = 0; a < I; a++) {
            const q = Q[a * E + b] * scale;
            if (q <= 0) continue;
            const im = countries[impIdx[a]];
            left[b] -= q;
            need[a] -= q;
            ex.resources[rid].exported += q;
            im.resources[rid].imported += q;
            const value = q * price;
            ex.trade.exports += value;
            im.trade.imports += value;
            partner[expIdx[b] * n + impIdx[a]] += value;
            partner[impIdx[a] * n + expIdx[b]] += value;
          }
        }
      }
      for (let a = 0; a < I; a++) {
        if (need[a] > 1e-9) {
          const c = countries[impIdx[a]];
          c.resources[rid].shortage = need[a];
          c.trade.unmetValue += need[a] * price;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const c = countries[i];
      c.trade.balance = c.trade.exports - c.trade.imports;
      const top = [];
      for (let j = 0; j < n; j++) {
        const v = partner[i * n + j];
        if (v <= 0) continue;
        if (top.length < TOP_PARTNERS) top.push([j, v]);
        else if (v > top[TOP_PARTNERS - 1][1]) top[TOP_PARTNERS - 1] = [j, v];
        else continue;
        top.sort((x, y) => y[1] - x[1]);
      }
      c.trade.partners = top.map(([j, v]) => ({ id: countries[j].id, value: Math.round(v * 1000) / 1000 }));
      c.trade.agreements = 0;
    }
    // Number of trade agreements (gains from trade beyond commodities)
    for (const [key, rel] of Object.entries(state.diplomacy.relations)) {
      if (!rel.treaties.trade) continue;
      const [a, b] = key.split('|');
      if (state.countries[a]) state.countries[a].trade.agreements++;
      if (state.countries[b]) state.countries[b].trade.agreements++;
    }
    for (const c of countries) c.trade.gainFactor = 1 + getMod(c, 'tradeGain');
  },
};
