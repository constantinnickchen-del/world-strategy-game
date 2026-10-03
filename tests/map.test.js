import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegionGeometry, hitTest, project, projectLat, pointInRings, WORLD_BOUNDS } from '../src/map/geometry.js';
import { MAP_MODES } from '../src/map/mapModes.js';
import { newState } from './helpers.js';

const geometry = buildRegionGeometry();

test('projection: north is up, monotonic, clamped', () => {
  assert.ok(projectLat(50) < projectLat(0));
  assert.ok(projectLat(0) < projectLat(-30));
  assert.equal(projectLat(89), projectLat(84), 'clamped at the top');
  assert.ok(WORLD_BOUNDS.minY < WORLD_BOUNDS.maxY);
});

test('hit testing finds the right countries', () => {
  const cases = [
    [[10.4, 51.1], 'DEU'], // Germany
    [[2.3, 46.6], 'FRA'],
    [[-100, 40], 'USA'],
    [[-55, -10], 'BRA'],
    [[78, 22], 'IND'],
    [[134, -25], 'AUS'],
    [[-42, 72], 'GRL'], // Greenland (region owned by Denmark)
    [[-30, 30], null], // Atlantic
  ];
  for (const [[lon, lat], expected] of cases) {
    const [x, y] = project(lon, lat);
    assert.equal(hitTest(geometry, x, y), expected, `${lon},${lat}`);
  }
});

test('point in polygon with holes (even-odd)', () => {
  const outer = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
  const hole = new Float32Array([3, 3, 7, 3, 7, 7, 3, 7]);
  assert.equal(pointInRings(1, 1, [outer, hole]), true);
  assert.equal(pointInRings(5, 5, [outer, hole]), false);
});

test('every map mode colours every country and describes it', () => {
  const s = newState();
  const ui = { mapResource: 'oil' };
  for (const mode of MAP_MODES) {
    for (const id of s.countryOrder) {
      const color = mode.color(s, s.countries[id], ui);
      assert.match(color, /^(#|rgb)/, `${mode.id} ${id}`);
      assert.equal(typeof mode.value(s, s.countries[id], ui), 'string');
    }
    assert.ok(mode.legend(s, ui));
  }
});

test('all regions have geometry', () => {
  const s = newState();
  for (const rid of Object.keys(s.regions)) assert.ok(geometry.has(rid), rid);
});
