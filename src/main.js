/**
 * Entry point: wires storage, saves, settings, session and UI together.
 */
import { GameSession } from './core/GameSession.js';
import { loadSettings } from './core/settings.js';
import { createDefaultStorage } from './save/storage.js';
import { SaveManager } from './save/SaveManager.js';
import { UIManager } from './ui/UIManager.js';

const STORAGE_LABELS = {
  indexedDB: 'IndexedDB dieses Browsers',
  localStorage: 'localStorage dieses Browsers (begrenzter Platz)',
  memory: 'nur im Arbeitsspeicher – Spielstände gehen beim Schließen verloren, bitte exportieren',
};

async function boot() {
  const settings = loadSettings();
  const storage = await createDefaultStorage();
  const saves = new SaveManager({ storage });
  const session = new GameSession({ settings });
  const ui = new UIManager({ session, saves, settings, storageLabel: STORAGE_LABELS[storage.kind] });
  ui.init();
  ui.enterSetup();
  document.getElementById('boot').remove();
  // Exposed for debugging in the browser console and for automated tests.
  window.worldStrategy = { session, ui, saves };
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (!el) return;
  el.innerHTML = '<p>Das Spiel konnte nicht gestartet werden:</p><pre></pre>';
  el.querySelector('pre').textContent = String(err.message ?? err);
});
