/**
 * 2D camera: world <-> screen transform with zoom limits and pan clamping.
 * `zoom` is screen pixels per world unit (degree).
 */
import { WORLD_BOUNDS } from './geometry.js';

export class Camera {
  constructor() {
    this.x = 10; // world centre
    this.y = -20;
    this.zoom = 3;
    this.width = 1;
    this.height = 1;
    this.maxZoom = 60;
  }

  get minZoom() {
    const w = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
    const h = WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY;
    return Math.min(this.width / w, this.height / h) * 0.95;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.clamp();
  }

  fitWorld() {
    this.zoom = Math.max(this.minZoom, (this.width / 360) * 1.05);
    this.x = 10;
    this.y = (WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2 - 8;
    this.clamp();
  }

  worldToScreen(wx, wy) {
    return [(wx - this.x) * this.zoom + this.width / 2, (wy - this.y) * this.zoom + this.height / 2];
  }

  screenToWorld(sx, sy) {
    return [(sx - this.width / 2) / this.zoom + this.x, (sy - this.height / 2) / this.zoom + this.y];
  }

  /** Zoom by factor keeping the world point under (sx, sy) fixed. */
  zoomAt(factor, sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    this.x = wx - (sx - this.width / 2) / this.zoom;
    this.y = wy - (sy - this.height / 2) / this.zoom;
    this.clamp();
  }

  panBy(dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  centerOn(wx, wy, zoom = this.zoom) {
    this.x = wx;
    this.y = wy;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.clamp();
  }

  clamp() {
    const halfW = this.width / 2 / this.zoom;
    const halfH = this.height / 2 / this.zoom;
    const b = WORLD_BOUNDS;
    const clampAxis = (v, min, max, half) => (max - min < half * 2 ? (min + max) / 2 : Math.max(min + half, Math.min(max - half, v)));
    this.x = clampAxis(this.x, b.minX, b.maxX, halfW);
    this.y = clampAxis(this.y, b.minY, b.maxY, halfH);
  }
}
