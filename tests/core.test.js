import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDayNumber, fromDayNumber, isLeapYear, daysInMonth, addMonths, formatISODate, parseISODate, monthsBetween,
} from '../src/core/calendar.js';
import { Rng, createRngState } from '../src/core/random.js';
import { GameClock, SPEEDS } from '../src/core/GameClock.js';
import { EventBus } from '../src/core/EventBus.js';

test('calendar: leap years and month lengths', () => {
  assert.equal(isLeapYear(2020), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(daysInMonth(2020, 2), 29);
  assert.equal(daysInMonth(2021, 2), 28);
});

test('calendar: day number roundtrip over centuries', () => {
  const start = toDayNumber(1990, 1, 1);
  const end = toDayNumber(2150, 12, 31);
  let prev = fromDayNumber(start - 1);
  for (let n = start; n <= end; n += 1) {
    const d = fromDayNumber(n);
    assert.equal(toDayNumber(d.year, d.month, d.day), n);
    // consecutive days advance correctly
    if (d.day === 1) assert.ok(prev.day === daysInMonth(prev.year, prev.month));
    prev = d;
  }
});

test('calendar: helpers', () => {
  assert.equal(formatISODate(parseISODate('2020-02-29')), '2020-02-29');
  assert.equal(formatISODate(addMonths(parseISODate('2020-01-31'), 1)), '2020-02-29');
  assert.equal(formatISODate(addMonths(parseISODate('2020-12-15'), 14)), '2022-02-15');
  assert.equal(monthsBetween(parseISODate('2020-01-01'), parseISODate('2021-03-01')), 14);
  assert.throws(() => toDayNumber(2021, 2, 29));
});

test('rng: deterministic and serialisable', () => {
  const s1 = createRngState('seed');
  const s2 = createRngState('seed');
  const a = new Rng(s1);
  const b = new Rng(s2);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  // continue from a JSON copy of the state
  const copy = new Rng(JSON.parse(JSON.stringify(s1)));
  assert.equal(copy.next(), a.next());
  const values = Array.from({ length: 1000 }, () => a.next());
  assert.ok(values.every((v) => v >= 0 && v < 1));
  assert.ok(new Set(values).size > 990);
});

test('rng: weighted never picks zero weights', () => {
  const r = new Rng(createRngState(1));
  for (let i = 0; i < 200; i++) assert.notEqual(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1)), 'b');
  assert.equal(r.weighted(['a'], () => 0), undefined);
});

test('clock: speeds, pause and frame cap', () => {
  const clock = new GameClock({ maxDaysPerUpdate: 4 });
  assert.equal(clock.update(1000), 0, 'paused clock does not advance');
  clock.setSpeed(1);
  let days = 0;
  for (let i = 0; i < 60; i++) days += clock.update(1000 / 60);
  assert.equal(days, SPEEDS[1].daysPerSecond);
  clock.setSpeed(3);
  assert.ok(clock.update(10_000) <= 4, 'huge frame gaps are capped');
  assert.equal(clock.togglePause(), 0);
  assert.equal(clock.togglePause(), 3, 'unpause restores last speed');
  assert.equal(clock.setSpeed(99), SPEEDS.length - 1);
});

test('event bus: subscribe, once, isolation of failing listeners', () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('x', (v) => seen.push(v));
  bus.once('x', (v) => seen.push(`once:${v}`));
  bus.on('x', () => {
    throw new Error('boom');
  });
  const orig = console.error;
  console.error = () => {};
  bus.emit('x', 1);
  bus.emit('x', 2);
  console.error = orig;
  assert.deepEqual(seen, [1, 'once:1', 2]);
});
