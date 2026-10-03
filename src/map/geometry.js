/**
 * Map geometry: decoding, projection and hit testing. No DOM access, so it is
 * unit-testable in Node.
 *
 * Projection: Miller cylindrical. World coordinates: x = longitude (-180..180),
 * y = -millerY(latitude) in degree-like units (north is up / negative y).
 */
import { RINGS, QUANT } from '../data/generated/geometry.js';

export const LAT_MIN = -58;
export const LAT_MAX = 84;
const DEG = Math.PI / 180;

export function projectLat(lat) {
  const l = Math.max(LAT_MIN, Math.min(LAT_MAX, lat)) * DEG;
  return -(1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * l))) / DEG;
}

export function project(lon, lat) {
  return [lon, projectLat(lat)];
}

export const WORLD_BOUNDS = { minX: -180, maxX: 180, minY: projectLat(LAT_MAX), maxY: projectLat(LAT_MIN) };

/** Decodes a delta-encoded integer ring into projected Float32 coordinates [x0,y0,x1,y1,...]. */
export function decodeRing(encoded) {
  const out = new Float32Array(encoded.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    x += encoded[i];
    y += encoded[i + 1];
    out[i] = x / QUANT;
    out[i + 1] = projectLat(y / QUANT);
  }
  return out;
}

/** @returns {Map<string, {rings: Float32Array[], bbox: number[]}>} */
export function buildRegionGeometry(source = RINGS) {
  const map = new Map();
  for (const [id, rings] of Object.entries(source)) {
    const decoded = rings.map(decodeRing);
    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of decoded) {
      for (let i = 0; i < r.length; i += 2) {
        if (r[i] < bbox[0]) bbox[0] = r[i];
        if (r[i + 1] < bbox[1]) bbox[1] = r[i + 1];
        if (r[i] > bbox[2]) bbox[2] = r[i];
        if (r[i + 1] > bbox[3]) bbox[3] = r[i + 1];
      }
    }
    map.set(id, { rings: decoded, bbox });
  }
  return map;
}

/** Even-odd point in polygon over all rings (holes are separate rings). */
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i];
      const yi = r[i + 1];
      const xj = r[j];
      const yj = r[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Region id at world position, or null. */
export function hitTest(geometry, x, y) {
  for (const [id, g] of geometry) {
    const b = g.bbox;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    if (pointInRings(x, y, g.rings)) return id;
  }
  return null;
}
