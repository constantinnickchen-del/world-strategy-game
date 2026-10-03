/**
 * Interactive canvas world map.
 *
 * - Region outlines and the shared border arcs are projected once and cached
 *   as Path2D objects in world units; every frame only the transform changes.
 * - Renders on demand (requestRender), never in a permanent loop.
 * - Regions are filled by the colour of their *owner* (map mode), occupied
 *   regions get a hatching in the colour of their *controller*.
 * - Every border arc is classified from the current state (country border,
 *   internal region border, front line), so borders move with conquests.
 * - Unit counters show the player's formations and enemy forces at the front;
 *   in move mode a click on a region gives the selected formations an order.
 */
import { buildTopology, hitTest, project, LAT_MAX, LAT_MIN } from './geometry.js';
import { Camera } from './Camera.js';
import { STATIC_REGIONS } from '../state/worldIndex.js';
import { MAP_MODE_BY_ID } from './mapModes.js';
import { activeWars, areEnemies, sideOf } from '../systems/war/wars.js';
import { alliesOf } from '../systems/diplomacy.js';
import { UNIT_TYPES } from '../data/military/army.js';

const OCEAN = '#0d1a27';
const GRATICULE = 'rgba(200, 162, 90, 0.08)';
const COUNTRY_BORDER = 'rgba(8, 14, 20, 0.9)';
const REGION_BORDER = 'rgba(8, 14, 20, 0.32)';
const FRONT = '#ff7a45';
const FRONT_CASING = 'rgba(20, 6, 4, 0.85)';
const SIEGE = '#f0a03c';
const SELECT = '#f0c66e';
const REGION_SELECT = '#fff3d6';

const FONT = '"Bahnschrift", "Roboto Condensed", "Arial Narrow", sans-serif';

