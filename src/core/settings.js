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
  showNewsTicker: false, // news strip at the bottom of the map
  newsToasts: false, // pop-up messages for important news
  tutorialDone: false,
  difficulty: 'normal', // see data/difficulty.js
  assistant: true, // monthly tips (default depends on the difficulty)
  // situations that stop the clock immediately (unchecked: advisors decide automatically)
  pauseOn: {
    warDeclared: true,
    attackOnPlayer: true,
    allianceCall: true,
    diplomaticCrisis: true,
    bankruptcy: true,
    revolution: true,
  },
};

export const PAUSE_REASONS = [
  { id: 'warDeclared', label: 'Kriegsausbruch', hint: 'Ein Krieg wird irgendwo auf der Welt erklärt (auch durch Sie).' },
  { id: 'attackOnPlayer', label: 'Angriff auf eigenes Land', hint: 'Ein Staat erklärt Ihnen den Krieg oder tritt einem Krieg gegen Sie bei.' },
  { id: 'allianceCall', label: 'Bündnisfall', hint: 'Ein Verbündeter wird angegriffen.' },
  { id: 'diplomaticCrisis', label: 'Wichtige diplomatische Krise', hint: 'Kriegsdrohungen gegen Sie, Friedensschlüsse mit Ihrer Beteiligung.' },
  { id: 'bankruptcy', label: 'Staatsbankrott', hint: 'Ihr Land, ein Verbündeter oder eine große Volkswirtschaft wird zahlungsunfähig.' },
  { id: 'revolution', label: 'Revolution', hint: 'Machtwechsel durch Putsch in Ihrem Land, bei Verbündeten oder großen Staaten.' },
];

export function loadSettings(ls = globalThis.localStorage) {
  try {
    const raw = ls?.getItem(KEY);
    const stored = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...stored, pauseOn: { ...DEFAULT_SETTINGS.pauseOn, ...(stored.pauseOn ?? {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS, pauseOn: { ...DEFAULT_SETTINGS.pauseOn } };
  }
}

export function saveSettings(settings, ls = globalThis.localStorage) {
  try {
    ls?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable – settings stay in memory */
  }
}
