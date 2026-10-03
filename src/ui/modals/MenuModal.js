/**
 * Game menu: save slots, load, file import/export, settings, new game.
 */
import { formatDateDE } from '../../core/calendar.js';
import { esc } from '../../util/format.js';
import { GAME_VERSION } from '../../version.js';
import { PAUSE_REASONS } from '../../core/settings.js';
import { DIFFICULTIES } from '../../data/difficulty.js';

const TABS = [
  ['saves', 'Spielstände'],
  ['settings', 'Einstellungen'],
  ['game', 'Spiel'],
];

export function saveListHtml(list, { allowSave }) {
  if (!list.length) return '<p class="muted small">Noch keine Spielstände vorhanden.</p>';
  return `<ul class="save-list">${list
    .map(
      (m) => `<li class="save-item">
        <div class="save-info">
          <b>${esc(m.name)}</b>${m.kind === 'auto' ? ' <span class="chip">Autosave</span>' : ''}
          <span class="muted small">${esc(m.playerName)} · ${formatDateDE(m.gameDay)} · gespeichert ${new Date(m.savedAt).toLocaleString('de-DE')}</span>
        </div>
        <div class="save-actions">
          <button class="btn btn-small btn-primary" data-action="loadGame" data-slot="${esc(m.id)}">Laden</button>
          ${allowSave && m.kind !== 'auto' ? `<button class="btn btn-small" data-action="saveGame" data-slot="${esc(m.id)}" data-name="${esc(m.name)}">Überschreiben</button>` : ''}
          <button class="btn btn-small btn-danger" data-action="deleteSave" data-slot="${esc(m.id)}" aria-label="Spielstand ${esc(m.name)} löschen">Löschen</button>
        </div>
      </li>`,
    )
    .join('')}</ul>`;
}

export class MenuModal {
  constructor(ui) {
    this.ui = ui;
    this.modal = null;
    this.tab = 'saves';
  }

  get isOpen() {
    return !!this.modal;
  }

  open(tab = 'saves') {
    this.tab = tab;
    if (!this.modal) {
      this.resumeSpeed = this.ui.session.clock.speed;
      this.ui.session.setSpeed(0);
      this.modal = this.ui.modals.open({
        title: 'Menü',
        className: 'menu-modal',
        body: '<p class="muted">Lade …</p>',
        onClose: () => {
          this.modal = null;
          if (this.ui.mode === 'game' && this.resumeSpeed && !this.ui.session.hasPendingPlayerEvent) this.ui.session.setSpeed(this.resumeSpeed);
        },
      });
    }
    return this.refresh();
  }

  close() {
    this.modal?.close();
  }

