import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, simulateDays } from './helpers.js';
import { SaveManager, validateState } from '../src/save/SaveManager.js';
import { MemoryStorage } from '../src/save/storage.js';
import { migrateState } from '../src/save/migrations.js';
import { Simulation } from '../src/core/Simulation.js';

test('save -> load roundtrip restores the identical state (gzip)', async () => {
  const s = simulateDays(newState({ seed: 'save' }), 70);
  const mgr = new SaveManager({ storage: new MemoryStorage() });
  const meta = await mgr.save('slot-1', s, { name: 'Test' });
  assert.equal(meta.name, 'Test');
  assert.ok(meta.size < meta.rawSize, 'compressed');
  const loaded = await mgr.load('slot-1');
  assert.equal(JSON.stringify(loaded), JSON.stringify(s));
  const list = await mgr.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].playerId, 'DEU');
});

test('a loaded game continues exactly like the original', async () => {
  const a = simulateDays(newState({ seed: 'cont' }), 40);
  const mgr = new SaveManager({ storage: new MemoryStorage() });
  await mgr.save('x', a);
  const b = await mgr.load('x');
  const sim = new Simulation();
  sim.advanceDays(a, 120);
  sim.advanceDays(b, 120);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('overwrite, delete and multiple slots', async () => {
  const mgr = new SaveManager({ storage: new MemoryStorage() });
  const s = newState();
  await mgr.save('a', s);
  await mgr.save('b', s, { kind: 'auto' });
  await mgr.save('a', s, { name: 'neu' });
  let list = await mgr.list();
  assert.equal(list.length, 2);
  assert.equal(list.find((m) => m.id === 'a').name, 'neu');
  await mgr.delete('a');
  list = await mgr.list();
  assert.deepEqual(list.map((m) => m.id), ['b']);
  await assert.rejects(mgr.load('a'), /nicht gefunden/);
});

test('corrupted data is detected', async () => {
  const storage = new MemoryStorage();
  const mgr = new SaveManager({ storage });
  await mgr.save('c', newState());
  const rec = await storage.get('save:c');
  rec.meta.checksum += 1;
  await assert.rejects(mgr.load('c'), /beschädigt/);
});

test('export / import as text file', () => {
  const mgr = new SaveManager({ storage: new MemoryStorage() });
  const s = newState();
  const text = mgr.exportToText(s);
  assert.equal(JSON.stringify(mgr.importFromText(text)), JSON.stringify(s));
  assert.throws(() => mgr.importFromText('{"foo":1}'), /kein World-Strategy/);
  assert.throws(() => mgr.importFromText('nope'), /kein JSON/);
  const tampered = JSON.parse(text);
  tampered.state = tampered.state.replace('"DEU"', '"FRA"');
  assert.throws(() => mgr.importFromText(JSON.stringify(tampered)), /beschädigt/);
});

test('migrations upgrade old schemas step by step', () => {
  const s = { meta: { schemaVersion: 1 } };
  const migrations = {
    1: (st) => (st.added = 'v2'),
    2: (st) => (st.added += '+v3'),
  };
  migrateState(s, migrations, 3);
  assert.equal(s.meta.schemaVersion, 3);
  assert.equal(s.added, 'v2+v3');
  assert.throws(() => migrateState({ meta: { schemaVersion: 1 } }, {}, 2), /Keine Migration/);
  assert.throws(() => migrateState({ meta: { schemaVersion: 9 } }, {}, 2), /neueren/);
});

test('validation rejects broken states', () => {
  assert.throws(() => validateState(null));
  const s = newState();
  delete s.countries.DEU;
  assert.throws(() => validateState(s), /DEU/);
});
