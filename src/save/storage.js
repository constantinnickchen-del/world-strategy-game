/**
 * Storage adapters with a common async interface:
 *   get(key) -> value | undefined,  set(key, value),  delete(key)
 *
 * IndexedDB is preferred (large quota, binary values). localStorage is the
 * fallback (~5 MB, strings only – binary data is base64 encoded). The memory
 * adapter is used in tests and when no persistent storage is available.
 */

export class MemoryStorage {
  constructor() {
    this.kind = 'memory';
    this.map = new Map();
  }

  async get(key) {
    return this.map.get(key);
  }

  async set(key, value) {
    this.map.set(key, value);
  }

  async delete(key) {
    this.map.delete(key);
  }
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class LocalStorageAdapter {
  constructor(ls = globalThis.localStorage, prefix = 'ws:') {
    this.kind = 'localStorage';
    this.ls = ls;
    this.prefix = prefix;
  }

  async get(key) {
    const raw = this.ls.getItem(this.prefix + key);
    if (raw === null) return undefined;
    return JSON.parse(raw, (k, v) => (v && v.__bytes ? fromBase64(v.__bytes) : v));
  }

  async set(key, value) {
    const raw = JSON.stringify(value, (k, v) => (v instanceof Uint8Array ? { __bytes: toBase64(v) } : v));
    try {
      this.ls.setItem(this.prefix + key, raw);
    } catch (err) {
      throw new Error(`Speicherplatz im Browser reicht nicht aus (${Math.round(raw.length / 1024)} KB).`, { cause: err });
    }
  }

  async delete(key) {
    this.ls.removeItem(this.prefix + key);
  }
}

export class IndexedDBStorage {
  constructor(dbName = 'world-strategy', storeName = 'kv') {
    this.kind = 'indexedDB';
    this.dbName = dbName;
    this.storeName = storeName;
    this.dbPromise = null;
  }

  open() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(this.storeName, mode);
      const store = t.objectStore(this.storeName);
      const req = fn(store);
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  get(key) {
    return this.tx('readonly', (s) => s.get(key));
  }

  async set(key, value) {
    await this.tx('readwrite', (s) => s.put(value, key));
  }

  async delete(key) {
    await this.tx('readwrite', (s) => s.delete(key));
  }
}

/** Picks the best available persistent storage. */
export async function createDefaultStorage() {
  if (typeof indexedDB !== 'undefined') {
    try {
      const s = new IndexedDBStorage();
      await s.open();
      return s;
    } catch {
      /* fall through (e.g. private mode) */
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ws:probe', '1');
      localStorage.removeItem('ws:probe');
      return new LocalStorageAdapter();
    }
  } catch {
    /* fall through */
  }
  return new MemoryStorage();
}