  async refresh() {
    if (!this.modal) return;
    const ui = this.ui;
    const inGame = ui.mode === 'game';
    const tabs = `<div class="tabs" role="tablist">${TABS.filter(([id]) => inGame || id !== 'game')
      .map(([id, label]) => `<button role="tab" class="tab${id === this.tab ? ' is-active' : ''}" aria-selected="${id === this.tab}" data-action="menuTab" data-tab="${id}">${label}</button>`)
      .join('')}</div>`;
    let body = '';
    if (this.tab === 'saves') {
      let list = [];
      let error = '';
      try {
        list = await ui.saves.list();
      } catch (err) {
        error = err.message;
      }
      const player = ui.session.player;
      body = `
        ${inGame ? `<form class="save-form" data-action-submit="saveGame">
          <label class="field"><span>Name des Spielstands</span><input name="name" maxlength="60" value="${esc(`${player.name} – ${formatDateDE(ui.session.state.time.day, { long: false })}`)}" autocomplete="off"></label>
          <button class="btn btn-primary" type="submit">Neuer Spielstand</button>
        </form>` : ''}
        ${error ? `<p class="bad">${esc(error)}</p>` : ''}
        ${saveListHtml(list, { allowSave: inGame })}
        <div class="btn-row file-row">
          ${inGame ? '<button class="btn" data-action="exportGame">Als Datei exportieren</button>' : ''}
          <label class="btn">Datei importieren<input type="file" accept=".json,.wsave,application/json" data-action-change="importGame" hidden></label>
        </div>
        <p class="muted small">Speicherort: ${esc(ui.storageLabel)}. Exportierte Dateien lassen sich auf anderen Geräten importieren.</p>`;
    } else if (this.tab === 'settings') {
      const s = ui.settings;
      const diff = DIFFICULTIES[s.difficulty] ?? DIFFICULTIES.normal;
      body = `
        <label class="field"><span>Schwierigkeitsgrad${inGame ? ' (gilt sofort für das laufende Spiel)' : ''}</span>
          <select data-action-change="setSetting" data-key="difficulty" data-type="string">
            ${Object.entries(DIFFICULTIES).map(([id, d]) => `<option value="${id}"${(s.difficulty ?? 'normal') === id ? ' selected' : ''}>${d.name}</option>`).join('')}
          </select>
        </label>
        <p class="muted small">${esc(diff.description)} Assistent standardmäßig ${diff.assistant ? 'an' : 'aus'}.</p>
        <label class="check"><input type="checkbox" data-action-change="setSetting" data-key="assistant"${s.assistant !== false ? ' checked' : ''}> Assistent anzeigen (analysiert jeden Monat Ihr Land und gibt Tipps)</label>
        <label class="field"><span>Automatisch speichern</span>
          <select data-action-change="setSetting" data-key="autosaveMonths">
            ${[[0, 'Aus'], [1, 'Jeden Monat'], [3, 'Alle 3 Monate'], [6, 'Alle 6 Monate'], [12, 'Jedes Jahr']].map(([v, l]) => `<option value="${v}"${s.autosaveMonths === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="check"><input type="checkbox" data-action-change="setSetting" data-key="pauseOnEvents"${s.pauseOnEvents ? ' checked' : ''}> Bei Ereignissen pausieren</label>
        <label class="check"><input type="checkbox" data-action-change="setSetting" data-key="showLabels"${s.showLabels ? ' checked' : ''}> Ländernamen auf der Karte anzeigen</label>
        <label class="check"><input type="checkbox" data-action-change="setSetting" data-key="showNewsTicker"${s.showNewsTicker ? ' checked' : ''}> Nachrichtenleiste unten auf der Karte anzeigen</label>
        <label class="check"><input type="checkbox" data-action-change="setSetting" data-key="newsToasts"${s.newsToasts ? ' checked' : ''}> Wichtige Nachrichten als Einblendung oben anzeigen</label>
        <p class="muted small">Alle Meldungen finden Sie jederzeit im Bereich „Nachrichten“ (Taste O).</p>
        <h4 class="kbd-title">Automatisch pausieren bei …</h4>
        <p class="muted small">Die Simulation stoppt sofort am Tag des Ereignisses – auch bei maximaler Geschwindigkeit. Ist ein Punkt abgewählt, entscheidet Ihr Beraterstab die zugehörige Krise selbst.</p>
        <div class="pause-settings">${PAUSE_REASONS.map((r) => `<label class="check" data-tip="${esc(r.hint)}"><input type="checkbox" data-action-change="setPauseSetting" data-key="${r.id}"${(s.pauseOn ?? {})[r.id] !== false ? ' checked' : ''}> ${r.label}</label>`).join('')}</div>
        <h4 class="kbd-title">Tastenkürzel</h4>
        <table class="table small">
          <tr><td><span class="kbd">Leertaste</span></td><td>Pause / Fortsetzen</td></tr>
          <tr><td><span class="kbd">1</span>–<span class="kbd">4</span>, <span class="kbd">+</span>/<span class="kbd">−</span></td><td>Geschwindigkeit (4 = Maximal)</td></tr>
          <tr><td><span class="kbd">Q W E R T Z U K I O</span></td><td>Panels öffnen (U = Militär, K = Kriege)</td></tr>
          <tr><td><span class="kbd">Esc</span></td><td>Verlegung abbrechen / Schließen / Menü</td></tr>
          <tr><td>Klick auf Region</td><td>Region und Land auswählen; im Verlegungsmodus: Zielregion</td></tr>
          <tr><td>Mausrad, Ziehen, Doppelklick</td><td>Karte zoomen und verschieben</td></tr>
        </table>`;
    } else if (this.tab === 'game') {
      body = `
        <div class="btn-col">
          <button class="btn btn-primary" data-modal-close>Weiterspielen</button>
          <button class="btn" data-action="quickSave">Schnellspeichern</button>
          <button class="btn" data-action="startTutorial">Einführung erneut ansehen</button>
          <button class="btn btn-danger" data-action="newGame">Neues Spiel beginnen</button>
        </div>
        <p class="muted small">World Strategy ${GAME_VERSION}</p>`;
    }
    this.modal?.setBody(`${tabs}<div class="tab-body">${body}</div>`);
  }
}