export class MapRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{getState:()=>object, getMode:()=>string, getUi:()=>object, onSelect:(regionId:string|null)=>void, onHover:(regionId:string|null, ev:PointerEvent|null)=>void}} opts
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.camera = new Camera();
    const topo = buildTopology();
    this.geometry = topo.regions;
    this.arcSides = topo.arcSides;
    this.paths = new Map();
    for (const [id, g] of this.geometry) {
      const p = new Path2D();
      for (const r of g.rings) appendRing(p, r);
      this.paths.set(id, p);
    }
    this.arcPaths = topo.arcs.map((a) => {
      const p = new Path2D();
      p.moveTo(a[0], a[1]);
      for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]);
      return p;
    });
    this.borderCache = null;
    this.labelCache = null;
    this.patterns = new Map();
    this.graticule = this.buildGraticule();
    this.selected = null; // country
    this.selectedRegion = null;
    this.hovered = null; // region
    this.showLabels = true;
    this.renderQueued = false;
    this.pointers = new Map();
    this.drag = null;
    this.dpr = 1;
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.camera.fitWorld();
  }

  buildGraticule() {
    const p = new Path2D();
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x, y0] = project(lon, LAT_MAX);
      const [, y1] = project(lon, LAT_MIN);
      p.moveTo(x, y0);
      p.lineTo(x, y1);
    }
    for (let lat = -45; lat <= 75; lat += 15) {
      const [, y] = project(0, lat);
      p.moveTo(-180, y);
      p.lineTo(180, y);
    }
    return p;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    const first = this.camera.width <= 1;
    this.camera.resize(rect.width, rect.height);
    if (first) this.camera.fitWorld();
    this.requestRender();
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  setSelected(countryId, regionId = null) {
    this.selected = countryId;
    this.selectedRegion = regionId;
    this.requestRender();
  }

  /** Centre the camera on a country (its main territory). */
  focusCountry(countryId, zoom) {
    const state = this.opts.getState();
    const lbl = state && this.countryLabels(state).get(countryId);
    if (!lbl) return;
    const span = Math.max(lbl.bbox[2] - lbl.bbox[0], lbl.bbox[3] - lbl.bbox[1]);
    this.camera.centerOn(lbl.x, lbl.y, zoom ?? Math.min(this.camera.width, this.camera.height) / Math.max(8, span * 1.6));
    this.requestRender();
  }

  /** Centre the camera on a region. */
  focusRegion(regionId, minZoom = 22) {
    const g = this.geometry.get(regionId);
    if (!g) return;
    const [x, y] = project(...STATIC_REGIONS[regionId].label);
    this.camera.centerOn(x, y, Math.max(this.camera.zoom, minZoom));
    this.requestRender();
  }

  zoomBy(factor) {
    this.camera.zoomAt(factor, this.camera.width / 2, this.camera.height / 2);
    this.requestRender();
  }

  resetView() {
    this.camera.fitWorld();
    this.requestRender();
  }

  // ------------------------------------------------------------ derived data

  /** Border arcs grouped by class; rebuilt when ownership, control or wars change. */
  borders(state) {
    const wars = activeWars(state);
    const key = `${state.world.ownershipVersion}|${state.world.controlVersion}|${wars.map((w) => `${w.id}:${w.attackers.length}:${w.defenders.length}`).join(',')}`;
    if (this.borderCache?.key === key) return this.borderCache;
    const country = new Path2D();
    const region = new Path2D();
    const front = new Path2D();
    const enemyCache = new Map();
    const enemies = (a, b) => {
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!enemyCache.has(k)) enemyCache.set(k, !!areEnemies(state, a, b));
      return enemyCache.get(k);
    };
    this.arcSides.forEach(([a, b], i) => {
      const ra = state.regions[a];
      const rb = b ? state.regions[b] : null;
      if (!rb || ra.owner !== rb.owner) country.addPath(this.arcPaths[i]);
      else region.addPath(this.arcPaths[i]);
      if (rb && wars.length && ra.controller !== rb.controller && enemies(ra.controller, rb.controller)) front.addPath(this.arcPaths[i]);
    });
    this.borderCache = { key, country, region, front };
    return this.borderCache;
  }

  /**
   * Label anchor per country: area-weighted centre of its largest connected
   * block of regions (so that e.g. the USA label sits in the lower 48 states).
   */
  countryLabels(state) {
    const key = state.world.ownershipVersion;
    if (this.labelCache?.key === key && this.labelCache.state === state) return this.labelCache.map;
    const map = new Map();
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated || !c.regionIds.length) continue;
      const owned = new Set(c.regionIds);
      const seen = new Set();
      let best = null;
      for (const start of c.regionIds) {
        if (seen.has(start)) continue;
        const comp = [];
        const queue = [start];
        seen.add(start);
        while (queue.length) {
          const rid = queue.pop();
          comp.push(rid);
          for (const n of STATIC_REGIONS[rid].neighbors) {
            if (owned.has(n) && !seen.has(n)) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
        const area = comp.reduce((s, rid) => s + STATIC_REGIONS[rid].areaKm, 0);
        if (!best || area > best.area) best = { comp, area };
      }
      let sx = 0;
      let sy = 0;
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const rid of best.comp) {
        const w = STATIC_REGIONS[rid].areaKm / best.area;
        const [x, y] = project(...STATIC_REGIONS[rid].label);
        sx += x * w;
        sy += y * w;
        const b = this.geometry.get(rid).bbox;
        bbox[0] = Math.min(bbox[0], b[0]);
        bbox[1] = Math.min(bbox[1], b[1]);
        bbox[2] = Math.max(bbox[2], b[2]);
        bbox[3] = Math.max(bbox[3], b[3]);
      }
      // keep the label inside the territory: fall back to the largest region's label point
      let x = sx;
      let y = sy;
      const hit = hitTest(new Map(best.comp.map((rid) => [rid, this.geometry.get(rid)])), x, y);
      if (!hit) {
        const big = best.comp.reduce((a, b) => (STATIC_REGIONS[b].areaKm > STATIC_REGIONS[a].areaKm ? b : a));
        [x, y] = project(...STATIC_REGIONS[big].label);
      }
      map.set(id, { x, y, bbox });
    }
    this.labelCache = { key, state, map };
    return map;
  }

  /** Diagonal hatching in a controller colour; constant on-screen size. */
  hatch(color) {
    let p = this.patterns.get(color);
    if (!p) {
      const cv = document.createElement('canvas');
      cv.width = 8;
      cv.height = 8;
      const g = cv.getContext('2d');
      g.strokeStyle = color;
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(-2, 10);
      g.lineTo(10, -2);
      g.moveTo(6, 10);
      g.lineTo(10, 6);
      g.moveTo(-2, 2);
      g.lineTo(2, -2);
      g.stroke();
      p = this.ctx.createPattern(cv, 'repeat');
      this.patterns.set(color, p);
    }
    return p;
  }

  // ----------------------------------------------------------------- render

  render() {
    const { ctx, camera: cam, dpr } = this;
    const state = this.opts.getState();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!state) return;
    const z = cam.zoom * dpr;
    const tx = (cam.width / 2 - cam.x * cam.zoom) * dpr;
    const ty = (cam.height / 2 - cam.y * cam.zoom) * dpr;
    ctx.setTransform(z, 0, 0, z, tx, ty);

    ctx.strokeStyle = GRATICULE;
    ctx.lineWidth = 1 / cam.zoom;
    ctx.stroke(this.graticule);

    const mode = MAP_MODE_BY_ID[this.opts.getMode()] ?? MAP_MODE_BY_ID.political;
    const ui = this.opts.getUi();
    const colorCache = new Map();
    const colorOf = (id) => {
      let col = colorCache.get(id);
      if (!col) {
        const c = state.countries[id];
        col = c ? mode.color(state, c, ui) : '#1f2830';
        colorCache.set(id, col);
      }
      return col;
    };
    const view = this.visibleWorldRect();
    const occupied = [];
    const sieges = [];
    for (const [rid, path] of this.paths) {
      const g = this.geometry.get(rid);
      if (g.bbox[2] < view[0] || g.bbox[0] > view[2] || g.bbox[3] < view[1] || g.bbox[1] > view[3]) continue;
      const r = state.regions[rid];
      ctx.fillStyle = r ? colorOf(mode.byController ? r.controller : r.owner) : '#1f2830';
      ctx.fill(path, 'evenodd');
      if (r && r.controller !== r.owner) occupied.push(r);
      if (r?.siege) sieges.push(r);
    }
    // occupation: hatching in the occupier's colour (screen-space pattern)
    const inv = new DOMMatrix([1 / z, 0, 0, 1 / z, 0, 0]);
    for (const r of occupied) {
      const pat = this.hatch(mode.byController ? colorOf(r.owner) : colorOf(r.controller));
      pat.setTransform(inv);
      ctx.fillStyle = pat;
      ctx.fill(this.paths.get(r.id), 'evenodd');
    }

    const b = this.borders(state);
    ctx.lineJoin = 'round';
    if (cam.zoom > 2.2) {
      ctx.strokeStyle = REGION_BORDER;
      ctx.lineWidth = 0.6 / cam.zoom;
      ctx.stroke(b.region);
    }
    ctx.strokeStyle = COUNTRY_BORDER;
    ctx.lineWidth = Math.max(0.7, Math.min(1.5, cam.zoom / 5)) / cam.zoom;
    ctx.stroke(b.country);
    // front lines: dark casing + bright line, readable on every fill colour
    const frontPx = Math.max(1.8, Math.min(3.2, cam.zoom / 3));
    ctx.strokeStyle = FRONT_CASING;
    ctx.lineWidth = (frontPx + 2.4) / cam.zoom;
    ctx.stroke(b.front);
    ctx.strokeStyle = FRONT;
    ctx.lineWidth = frontPx / cam.zoom;
    ctx.stroke(b.front);

    if (sieges.length) {
      ctx.setLineDash([4 / cam.zoom, 3 / cam.zoom]);
      ctx.strokeStyle = SIEGE;
      ctx.lineWidth = 1.6 / cam.zoom;
      for (const r of sieges) ctx.stroke(this.paths.get(r.id));
      ctx.setLineDash([]);
    }

    const moveMode = ui?.moveMode;
    if (this.hovered && moveMode) {
      this.outlineRegions([this.hovered], ui.moveTargetOk ? '#9be37a' : FRONT, 2.5, ui.moveTargetOk ? 'rgba(155,227,122,0.15)' : 'rgba(224,83,58,0.15)');
    } else if (this.hovered) {
      const owner = state.regions[this.hovered]?.owner;
      if (owner && owner !== this.selected) this.outlineRegions(state.countries[owner].regionIds, 'rgba(240, 230, 210, 0.6)', 1.2, 'rgba(255,255,255,0.06)');
      this.outlineRegions([this.hovered], 'rgba(255, 245, 225, 0.85)', 1.4, null);
    }
    if (this.selected && state.countries[this.selected]) this.outlineRegions(state.countries[this.selected].regionIds, SELECT, 2.2, 'rgba(240, 198, 110, 0.1)');
    if (this.selectedRegion) this.outlineRegions([this.selectedRegion], REGION_SELECT, 2.6, 'rgba(255, 243, 214, 0.12)');

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawMovements(state, ui);
    if (this.showLabels) this.drawLabels(state);
    this.drawUnits(state, ui);
  }

  outlineRegions(regionIds, color, widthPx, fill) {
    const { ctx, camera: cam } = this;
    ctx.lineWidth = widthPx / cam.zoom;
    ctx.strokeStyle = color;
    for (const rid of regionIds) {
      const p = this.paths.get(rid);
      if (!p) continue;
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill(p, 'evenodd');
      }
      ctx.stroke(p);
    }
  }

  visibleWorldRect() {
    const [x0, y0] = this.camera.screenToWorld(0, 0);
    const [x1, y1] = this.camera.screenToWorld(this.camera.width, this.camera.height);
    return [x0, y0, x1, y1];
  }

  regionScreen(regionId) {
    const [x, y] = project(...STATIC_REGIONS[regionId].label);
    return this.camera.worldToScreen(x, y);
  }

  drawLabels(state) {
    const { ctx, camera: cam } = this;
    const placed = [];
    const candidates = [];
    const labels = this.countryLabels(state);
    for (const [id, lbl] of labels) {
      const c = state.countries[id];
      const extent = Math.min(lbl.bbox[2] - lbl.bbox[0], (lbl.bbox[3] - lbl.bbox[1]) * 1.6);
      const size = Math.min(20, extent * cam.zoom * 0.12);
      if (size < 9) continue;
      const [sx, sy] = cam.worldToScreen(lbl.x, lbl.y);
      if (sx < -50 || sy < -20 || sx > cam.width + 50 || sy > cam.height + 20) continue;
      candidates.push({ text: size > 13 ? c.name.toUpperCase() : c.name, size, sx, sy, weight: 600, color: c.id === this.selected ? '#fff3d6' : 'rgba(236, 228, 210, 0.92)' });
    }
    // region names when zoomed in far enough
    if (cam.zoom > 9) {
      const view = this.visibleWorldRect();
      for (const [rid, g] of this.geometry) {
        if (g.bbox[2] < view[0] || g.bbox[0] > view[2] || g.bbox[3] < view[1] || g.bbox[1] > view[3]) continue;
        const extent = Math.min(g.bbox[2] - g.bbox[0], g.bbox[3] - g.bbox[1]);
        const size = Math.min(12, extent * cam.zoom * 0.09);
        if (size < 8) continue;
        const [sx, sy] = this.regionScreen(rid);
        candidates.push({ text: STATIC_REGIONS[rid].name, size, sx, sy: sy + size + 2, weight: 400, color: 'rgba(225, 218, 200, 0.75)', minor: true });
      }
    }
    candidates.sort((a, b) => (a.minor === b.minor ? b.size - a.size : a.minor ? 1 : -1));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of candidates) {
      ctx.font = `${l.weight} ${l.size.toFixed(1)}px ${FONT}`;
      const w = ctx.measureText(l.text).width + 4;
      const rect = [l.sx - w / 2, l.sy - l.size / 2, l.sx + w / 2, l.sy + l.size / 2];
      if (placed.some((r) => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1])) continue;
      placed.push(rect);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10, 18, 26, 0.75)';
      ctx.strokeText(l.text, l.sx, l.sy);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.sx, l.sy);
    }
  }

  /**
   * Unit counters per region: own formations, allies at war, and enemy
   * formations next to territory held by the player's side.
   */
  unitMarkers(state, ui) {
    const p = state.playerId;
    if (!p) return [];
    const markers = new Map();
    const playerWars = activeWars(state).filter((w) => sideOf(w, p));
    const friends = new Set([p, ...alliesOf(state, p)]);
    for (const w of playerWars) for (const id of w[sideOf(w, p)]) friends.add(id);
    const enemies = new Set();
    for (const w of playerWars) for (const id of w[sideOf(w, p) === 'attackers' ? 'defenders' : 'attackers']) enemies.add(id);
    const add = (id, u, rel) => {
      const key = `${u.region}|${rel}`;
      let m = markers.get(key);
      if (!m) markers.set(key, (m = { region: u.region, rel, count: 0, strength: 0, selected: false, combat: false, icons: {} }));
      m.count++;
      m.strength += u.strength;
      m.icons[u.type] = (m.icons[u.type] ?? 0) + 1;
      if (u.inCombat || u.attacking) m.combat = true;
      if (ui?.moveMode?.unitIds.includes(u.id)) m.selected = true;
    };
    for (const u of state.countries[p].military.units) if (u.status !== 'reserve') add(p, u, 'own');
    if (enemies.size) {
      // fog of war: enemy formations are visible in regions next to friendly-held territory
      const visible = (rid) => friends.has(state.regions[rid].controller) || STATIC_REGIONS[rid].neighbors.some((n) => friends.has(state.regions[n]?.controller));
      for (const id of enemies) for (const u of state.countries[id].military.units) if (u.status === 'active' && visible(u.region)) add(id, u, 'enemy');
      for (const id of friends) {
        if (id === p) continue;
        for (const u of state.countries[id].military.units) if (u.status === 'active' && (u.inCombat || u.attacking)) add(id, u, 'ally');
      }
    }
    return [...markers.values()];
  }

  drawUnits(state, ui) {
    const markers = this.unitMarkers(state, ui);
    if (!markers.length) return;
    const { ctx, camera: cam } = this;
    const order = { enemy: 1, own: 0, ally: 2 };
    markers.sort((a, b) => Number(b.selected) - Number(a.selected) || order[a.rel] - order[b.rel] || b.count - a.count);
    const placed = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 11px ${FONT}`;
    const relOffset = { own: 0, enemy: 1, ally: -1 };
    for (const m of markers) {
      let [sx, sy] = this.regionScreen(m.region);
      sx += relOffset[m.rel] * 30;
      sy -= 14;
      if (sx < -30 || sy < -20 || sx > cam.width + 30 || sy > cam.height + 20) continue;
      const mainType = Object.entries(m.icons).sort((a, b) => b[1] - a[1])[0][0];
      const text = `${UNIT_TYPES[mainType].icon} ${m.count}`;
      const w = Math.max(28, ctx.measureText(text).width + 12);
      const rect = [sx - w / 2, sy - 9, sx + w / 2, sy + 9];
      if (!m.selected && placed.some((r) => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1])) continue;
      placed.push(rect);
      const bg = m.rel === 'own' ? 'rgba(46, 40, 26, 0.95)' : m.rel === 'enemy' ? 'rgba(70, 22, 18, 0.95)' : 'rgba(18, 52, 48, 0.95)';
      const border = m.selected ? '#9be37a' : m.rel === 'own' ? SELECT : m.rel === 'enemy' ? FRONT : '#3fa796';
      ctx.beginPath();
      ctx.roundRect(rect[0], rect[1], w, 18, 4);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = m.selected ? 2 : 1;
      ctx.strokeStyle = border;
      ctx.stroke();
      // strength bar
      const avg = m.strength / m.count;
      ctx.fillStyle = avg > 0.7 ? '#7fbf6a' : avg > 0.4 ? '#d9b44a' : '#d0583f';
      ctx.fillRect(rect[0] + 2, rect[3] - 3, (w - 4) * Math.max(0, Math.min(1, avg)), 2);
      ctx.fillStyle = '#f3ead6';
      ctx.fillText(text, sx, sy - 1);
      if (m.combat) {
        ctx.fillStyle = FRONT;
        ctx.beginPath();
        ctx.arc(rect[2] - 1, rect[1] + 1, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Arrows for the player's moving and attacking formations. */
  drawMovements(state, ui) {
    const p = state.playerId;
    if (!p) return;
    const { ctx } = this;
    const seen = new Set();
    for (const u of state.countries[p].military.units) {
      if (!u.target) continue;
      const key = `${u.region}>${u.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let [x0, y0] = this.regionScreen(u.region);
      const [x1, y1] = this.regionScreen(u.target);
      let len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 6) continue;
      const maxLen = Math.min(this.camera.width, this.camera.height) * 0.35;
      if (len > maxLen) {
        // long redeployments: only the last part of the arrow, pointing at the destination
        x0 = x1 - ((x1 - x0) / len) * maxLen * 0.4;
        y0 = y1 - ((y1 - y0) / len) * maxLen * 0.4;
        len = maxLen * 0.4;
      }
      if ((x1 < -20 || y1 < -20 || x1 > this.camera.width + 20 || y1 > this.camera.height + 20)) continue;
      ctx.strokeStyle = u.attacking ? FRONT : '#e8d9a8';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 2;
      ctx.setLineDash(u.attacking ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 9 * Math.cos(a - 0.4), y1 - 9 * Math.sin(a - 0.4));
      ctx.lineTo(x1 - 9 * Math.cos(a + 0.4), y1 - 9 * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ interaction

  regionAtScreen(sx, sy) {
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    return hitTest(this.geometry, wx, wy);
  }

  /** Owner country at a screen position (kept for callers that think in countries). */
  countryAtScreen(sx, sy) {
    const rid = this.regionAtScreen(sx, sy);
    return rid ? (this.opts.getState()?.regions[rid]?.owner ?? null) : null;
  }

  localPoint(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  }

  bindEvents() {
    const cv = this.canvas;
    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const [x, y] = this.localPoint(ev);
      this.camera.zoomAt(Math.exp(-ev.deltaY * 0.0015), x, y);
      this.requestRender();
    }, { passive: false });

    cv.addEventListener('pointerdown', (ev) => {
      cv.setPointerCapture(ev.pointerId);
      this.pointers.set(ev.pointerId, this.localPoint(ev));
      if (this.pointers.size === 1) this.drag = { start: this.localPoint(ev), last: this.localPoint(ev), moved: false };
      else this.drag = { pinch: this.pinchDistance(), moved: true };
    });

    cv.addEventListener('pointermove', (ev) => {
      const p = this.localPoint(ev);
      if (this.pointers.has(ev.pointerId)) {
        this.pointers.set(ev.pointerId, p);
        if (this.pointers.size >= 2 && this.drag?.pinch) {
          const d = this.pinchDistance();
          const [cx, cy] = this.pinchCenter();
          this.camera.zoomAt(d / this.drag.pinch, cx, cy);
          this.drag.pinch = d;
          this.requestRender();
          return;
        }
        if (this.drag && !this.drag.pinch) {
          const dx = p[0] - this.drag.last[0];
          const dy = p[1] - this.drag.last[1];
          if (!this.drag.moved && Math.hypot(p[0] - this.drag.start[0], p[1] - this.drag.start[1]) > 4) this.drag.moved = true;
          if (this.drag.moved) {
            this.camera.panBy(dx, dy);
            cv.classList.add('is-dragging');
            this.requestRender();
          }
          this.drag.last = p;
          return;
        }
      }
      this.updateHover(p, ev);
    });

    const end = (ev) => {
      const wasClick = this.drag && !this.drag.moved && this.pointers.size === 1;
      this.pointers.delete(ev.pointerId);
      cv.classList.remove('is-dragging');
      if (wasClick && ev.type === 'pointerup') {
        const [x, y] = this.localPoint(ev);
        this.opts.onSelect(this.regionAtScreen(x, y));
      }
      if (this.pointers.size === 0) this.drag = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => {
      if (this.hovered) {
        this.hovered = null;
        this.opts.onHover(null, null);
        this.requestRender();
      }
    });
    cv.addEventListener('dblclick', (ev) => {
      const [x, y] = this.localPoint(ev);
      this.camera.zoomAt(2, x, y);
      this.requestRender();
    });
  }

  updateHover(p, ev) {
    const id = this.regionAtScreen(p[0], p[1]);
    if (id !== this.hovered) {
      this.hovered = id;
      this.requestRender();
    }
    this.opts.onHover(id, ev);
  }

  pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }

  pinchCenter() {
    const [a, b] = [...this.pointers.values()];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
}

function appendRing(p, r) {
  p.moveTo(r[0], r[1]);
  for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
  p.closePath();
}
