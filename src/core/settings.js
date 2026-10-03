/**
 * User settings (not part of save games). Persisted in localStorage when
 * available; falls back to in-memory defaults.
 */
const KEY = 'ws:settings';

export const DEFAULT_SETTINGS = {
  autosaveMonths: 6, // 0 = off
  pauseOnEvents: true,
  newsFilter: 'relevant', // 'relevant' | 'all' | 'own'
  showLabels: true,
  tutorialDone: false,
};

export function loadSettings(ls = globalThis.localStorage) {
  try {
    const raw = ls?.getItem(KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, ls = globalThis.localStorage) {
  try {
    ls?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable – settings stay in memory */
  }
}
