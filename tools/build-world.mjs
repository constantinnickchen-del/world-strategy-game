#!/usr/bin/env node
/**
 * Builds the static world data modules from Natural Earth (public domain).
 *
 *   node tools/build-world.mjs [path/to/ne_50m_admin_0_countries.geojson]
 *
 * Without an argument the source file is downloaded into tools/.cache/.
 *
 * Outputs (both are plain ES modules so they load identically in the browser
 * and in Node tests, without fetch/fs differences):
 *   src/data/generated/world.js     – regions + base country data + adjacency (used by the simulation)
 *   src/data/generated/geometry.js  – delta encoded polygon rings (used only by the map renderer)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

const QUANT = 100; // coordinates stored as integer hundredths of a degree
const SIMPLIFY_TOLERANCE = 0.035; // degrees (Douglas-Peucker)
const MIN_RING_AREA = 0.02; // square degrees; smaller islands are dropped (unless the region would vanish)
const ADJ_DISTANCE = 0.08; // degrees: vertices closer than this count as a shared land border

// Features that are dropped entirely.
const DROP = new Set(['ATA', 'KAS', 'HMD', 'ATC', 'ATF', 'SGS']);
// Sovereignty overrides: ADM0_A3 -> owning country id (null = becomes its own country).
const OWNER_OVERRIDE = {
  SOL: 'SOM', // Somaliland -> Somalia
  CYN: 'CYP', // Northern Cyprus -> Cyprus
  PSX: null, // Palestine is its own country
};

async function loadSource() {
  const arg = process.argv[2];
  if (arg) return JSON.parse(fs.readFileSync(arg, 'utf8'));
  const cacheFile = path.join(ROOT, 'tools/.cache/ne_50m_admin_0_countries.geojson');
  if (!fs.existsSync(cacheFile)) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    console.log('Downloading', SOURCE_URL);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    fs.writeFileSync(cacheFile, await res.text());
  }
  return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
}

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points, tol) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function encodeRing(ring) {
  // Closed rings: drop the duplicated closing point, quantize, remove consecutive duplicates, delta encode.
  const pts = ring.slice(0, -1).map(([x, y]) => [Math.round(x * QUANT), Math.round(y * QUANT)]);
  const out = [];
  let px = 0;
  let py = 0;
  let first = true;
  for (const [x, y] of pts) {
    if (!first && x === px && y === py) continue;
    out.push(first ? x : x - px, first ? y : y - py);
    px = x;
    py = y;
    first = false;
  }
  return out;
}

function computeAdjacency(regionPolys) {
  // Spatial hash of all original vertices; regions sharing nearby vertices are land neighbours.
  const cell = ADJ_DISTANCE;
  const grid = new Map();
  const key = (cx, cy) => cx * 100000 + cy;
  regionPolys.forEach((polys, ri) => {
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          const k = key(Math.floor(x / cell), Math.floor(y / cell));
          let bucket = grid.get(k);
          if (!bucket) grid.set(k, (bucket = []));
          bucket.push(ri, x, y);
        }
      }
    }
  });
  const pairs = new Set();
  for (const [k, bucket] of grid) {
    const cx = Math.floor(k / 100000);
    const cy = k - cx * 100000;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const other = grid.get(key(cx + dx, cy + dy));
        if (!other) continue;
        for (let i = 0; i < bucket.length; i += 3) {
          for (let j = 0; j < other.length; j += 3) {
            const a = bucket[i];
            const b = other[j];
            if (a >= b) continue;
            if (Math.hypot(bucket[i + 1] - other[j + 1], bucket[i + 2] - other[j + 2]) <= ADJ_DISTANCE) {
              pairs.add(`${a}|${b}`);
            }
          }
        }
      }
    }
  }
  const adj = regionPolys.map(() => []);
  for (const p of pairs) {
    const [a, b] = p.split('|').map(Number);
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

const INCOME = {
  '1. High income: OECD': 1,
  '2. High income: nonOECD': 2,
  '3. Upper middle income': 3,
  '4. Lower middle income': 4,
  '5. Low income': 5,
};

async function main() {
  const src = await loadSource();
  const features = src.features.filter((f) => !DROP.has(f.properties.ADM0_A3));

  // Resolve owner country for every feature.
  const groups = new Map();
  for (const f of features) {
    const p = f.properties;
    let sov = p.SOV_A3;
    if (p.ADM0_A3 in OWNER_OVERRIDE) sov = OWNER_OVERRIDE[p.ADM0_A3] ? `@${OWNER_OVERRIDE[p.ADM0_A3]}` : `#${p.ADM0_A3}`;
    if (!groups.has(sov)) groups.set(sov, []);
    groups.get(sov).push(f);
  }
  const ownerOf = new Map(); // feature -> country id
  const homeFeature = new Map(); // country id -> feature
  for (const [sov, fs_] of groups) {
    if (sov.startsWith('@')) continue;
    const home = fs_.reduce((best, f) => {
      const score = (f.properties.HOMEPART === 1 ? 1e12 : 0) + f.properties.POP_EST;
      const bestScore = (best.properties.HOMEPART === 1 ? 1e12 : 0) + best.properties.POP_EST;
      return score > bestScore ? f : best;
    });
    const id = home.properties.ADM0_A3;
    homeFeature.set(id, home);
    for (const f of fs_) ownerOf.set(f, id);
  }
  for (const [sov, fs_] of groups) {
    if (sov.startsWith('@')) for (const f of fs_) ownerOf.set(f, sov.slice(1));
  }

  const regions = [];
  const regionPolys = [];
  const geometry = {};
  let vertexCount = 0;
  for (const f of features) {
    const p = f.properties;
    const polys = polygonsOf(f.geometry);
    // Simplify + filter rings.
    const kept = [];
    let largest = null;
    let largestArea = -1;
    let totalArea = 0;
    for (const poly of polys) {
      const outerArea = ringArea(poly[0]);
      totalArea += outerArea;
      const simpPoly = poly.map((r) => simplify(r, SIMPLIFY_TOLERANCE)).filter((r) => r.length >= 4);
      if (!simpPoly.length) continue;
      if (outerArea > largestArea) {
        largestArea = outerArea;
        largest = simpPoly;
      }
      if (outerArea >= MIN_RING_AREA) kept.push(simpPoly.filter((r, i) => i === 0 || ringArea(r) >= MIN_RING_AREA));
    }
    if (!kept.length && largest) kept.push([largest[0]]);
    const rings = [];
    for (const poly of kept) {
      // Holes are encoded as additional rings; the renderer uses the even-odd fill rule.
      for (const r of poly) {
        const enc = encodeRing(r);
        vertexCount += enc.length / 2;
        if (enc.length >= 6) rings.push(enc);
      }
    }
    if (!rings.length) continue;
    const id = p.ADM0_A3;
    geometry[id] = rings;
    regionPolys.push(polys);
    regions.push({
      id,
      name: p.NAME_DE || p.NAME,
      nameEn: p.NAME,
      owner: ownerOf.get(f),
      population: Math.max(0, Math.round(p.POP_EST)),
      gdp: Math.max(0, Math.round(p.GDP_MD)), // million USD
      area: Math.round(totalArea * 1000) / 1000, // square degrees (relative size only)
      label: [Math.round(p.LABEL_X * 100) / 100, Math.round(p.LABEL_Y * 100) / 100],
      continent: p.CONTINENT,
      subregion: p.SUBREGION,
    });
  }

  const adjacency = computeAdjacency(regionPolys);
  regions.forEach((r, i) => {
    r.neighbors = adjacency[i].map((j) => regions[j].id).sort();
  });

  const countries = [];
  for (const [id, home] of homeFeature) {
    const p = home.properties;
    const own = regions.filter((r) => r.owner === id);
    if (!own.length) continue;
    countries.push({
      id,
      name: p.NAME_DE || p.NAME,
      nameEn: p.NAME,
      formalName: p.FORMAL_EN || p.NAME_LONG,
      iso2: p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2 !== '-99' ? p.ISO_A2 : '',
      continent: p.CONTINENT,
      subregion: p.SUBREGION,
      income: INCOME[p.INCOME_GRP] ?? 4,
      mapColor: p.MAPCOLOR13 > 0 ? p.MAPCOLOR13 : p.MAPCOLOR9,
      capitalRegion: home.properties.ADM0_A3,
      regions: own.map((r) => r.id),
    });
  }
  countries.sort((a, b) => a.id.localeCompare(b.id));
  regions.sort((a, b) => a.id.localeCompare(b.id));

  const header = `// GENERATED by tools/build-world.mjs from Natural Earth 1:50m Admin 0 Countries (public domain).\n// Do not edit by hand – edit the build script or the scenario data instead.\n`;
  const outDir = path.join(ROOT, 'src/data/generated');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'world.js'),
    `${header}export const SOURCE_YEAR = 2019;\nexport const COUNTRIES = ${JSON.stringify(countries)};\nexport const REGIONS = ${JSON.stringify(regions)};\n`,
  );
  fs.writeFileSync(
    path.join(outDir, 'geometry.js'),
    `${header}// Rings: delta encoded integer coordinates (lon/lat * ${QUANT}). Decode with src/map/geometry.js.\nexport const QUANT = ${QUANT};\nexport const RINGS = ${JSON.stringify(geometry)};\n`,
  );
  console.log(
    `countries=${countries.length} regions=${regions.length} vertices=${vertexCount} ` +
      `world.js=${fs.statSync(path.join(outDir, 'world.js')).size}B geometry.js=${fs.statSync(path.join(outDir, 'geometry.js')).size}B`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
