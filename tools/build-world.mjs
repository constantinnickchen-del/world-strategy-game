#!/usr/bin/env node
/**
 * Builds the static world data modules from Natural Earth (public domain).
 *
 *   node tools/build-world.mjs [--cache-dir dir]
 *
 * Sources (downloaded into tools/.cache/ when missing):
 *   ne_50m_admin_0_countries          countries, sovereignty, base population/GDP (2019)
 *   ne_10m_admin_1_states_provinces   provinces (states, oblasts, departments …)
 *   ne_10m_populated_places_simple    cities (population distribution, capitals)
 *
 * Pipeline:
 *   1. territories (admin-0 features) and their owners
 *   2. provinces → territories, quantised to 0.01°, consistent ring orientation
 *   3. province population estimated from cities (+ area share for rural population)
 *   4. provinces clustered into playable regions (contiguous region growing,
 *      count depends on territory size and population)
 *   5. regions dissolved by edge cancellation (exact shared borders)
 *   6. topology: rings split into shared arcs (left/right region), arcs
 *      simplified once → no gaps between regions, and the renderer can draw
 *      country borders dynamically from current region ownership
 *   7. adjacency (shared edges + proximity), coast detection, terrain, cities
 *
 * Outputs (plain ES modules, identical in browser and Node):
 *   src/data/generated/world.js     – countries + regions (used by the simulation)
 *   src/data/generated/geometry.js  – arcs + region rings (used only by the map)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const SOURCES = {
  admin0: 'ne_50m_admin_0_countries.geojson',
  admin1: 'ne_10m_admin_1_states_provinces.geojson',
  cities: 'ne_10m_populated_places_simple.geojson',
};

const Q = 100; // quantisation: 1 unit = 0.01°
const SIMPLIFY = 3; // Douglas-Peucker tolerance in units (0.03°)
const MIN_ISLAND_AREA = 4; // square units (0.0004 deg²) – smaller coastal-only rings are dropped
const MAX_REGIONS_PER_TERRITORY = 26;

const DROP = new Set(['ATA', 'KAS', 'HMD', 'ATC', 'ATF', 'SGS']);
const OWNER_OVERRIDE = { SOL: 'SOM', CYN: 'CYP', PSX: null };

// ---------------------------------------------------------------- loading
async function load(name, cacheDir) {
  const file = path.join(cacheDir, name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log('Downloading', name);
    const res = await fetch(BASE_URL + name);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return -a / 2; // positive = counter-clockwise
}

function quantRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [Math.round(x * Q), Math.round(y * Q)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out.length >= 3 ? out : null;
}

/** Quantised rings with outer rings CCW and holes CW (needed for edge cancellation). */
function quantGeometry(geometry) {
  const rings = [];
  for (const poly of polygonsOf(geometry)) {
    poly.forEach((ring, i) => {
      let q = quantRing(ring);
      if (!q) return;
      const a = signedArea(q);
      if (a === 0) return;
      if ((i === 0 && a < 0) || (i > 0 && a > 0)) q = q.reverse();
      rings.push(q);
    });
  }
  return rings;
}

function ringKmArea(ring) {
  // ring in quantised units; approximate km² using mean latitude
  const a = Math.abs(signedArea(ring)) / (Q * Q);
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length / Q;
  return a * 111.32 * 111.32 * Math.cos((lat * Math.PI) / 180);
}

function pointInRings(x, y, rings) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function bboxOf(rings) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
}

