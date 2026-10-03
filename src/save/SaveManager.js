/**
 * Save game management: slots, autosaves, compression, integrity checks,
 * schema migrations and file export/import.
 *
 * Record layout in storage:
 *   "index"      -> [meta, ...]                      (fast listing without loading saves)
 *   "save:<id>"  -> { meta, encoding, data }          (data = gzip bytes or JSON string)
 */
import { hashString } from '../core/random.js';
import { migrateState } from './migrations.js';
import { GAME_VERSION } from '../version.js';
import { SCHEMA_VERSION } from '../state/createGameState.js';

export const FILE_FORMAT = 'world-strategy-save';
const INDEX_KEY = 'index';

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Structural validation – catches corrupted or foreign files before they break the game. */
export function validateState(state) {
  const fail = (msg) => {
    throw new Error(`Ungültiger Spielstand: ${msg}`);
  };
  if (!state || typeof state !== 'object') fail('kein Objekt');
  for (const key of ['meta', 'time', 'rng', 'countries', 'countryOrder', 'regions', 'market', 'diplomacy', 'events', 'news']) {
    if (!(key in state)) fail(`Feld „${key}" fehlt`);
  }
  if (!Number.isInteger(state.time.day)) fail('Datum fehlt');
  if (!Array.isArray(state.countryOrder) || !state.countryOrder.length) fail('keine Länder');
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    if (!c) fail(`Land ${id} fehlt`);
    if (!Number.isFinite(c.economy?.gdp)) fail(`Wirtschaftsdaten von ${id} beschädigt`);
  }
  if (state.playerId && !state.countries[state.playerId]) fail('Spielerland existiert nicht');
  return true;
}

export class SaveManager {
  /**
   * @param {{storage: {get:Function,set:Function,delete:Function}, migrations?: object}} opts
   */
  constructor({ storage, migrations }) {
    this.storage = storage;
    this.migrations = migrations;
  }

  async list() {
    const index = (await this.storage.get(INDEX_KEY)) ?? [];
    return [...index].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }

  async writeIndex(index) {
    await this.storage.set(INDEX_KEY, index);
  }

  buildMeta(id, state, { name, kind }) {
    const player = state.countries[state.playerId];
    return {
      id,
      name: name || `${player?.name ?? 'Beobachter'}`,
      kind,
      savedAt: new Date().toISOString(),
      gameDay: state.time.day,
      playerId: state.playerId,
      playerName: player?.name ?? '',
      scenarioId: state.meta.scenarioId,
      schemaVersion: state.meta.schemaVersion,
      gameVersion: GAME_VERSION,
    };
  }

  /**
   * @param {string} id   slot id (e.g. "manual-<timestamp>", "auto-1")
   * @param {object} state
   * @param {{name?:string, kind?:'manual'|'auto'|'quick'}} [opts]
   */
  async save(id, state, { name = '', kind = 'manual' } = {}) {
    validateState(state);
    const json = JSON.stringify(state);
    const meta = { ...this.buildMeta(id, state, { name, kind }), checksum: hashString(json), rawSize: json.length };
    const bytes = await gzip(json);
    const record = bytes ? { meta, encoding: 'gzip', data: bytes } : { meta, encoding: 'json', data: json };
    meta.size = bytes ? bytes.length : json.length;
    await this.storage.set(`save:${id}`, record);
    const index = (await this.storage.get(INDEX_KEY)) ?? [];
    await this.writeIndex([...index.filter((m) => m.id !== id), meta]);
    return meta;
  }

  async load(id) {
    const record = await this.storage.get(`save:${id}`);
    if (!record) throw new Error('Spielstand nicht gefunden.');
    const json = record.encoding === 'gzip' ? await gunzip(record.data) : record.data;
    if (record.meta?.checksum !== undefined && hashString(json) !== record.meta.checksum) {
      throw new Error('Spielstand ist beschädigt (Prüfsumme stimmt nicht).');
    }
    return this.restore(JSON.parse(json));
  }

  restore(state) {
    migrateState(state, this.migrations);
    validateState(state);
    return state;
  }

  async delete(id) {
    await this.storage.delete(`save:${id}`);
    const index = (await this.storage.get(INDEX_KEY)) ?? [];
    await this.writeIndex(index.filter((m) => m.id !== id));
  }

  /** Plain-text JSON file for download (portable between browsers/devices). */
  exportToText(state) {
    validateState(state);
    const json = JSON.stringify(state);
    return JSON.stringify({ format: FILE_FORMAT, gameVersion: GAME_VERSION, schemaVersion: SCHEMA_VERSION, checksum: hashString(json), state: json });
  }

  importFromText(text) {
    let wrapper;
    try {
      wrapper = JSON.parse(text);
    } catch {
      throw new Error('Datei ist kein gültiger Spielstand (kein JSON).');
    }
    if (wrapper?.format !== FILE_FORMAT || typeof wrapper.state !== 'string') throw new Error('Datei ist kein World-Strategy-Spielstand.');
    if (hashString(wrapper.state) !== wrapper.checksum) throw new Error('Spielstand-Datei ist beschädigt (Prüfsumme stimmt nicht).');
    return this.restore(JSON.parse(wrapper.state));
  }
}
