/**
 * Interactive canvas world map.
 *
 * - Geometry is projected once and cached as Path2D objects in world units;
 *   every frame only the transform changes (cheap pan/zoom).
 * - Renders on demand (requestRender), never in a permanent loop.
 * - Regions are coloured by their *owner*, so territorial changes and
 *   future sub-national regions work without renderer changes.
 */
import { buildRegionGeometry, hitTest, project, LAT_MAX, LAT_MIN } from './geometry.js';
import { Camera } from './Camera.js';
import { STATIC_REGIONS } from '../state/worldIndex.js';
import { MAP_MODE_BY_ID } from './mapModes.js';

const OCEAN = '#0d1a27';
const GRATICULE = 'rgba(200, 162, 90, 0.08)';
const BORDER = 'rgba(8, 14, 20, 0.85)';
const SELECT = '#f0c66e';

export class MapRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{getState:()=>object, getMode:()=>string, getUi:()=>object, onSelect:(id:string|null)=>void, onHover:(id:string|null, ev:PointerEvent|null)=>void}} opts
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.camera = new Camera();
    this.geometry = buildRegionGeometry();
    this.paths = new Map();
    for (const [id, g] of this.geometry) {
      const p = new Path2D();
      for (const r of g.rings) {
        p.moveTo(r[0], r[1]);
        for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
        p.closePath();
      }
      this.paths.set(id, p);
    }
    this.graticule = this.buildGraticule();
    this.selected = null;
    this.hovered = null;
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

  setSelected(countryId) {
    this.selected = countryId;
    this.requestRender();
  }

  /** Centre the camera on a country (its capital region label point). */
  focusCountry(countryId, zoom) {
    const state = this.opts.getState();
    const c = state?.countries[countryId];
    if (!c) return;
    const lbl = STATIC_REGIONS[c.capitalRegion]?.label;
    if (!lbl) return;
    const [x, y] = project(lbl[0], lbl[1]);
    const g = this.geometry.get(c.capitalRegion);
    const span = g ? Math.max(g.bbox[2] - g.bbox[0], g.bbox[3] - g.bbox[1]) : 20;
    this.camera.centerOn(x, y, zoom ?? Math.min(this.camera.width, this.camera.height) / Math.max(8, span * 2.2));
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

  render() {
    const { ctx, camera: cam, dpr } = this;
    const state = this.opts.getState();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!state) return;
    const z = cam.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, (cam.width / 2 - cam.x * cam.zoom) * dpr, (cam.height / 2 - cam.y * cam.zoom) * dpr);

    ctx.strokeStyle = GRATICULE;
    ctx.lineWidth = 1 / cam.zoom;
    ctx.stroke(this.graticule);

    const mode = MAP_MODE_BY_ID[this.opts.getMode()] ?? MAP_MODE_BY_ID.political;
    const ui = this.opts.getUi();
    const colorCache = new Map();
    const view = this.visibleWorldRect();
    for (const [rid, path] of this.paths) {
      const g = this.geometry.get(rid);
      if (g.bbox[2] < view[0] || g.bbox[0] > view[2] || g.bbox[3] < view[1] || g.bbox[1] > view[3]) continue;
      const owner = state.regions[rid]?.owner;
      const c = owner ? state.countries[owner] : null;
      let color = '#1f2830';
      if (c) {
        color = colorCache.get(owner);
        if (!color) colorCache.set(owner, (color = mode.color(state, c, ui)));
      }
      ctx.fillStyle = color;
      ctx.fill(path, 'evenodd');
    }
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = Math.max(0.6, Math.min(1.4, cam.zoom / 6)) / cam.zoom;
    ctx.lineJoin = 'round';
    for (const path of this.paths.values()) ctx.stroke(path);

    if (this.hovered && this.hovered !== this.selected) this.outlineCountry(state, this.hovered, 'rgba(240, 230, 210, 0.75)', 1.5, 'rgba(255,255,255,0.08)');
    if (this.selected) this.outlineCountry(state, this.selected, SELECT, 2.5, 'rgba(240, 198, 110, 0.12)');

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.showLabels) this.drawLabels(state);
  }

  outlineCountry(state, countryId, color, widthPx, fill) {
    const c = state.countries[countryId];
    if (!c) return;
    const { ctx, camera: cam } = this;
    ctx.lineWidth = widthPx / cam.zoom;
    ctx.strokeStyle = color;
    ctx.fillStyle = fill;
    for (const rid of c.regionIds) {
      const p = this.paths.get(rid);
      if (!p) continue;
      ctx.fill(p, 'evenodd');
      ctx.stroke(p);
    }
  }

  visibleWorldRect() {
    const [x0, y0] = this.camera.screenToWorld(0, 0);
    const [x1, y1] = this.camera.screenToWorld(this.camera.width, this.camera.height);
    return [x0, y0, x1, y1];
  }

  drawLabels(state) {
    const { ctx, camera: cam } = this;
    const placed = [];
    const candidates = [];
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      const reg = STATIC_REGIONS[c.capitalRegion];
      const g = this.geometry.get(c.capitalRegion);
      if (!reg || !g) continue;
      const extent = Math.min(g.bbox[2] - g.bbox[0], (g.bbox[3] - g.bbox[1]) * 1.6);
      const size = Math.min(20, extent * cam.zoom * 0.16);
      if (size < 9) continue;
      const [x, y] = project(reg.label[0], reg.label[1]);
      const [sx, sy] = cam.worldToScreen(x, y);
      if (sx < -50 || sy < -20 || sx > cam.width + 50 || sy > cam.height + 20) continue;
      candidates.push({ c, size, sx, sy });
    }
    candidates.sort((a, b) => b.size - a.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { c, size, sx, sy } of candidates) {
      ctx.font = `600 ${size.toFixed(1)}px "Bahnschrift", "Roboto Condensed", "Arial Narrow", sans-serif`;
      const label = size > 13 ? c.name.toUpperCase() : c.name;
      const w = ctx.measureText(label).width + 4;
      const rect = [sx - w / 2, sy - size / 2, sx + w / 2, sy + size / 2];
      if (placed.some((r) => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1])) continue;
      placed.push(rect);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10, 18, 26, 0.75)';
      ctx.strokeText(label, sx, sy);
      ctx.fillStyle = c.id === this.selected ? '#fff3d6' : 'rgba(236, 228, 210, 0.92)';
      ctx.fillText(label, sx, sy);
    }
  }

  countryAtScreen(sx, sy) {
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    const rid = hitTest(this.geometry, wx, wy);
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
        this.opts.onSelect(this.countryAtScreen(x, y));
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
    const id = this.countryAtScreen(p[0], p[1]);
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