function centroidOf(rings) {
  // area-weighted centroid of the largest ring (good enough for labels/distances)
  let best = rings[0];
  for (const r of rings) if (Math.abs(signedArea(r)) > Math.abs(signedArea(best))) best = r;
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const f = best[j][0] * best[i][1] - best[i][0] * best[j][1];
    cx += (best[j][0] + best[i][0]) * f;
    cy += (best[j][1] + best[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return [best[0][0], best[0][1]];
  const c = [cx / (3 * a), cy / (3 * a)];
  // Make sure the label point lies inside the ring; otherwise fall back to a vertex-average inside point.
  if (pointInRings(c[0], c[1], [best])) return c;
  const bb = bboxOf([best]);
  const midY = (bb[1] + bb[3]) / 2;
  const xs = [];
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const [xi, yi] = best[i];
    const [xj, yj] = best[j];
    if (yi > midY !== yj > midY) xs.push(((xj - xi) * (midY - yi)) / (yj - yi) + xi);
  }
  xs.sort((p, q) => p - q);
  if (xs.length >= 2) return [(xs[0] + xs[1]) / 2, midY];
  return c;
}

const distKm = (a, b) => {
  const lat = ((a[1] + b[1]) / 2 / Q) * (Math.PI / 180);
  const dx = ((a[0] - b[0]) / Q) * 111.32 * Math.cos(lat);
  const dy = ((a[1] - b[1]) / Q) * 111.32;
  return Math.hypot(dx, dy);
};

// ---------------------------------------------------------------- simplification
function perp(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplifyLine(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perp(pts[i], pts[s], pts[e]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx > 0 && max > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------- terrain
const DESERT_SUBREGIONS = new Set(['Northern Africa', 'Western Asia', 'Central Asia']);
const JUNGLE_SUBREGIONS = new Set(['Middle Africa', 'South-Eastern Asia', 'South America', 'Central America', 'Melanesia']);
const MOUNTAIN_TERRITORIES = new Set(['CHE', 'AUT', 'NPL', 'BTN', 'AFG', 'TJK', 'KGZ', 'AND', 'LIE', 'ARM', 'GEO', 'LSO', 'MNE', 'BOL']);
const MOUNTAIN_PROVINCES = new Set([
  'CN-XZ', 'CN-QH', 'CN-SC', 'CN-YN', 'US-CO', 'US-UT', 'US-WY', 'US-MT', 'US-ID', 'CA-BC', 'IT-23', 'IT-32', 'FR-ARA', 'FR-74', 'FR-73',
  'IN-JK', 'IN-HP', 'IN-UT', 'PK-GB', 'PK-KP', 'PE-CUS', 'PE-PUN', 'CL-AP', 'AR-JU', 'IR-07', 'TR-30', 'RU-KB', 'RU-CE', 'RU-DA', 'RU-SE',
  'ES-HU', 'NO-46', 'KZ-ALM', 'MX-CHH', 'ET-AM', 'ET-TI', 'MA-MAR', 'DZ-11', 'IQ-DA', 'IQ-AR', 'YE-SA', 'SA-14',
]);

function terrainOf({ lat, density, subregion, territory, codes }) {
  const alat = Math.abs(lat);
  if (density > 450) return 'urban';
  if (alat > 62) return 'arctic';
  if (MOUNTAIN_TERRITORIES.has(territory) || codes.some((c) => MOUNTAIN_PROVINCES.has(c))) return 'mountains';
  if ((DESERT_SUBREGIONS.has(subregion) && density < 60) || (territory === 'AUS' && density < 2) || (territory === 'MNG' && lat < 46)) return 'desert';
  if (alat < 15 && JUNGLE_SUBREGIONS.has(subregion) && density < 200) return 'jungle';
  if (alat > 48 && density < 40) return 'forest';
  return 'plains';
}

// ---------------------------------------------------------------- main
async function main() {
  const cacheArg = process.argv.indexOf('--cache-dir');
  const cacheDir = cacheArg > 0 ? process.argv[cacheArg + 1] : path.join(ROOT, 'tools/.cache');
  const [admin0, admin1, citiesGeo] = await Promise.all([load(SOURCES.admin0, cacheDir), load(SOURCES.admin1, cacheDir), load(SOURCES.cities, cacheDir)]);

  // 1. territories & owners ------------------------------------------------
  const territoryFeatures = admin0.features.filter((f) => !DROP.has(f.properties.ADM0_A3));
  const groups = new Map();
  for (const f of territoryFeatures) {
    const p = f.properties;
    let sov = p.SOV_A3;
    if (p.ADM0_A3 in OWNER_OVERRIDE) sov = OWNER_OVERRIDE[p.ADM0_A3] ? `@${OWNER_OVERRIDE[p.ADM0_A3]}` : `#${p.ADM0_A3}`;
    if (!groups.has(sov)) groups.set(sov, []);
    groups.get(sov).push(f);
  }
  const ownerOf = new Map();
  const homeFeature = new Map();
  for (const [sov, fs_] of groups) {
    if (sov.startsWith('@')) continue;
    const score = (f) => (f.properties.HOMEPART === 1 ? 1e12 : 0) + f.properties.POP_EST;
    const home = fs_.reduce((best, f) => (score(f) > score(best) ? f : best));
    homeFeature.set(home.properties.ADM0_A3, home);
    for (const f of fs_) ownerOf.set(f.properties.ADM0_A3, home.properties.ADM0_A3);
  }
  for (const [sov, fs_] of groups) if (sov.startsWith('@')) for (const f of fs_) ownerOf.set(f.properties.ADM0_A3, sov.slice(1));
  const territories = new Map(territoryFeatures.map((f) => [f.properties.ADM0_A3, f.properties]));
  const territoryGeom = new Map(territoryFeatures.map((f) => [f.properties.ADM0_A3, f.geometry]));

  // 2. provinces --------------------------------------------------------------
  const provinces = [];
  let dropped = 0;
  for (const f of admin1.features) {
    const p = f.properties;
    const terr = [p.adm0_a3, p.gu_a3, p.sov_a3].find((c) => territories.has(c));
    if (!terr) {
      dropped++;
      continue;
    }
    const rings = quantGeometry(f.geometry);
    if (!rings.length) continue;
    const code = p.iso_3166_2 && !p.iso_3166_2.endsWith('-') && !p.iso_3166_2.includes('~') ? p.iso_3166_2 : p.adm1_code;
    provinces.push({
      idx: provinces.length,
      territory: terr,
      code,
      adm1: p.adm1_code,
      name: (p.name_de || p.name || p.name_en || code).replace(/^(Département|Departamento|Provinz|Province of|Region) /, ''),
      rings,
      bbox: bboxOf(rings),
      areaKm: rings.reduce((s, r) => s + Math.sign(signedArea(r)) * ringKmArea(r), 0),
      cityPop: 0,
      cities: [],
    });
  }
  // territories without province data use their admin-0 geometry as a single province
  const provTerritories = new Set(provinces.map((p) => p.territory));
  for (const [terr, props] of territories) {
    if (provTerritories.has(terr)) continue;
    const rings = quantGeometry(territoryGeom.get(terr));
    if (!rings.length) continue;
    provinces.push({
      idx: provinces.length,
      territory: terr,
      code: terr,
      adm1: terr,
      name: props.NAME_DE || props.NAME,
      rings,
      bbox: bboxOf(rings),
      areaKm: rings.reduce((s, r) => s + Math.sign(signedArea(r)) * ringKmArea(r), 0),
      cityPop: 0,
      cities: [],
    });
  }
  // unique codes
  const seen = new Set();
  for (const p of provinces) {
    if (seen.has(p.code)) p.code = p.adm1;
    if (seen.has(p.code)) p.code = `${p.adm1}-${p.idx}`;
    seen.add(p.code);
  }
  console.log(`provinces=${provinces.length} (dropped ${dropped} without territory)`);

  // 3. cities → provinces ---------------------------------------------------------
  const capitals = new Map(); // territory -> province idx
  const byTerritory = new Map();
  for (const p of provinces) {
    if (!byTerritory.has(p.territory)) byTerritory.set(p.territory, []);
    byTerritory.get(p.territory).push(p);
  }
  for (const f of citiesGeo.features) {
    const c = f.properties;
    const x = Math.round(c.longitude * Q);
    const y = Math.round(c.latitude * Q);
    const cands = [...(byTerritory.get(c.adm0_a3) ?? []), ...provinces.filter((p) => p.territory !== c.adm0_a3)];
    let hit = null;
    for (const p of cands) {
      if (x < p.bbox[0] || x > p.bbox[2] || y < p.bbox[1] || y > p.bbox[3]) continue;
      if (pointInRings(x, y, p.rings)) {
        hit = p;
        break;
      }
    }
    if (!hit) continue;
    const pop = Math.max(0, c.pop_max || 0);
    hit.cityPop += pop;
    hit.cities.push([c.name, pop]);
    if (c.featurecla === 'Admin-0 capital' && ownerOf.get(hit.territory) === hit.territory) {
      const prev = capitals.get(hit.territory);
      if (!prev || pop > prev.pop) capitals.set(hit.territory, { idx: hit.idx, pop });
    }
  }

  // province population estimate
  for (const [terr, provs] of byTerritory) {
    const tp = territories.get(terr);
    const pop = Math.max(0, tp.POP_EST);
    const totalCity = provs.reduce((s, p) => s + p.cityPop, 0);
    // rural population: grows sub-linearly with area and is low in cold climates
    const rural = (p) => {
      const lat = Math.abs((p.bbox[1] + p.bbox[3]) / 2 / Q);
      const climate = lat > 62 ? 0.12 : lat > 56 ? 0.45 : 1;
      return Math.sqrt(Math.max(1, p.areaKm)) * climate;
    };
    const totalArea = provs.reduce((s, p) => s + rural(p), 0);
    for (const p of provs) {
      const cityShare = totalCity > 0 ? p.cityPop / totalCity : 0;
      const areaShare = rural(p) / totalArea;
      p.pop = pop * (totalCity > 0 ? 0.65 * cityShare + 0.35 * areaShare : areaShare);
      p.econ = totalCity > 0 ? 0.45 * (p.pop / Math.max(1, pop)) + 0.55 * cityShare : areaShare;
      p.cities.sort((a, b) => b[1] - a[1]);
    }
  }

  // 4. province adjacency (exact shared vertices + 1-unit neighbourhood) -----------------
  const pointOwners = new Map();
  const key = (x, y) => x * 40000 + y; // x in [-18000, 18000], y in [-9000, 9000] → unique numeric key
  for (const p of provinces) {
    for (const r of p.rings) for (const [x, y] of r) {
      const k = key(x, y);
      let s = pointOwners.get(k);
      if (!s) pointOwners.set(k, (s = []));
      if (s[s.length - 1] !== p.idx) s.push(p.idx);
    }
  }
  const provAdj = provinces.map(() => new Set());
  for (const [k, owners] of pointOwners) {
    const x = Math.round(k / 40000);
    const y = k - x * 40000;
    const near = new Set(owners);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      for (const o of pointOwners.get(key(x + dx, y + dy)) ?? []) near.add(o);
    }
    const arr = [...near];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      provAdj[arr[i]].add(arr[j]);
      provAdj[arr[j]].add(arr[i]);
    }
  }

  // 5. clustering provinces into regions -------------------------------------------------
  const regionsOut = []; // {territory, provinces:[idx]}
  for (const [terr, provs] of byTerritory) {
    const tp = territories.get(terr);
    const areaKm = provs.reduce((s, p) => s + Math.max(0, p.areaKm), 0);
    const popM = Math.max(0, tp.POP_EST) / 1e6;
    let n = Math.round(Math.sqrt(areaKm) / 190 + Math.sqrt(popM) / 2.6);
    n = Math.max(1, Math.min(MAX_REGIONS_PER_TERRITORY, n, provs.length));
    const totalArea = Math.max(1, areaKm);
    const totalPop = Math.max(1, provs.reduce((s, p) => s + p.pop, 0));
    const weight = (p) => 0.5 * (Math.max(0, p.areaKm) / totalArea) + 0.5 * (p.pop / totalPop);
    const inTerr = new Set(provs.map((p) => p.idx));
    // connected components inside the territory
    const comp = new Map();
    const comps = [];
    for (const p of provs) {
      if (comp.has(p.idx)) continue;
      const list = [];
      const stack = [p.idx];
      comp.set(p.idx, comps.length);
      while (stack.length) {
        const i = stack.pop();
        list.push(i);
        for (const j of provAdj[i]) if (inTerr.has(j) && !comp.has(j)) {
          comp.set(j, comps.length);
          stack.push(j);
        }
      }
      comps.push({ members: list, weight: list.reduce((s, i) => s + weight(provinces[i]), 0) });
    }
    comps.sort((a, b) => b.weight - a.weight);
    // significant components get their own regions, small ones are attached later
    const significant = comps.filter((c, i) => i === 0 || c.weight > 0.025).slice(0, n);
    const minor = comps.filter((c) => !significant.includes(c));
    let remaining = n;
    const sigWeight = significant.reduce((s, c) => s + c.weight, 0);
    significant.forEach((c, i) => {
      const left = significant.length - i;
      c.k = i === significant.length - 1 ? Math.max(1, remaining) : Math.max(1, Math.min(remaining - (left - 1), Math.round((n * c.weight) / sigWeight)));
      c.k = Math.min(c.k, c.members.length);
      remaining -= c.k;
    });
    const terrRegions = [];
    for (const c of significant) {
      const members = c.members.map((i) => provinces[i]);
      const cen = new Map(members.map((p) => [p.idx, centroidOf(p.rings)]));
      // farthest-point seeds, starting with the heaviest province
      const seeds = [members.reduce((b, p) => (weight(p) > weight(b) ? p : b)).idx];
      while (seeds.length < c.k) {
        let best = null;
        let bestD = -1;
        for (const p of members) {
          if (seeds.includes(p.idx)) continue;
          const d = Math.min(...seeds.map((s) => distKm(cen.get(s), cen.get(p.idx)))) * (0.5 + Math.sqrt(weight(p) * 10));
          if (d > bestD) {
            bestD = d;
            best = p.idx;
          }
        }
        seeds.push(best);
      }
      const assign = new Map(seeds.map((s, i) => [s, i]));
      const w = seeds.map((s) => weight(provinces[s]));
      const target = c.weight / c.k;
      let progress = true;
      while (assign.size < members.length && progress) {
        progress = false;
        // grow the lightest cluster that still has unassigned neighbours
        const order = w.map((v, i) => i).sort((a, b) => w[a] - w[b]);
        for (const ci of order) {
          let best = null;
          let bestD = Infinity;
          for (const [pi, cj] of assign) {
            if (cj !== ci) continue;
            for (const q of provAdj[pi]) {
              if (!inTerr.has(q) || assign.has(q) || comp.get(q) !== comp.get(pi)) continue;
              const d = distKm(cen.get(seeds[ci]), cen.get(q));
              if (d < bestD) {
                bestD = d;
                best = q;
              }
            }
          }
          if (best !== null && (w[ci] < target * 1.6 || order.indexOf(ci) === order.length - 1 || true)) {
            assign.set(best, ci);
            w[ci] += weight(provinces[best]);
            progress = true;
            break;
          }
        }
      }
      const clusters = seeds.map(() => []);
      for (const [pi, ci] of assign) clusters[ci].push(pi);
      for (const cl of clusters) if (cl.length) terrRegions.push({ territory: terr, provinces: cl });
    }
    // attach minor components (small islands, exclaves) to the nearest region
    for (const c of minor) {
      const cc = centroidOf(provinces[c.members[0]].rings);
      let best = terrRegions[0];
      let bestD = Infinity;
      for (const r of terrRegions) {
        for (const pi of r.provinces) {
          const d = distKm(cc, centroidOf(provinces[pi].rings));
          if (d < bestD) {
            bestD = d;
            best = r;
          }
        }
      }
      best.provinces.push(...c.members);
    }
    regionsOut.push(...terrRegions);
  }
  console.log(`regions=${regionsOut.length}`);

  // 6. dissolve regions (edge cancellation) ------------------------------------------------
  const edgeKey = (a, b) => `${a[0]},${a[1]}>${b[0]},${b[1]}`;
  let openWalks = 0;
  const regionRings = regionsOut.map((reg) => {
    // Edges are counted with multiplicity: overlapping source polygons (e.g. an
    // enclave province drawn on top of its neighbour) contribute the same edge
    // twice, and losing one of them would leave an open chain that the renderer
    // closes with a straight line across the region.
    const edges = new Map(); // key -> { a, b, n }
    for (const pi of reg.provinces) {
      for (const r of provinces[pi].rings) {
        for (let i = 0; i < r.length; i++) {
          const a = r[i];
          const b = r[(i + 1) % r.length];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          const rev = edges.get(edgeKey(b, a));
          if (rev && rev.n > 0) {
            rev.n--;
            continue;
          }
          const k = edgeKey(a, b);
          const e = edges.get(k);
          if (e) e.n++;
          else edges.set(k, { a, b, n: 1 });
        }
      }
    }
    // chain remaining edges into rings
    const out = new Map();
    for (const { a, b, n } of edges.values()) {
      const k = `${a[0]},${a[1]}`;
      if (!out.has(k)) out.set(k, []);
      for (let i = 0; i < n; i++) out.get(k).push(b);
    }
    const rings = [];
    for (const [startKey, list] of out) {
      while (list.length) {
        const ring = [startKey.split(',').map(Number)];
        let cur = list.pop();
        let guard = 0;
        let closed = false;
        while (guard++ < 2e6) {
          const k = `${cur[0]},${cur[1]}`;
          if (k === startKey) {
            closed = true;
            break;
          }
          ring.push(cur);
          const nexts = out.get(k);
          if (!nexts || !nexts.length) break;
          cur = nexts.pop();
        }
        if (!closed) {
          openWalks++;
          continue; // an open chain is a data defect – never draw it as a ring
        }
        if (ring.length >= 3) rings.push(ring);
      }
    }
    return rings;
  });
  console.log('open boundary walks dropped:', openWalks);

  // 7. topology: arcs -------------------------------------------------------------------------
  const edgeRegion = new Map();
  regionRings.forEach((rings, ri) => {
    for (const r of rings) for (let i = 0; i < r.length; i++) edgeRegion.set(edgeKey(r[i], r[(i + 1) % r.length]), ri);
  });
  const arcs = []; // {points, left, right}
  const arcIndex = new Map();
  const ptKey = (p) => `${p[0]},${p[1]}`;
  const regionArcRings = regionRings.map((rings, ri) =>
    rings.map((ring) => {
      const n = ring.length;
      const other = ring.map((p, i) => edgeRegion.get(edgeKey(ring[(i + 1) % n], p)) ?? -1);
      // rotate so that the ring starts at a neighbour change (or at the smallest point for single-neighbour rings)
      let start = other.findIndex((o, i) => o !== other[(i - 1 + n) % n]);
      if (start < 0) {
        start = 0;
        for (let i = 1; i < n; i++) if (ring[i][0] < ring[start][0] || (ring[i][0] === ring[start][0] && ring[i][1] < ring[start][1])) start = i;
      }
      const refs = [];
      let i = 0;
      while (i < n) {
        const o = other[(start + i) % n];
        const pts = [ring[(start + i) % n]];
        let j = i;
        while (j < n && other[(start + j) % n] === o) {
          pts.push(ring[(start + j + 1) % n]);
          j++;
        }
        i = j;
        // canonical orientation: from the perspective of the smaller region index
        const forward = o === -1 || ri < o;
        const canon = forward ? pts : [...pts].reverse();
        const lo = forward ? ri : o;
        const hi = forward ? o : ri;
        const closed = ptKey(canon[0]) === ptKey(canon.at(-1));
        let k;
        if (closed && o !== -1) {
          // full-ring shared border (enclave): orientation-independent key
          const sorted = canon.slice(0, -1).map(ptKey).sort();
          k = `${lo}|${hi}|ring|${sorted[0]}|${canon.length}`;
        } else {
          k = `${lo}|${hi}|${ptKey(canon[0])}|${ptKey(canon.at(-1))}|${canon.length}`;
        }
        let ai = o === -1 ? undefined : arcIndex.get(k);
        if (ai === undefined) {
          ai = arcs.length;
          arcs.push({ points: canon, left: lo, right: hi });
          if (o !== -1) arcIndex.set(k, ai);
          refs.push(forward ? ai : ~ai);
        } else {
          // existing arc: was it created in the same orientation as this ring traverses it?
          const a = arcs[ai];
          const sameDir = ptKey(a.points[0]) === ptKey(pts[0]) && ptKey(a.points[1]) === ptKey(pts[1]);
          refs.push(sameDir ? ai : ~ai);
        }
      }
      return refs;
    }),
  );
  // simplify arcs once (shared arcs stay identical for both regions)
  for (const a of arcs) {
    const closed = ptKey(a.points[0]) === ptKey(a.points.at(-1));
    if (closed && a.points.length > 4) {
      // split closed rings in two halves so DP keeps a valid shape
      const mid = Math.floor(a.points.length / 2);
      const s1 = simplifyLine(a.points.slice(0, mid + 1), SIMPLIFY);
      const s2 = simplifyLine(a.points.slice(mid), SIMPLIFY);
      a.points = [...s1, ...s2.slice(1)];
    } else {
      a.points = simplifyLine(a.points, SIMPLIFY);
    }
  }
  const ringPoints = (refs, arcList = arcs) => {
    const pts = [];
    for (const r of refs) {
      const a = arcList[r < 0 ? ~r : r].points;
      const seq = r < 0 ? [...a].reverse() : a;
      pts.push(...(pts.length ? seq.slice(1) : seq));
    }
    return pts;
  };
  // drop tiny coast-only rings (small islands) unless they are the region's only ring
  const usedArcs = new Set();
  regionArcRings.forEach((rings, ri) => {
    const scored = rings.map((refs) => ({ refs, area: Math.abs(signedArea(ringPoints(refs))), coastOnly: refs.every((r) => arcs[r < 0 ? ~r : r].right === -1) }));
    const largest = scored.reduce((b, s) => (s.area > b.area ? s : b), scored[0]);
    regionArcRings[ri] = scored.filter((s) => s === largest || !(s.coastOnly && s.area < MIN_ISLAND_AREA) && s.area > 0.5).map((s) => s.refs);
    for (const refs of regionArcRings[ri]) for (const r of refs) usedArcs.add(r < 0 ? ~r : r);
  });
  // compact arc list
  const remap = new Map();
  const finalArcs = [];
  [...usedArcs].sort((a, b) => a - b).forEach((ai) => {
    remap.set(ai, finalArcs.length);
    finalArcs.push(arcs[ai]);
  });
  const finalRings = regionArcRings.map((rings) => rings.map((refs) => refs.map((r) => (r < 0 ? ~remap.get(~r) : remap.get(r)))));

  // 8. region adjacency, coast, attributes ---------------------------------------------------
  const provRegion = new Map();
  regionsOut.forEach((reg, ri) => reg.provinces.forEach((pi) => provRegion.set(pi, ri)));
  const regAdj = regionsOut.map(() => new Set());
  provinces.forEach((p) => {
    const ri = provRegion.get(p.idx);
    if (ri === undefined) return;
    for (const q of provAdj[p.idx]) {
      const rj = provRegion.get(q);
      if (rj !== undefined && rj !== ri) {
        regAdj[ri].add(rj);
        regAdj[rj].add(ri);
      }
    }
  });
  // coast: a coast arc (right = -1) whose midpoint is not touching another region's vertices
  const coastal = regionsOut.map(() => false);
  for (const a of arcs) {
    if (a.right !== -1 || a.points.length < 2) continue;
    const mid = a.points[Math.floor(a.points.length / 2)];
    const owners = new Set();
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (const o of pointOwners.get(key(mid[0] + dx, mid[1] + dy)) ?? []) owners.add(provRegion.get(o));
    owners.delete(a.left);
    if (owners.size === 0) coastal[a.left] = true;
  }

  const regionIds = [];
  const REGIONS = regionsOut.map((reg, ri) => {
    const provs = reg.provinces.map((i) => provinces[i]).sort((a, b) => b.pop - a.pop);
    const tp = territories.get(reg.territory);
    const id = provs[0].code;
    regionIds.push(id);
    const pop = provs.reduce((s, p) => s + p.pop, 0);
    const areaKm = provs.reduce((s, p) => s + Math.max(0, p.areaKm), 0);
    const rings = finalRings[ri].map((refs) => ringPoints(refs, finalArcs));
    const label = centroidOf(rings.length ? rings : provs[0].rings);
    const cities = provs.flatMap((p) => p.cities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => [n, Math.round(v)]);
    const codes = provs.map((p) => p.code);
    const name = provs.length > 1 && provs[0].pop < pop * 0.35 && provs[1] ? `${provs[0].name} & ${provs[1].name}` : provs[0].name;
    return {
      id,
      name,
      territory: reg.territory,
      owner: ownerOf.get(reg.territory),
      population: Math.round(pop),
      gdp: Math.round(Math.max(0, tp.GDP_MD) * provs.reduce((s, p) => s + p.econ, 0)), // million USD
      areaKm: Math.round(areaKm),
      label: [Math.round(label[0]) / Q, Math.round(label[1]) / Q],
      coastal: coastal[ri],
      terrain: terrainOf({ lat: label[1] / Q, density: pop / Math.max(1, areaKm), subregion: tp.SUBREGION, territory: reg.territory, codes }),
      cities,
      provinces: codes,
      continent: tp.CONTINENT,
      subregion: tp.SUBREGION,
    };
  });
  REGIONS.forEach((r, ri) => {
    r.neighbors = [...regAdj[ri]].map((j) => regionIds[j]).sort();
  });

  // 9. countries ---------------------------------------------------------------------------------
  const INCOME = { '1. High income: OECD': 1, '2. High income: nonOECD': 2, '3. Upper middle income': 3, '4. Lower middle income': 4, '5. Low income': 5 };
  const COUNTRIES = [];
  for (const [id, home] of homeFeature) {
    const p = home.properties;
    const own = REGIONS.filter((r) => r.owner === id);
    if (!own.length) continue;
    const homeRegions = own.filter((r) => r.territory === id);
    const capIdx = capitals.get(id);
    const capital = capIdx ? REGIONS[provRegion.get(capIdx.idx)] : null;
    const capitalRegion = capital && capital.owner === id ? capital.id : (homeRegions[0] ?? own[0]).id;
    COUNTRIES.push({
      id,
      name: p.NAME_DE || p.NAME,
      nameEn: p.NAME,
      formalName: p.FORMAL_EN || p.NAME_LONG,
      iso2: p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2 !== '-99' ? p.ISO_A2 : '',
      continent: p.CONTINENT,
      subregion: p.SUBREGION,
      income: INCOME[p.INCOME_GRP] ?? 4,
      mapColor: p.MAPCOLOR13 > 0 ? p.MAPCOLOR13 : p.MAPCOLOR9,
      capitalRegion,
      regions: own.map((r) => r.id),
    });
  }
  COUNTRIES.sort((a, b) => a.id.localeCompare(b.id));
  const order = REGIONS.map((r, i) => i).sort((a, b) => REGIONS[a].id.localeCompare(REGIONS[b].id));

  // 10. write ----------------------------------------------------------------------------------
  const deltaEncode = (pts) => {
    const out = [];
    let px = 0;
    let py = 0;
    pts.forEach(([x, y], i) => {
      out.push(i ? x - px : x, i ? y - py : y);
      px = x;
      py = y;
    });
    return out;
  };
  const header = '// GENERATED by tools/build-world.mjs from Natural Earth (public domain): admin-0 1:50m, admin-1 1:10m, populated places.\n// Do not edit by hand – edit the build script or the scenario data instead.\n';
  const outDir = path.join(ROOT, 'src/data/generated');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'world.js'),
    `${header}export const SOURCE_YEAR = 2019;\nexport const COUNTRIES = ${JSON.stringify(COUNTRIES)};\nexport const REGIONS = ${JSON.stringify(order.map((i) => REGIONS[i]))};\n`,
  );
  const vertexCount = finalArcs.reduce((s, a) => s + a.points.length, 0);
  fs.writeFileSync(
    path.join(outDir, 'geometry.js'),
    `${header}// Topology: ARCS are delta-encoded integer polylines (lon/lat * ${Q}); ARC_SIDES[i] = [leftRegionIndex, rightRegionIndex|-1].\n` +
      `// REGION_RINGS[regionId] = rings as lists of arc indices (negative ~i = arc reversed). Decode with src/map/geometry.js.\n` +
      `export const QUANT = ${Q};\nexport const REGION_ORDER = ${JSON.stringify(regionIds)};\n` +
      `export const ARCS = ${JSON.stringify(finalArcs.map((a) => deltaEncode(a.points)))};\n` +
      `export const ARC_SIDES = ${JSON.stringify(finalArcs.map((a) => [a.left, a.right]))};\n` +
      `export const REGION_RINGS = ${JSON.stringify(Object.fromEntries(regionIds.map((id, i) => [id, finalRings[i]])))};\n`,
  );
  const size = (f) => `${Math.round(fs.statSync(path.join(outDir, f)).size / 1024)} KB`;
  console.log(`countries=${COUNTRIES.length} regions=${REGIONS.length} arcs=${finalArcs.length} vertices=${vertexCount} world.js=${size('world.js')} geometry.js=${size('geometry.js')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
