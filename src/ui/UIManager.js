/**
 * UI orchestration.
 *
 * - Owns UI-only state (selected country, open panel, map mode). Nothing of
 *   this goes into the game state.
 * - Renders lazily via dirty flags, flushed once per animation frame.
 * - Handles all interaction through event delegation on data attributes
 *   (see widgets.js), so panels are plain template functions.
 */
import { MapRenderer } from '../map/MapRenderer.js';
import { MAP_MODE_BY_ID } from '../map/mapModes.js';
import { TopBar } from './components/TopBar.js';
import { Sidebar, NAV_ITEMS } from './components/Sidebar.js';
import { InfoPanel } from './components/InfoPanel.js';
import { NewsTicker } from './components/NewsFeed.js';
import { MapControls } from './components/MapControls.js';
import { Tooltip } from './components/Tooltip.js';
import { ModalManager, Toasts } from './components/Modal.js';
import { mountCharts } from './components/Chart.js';
import { EventModal } from './modals/EventModal.js';
import { MenuModal } from './modals/MenuModal.js';
import { StartScreen } from './modals/StartScreen.js';
import { Tutorial } from './components/Tutorial.js';
import { OverviewPanel } from './panels/OverviewPanel.js';
import { EconomyPanel } from './panels/EconomyPanel.js';
import { PoliticsPanel } from './panels/PoliticsPanel.js';
import { DiplomacyPanel } from './panels/DiplomacyPanel.js';
import { TradePanel } from './panels/TradePanel.js';
import { ResearchPanel } from './panels/ResearchPanel.js';
import { MilitaryPanel } from './panels/MilitaryPanel.js';
import { WarPanel } from './panels/WarPanel.js';
import { DeclareWarModal } from './modals/DeclareWarModal.js';
import { STATIC_REGIONS } from '../state/worldIndex.js';
import { planMove } from '../systems/war/movement.js';
import { unitLabel } from '../systems/military/units.js';
import { WorldPanel } from './panels/WorldPanel.js';
import { NewsPanel } from './panels/NewsPanel.js';
import { createGameState } from '../state/createGameState.js';
import { rankBy } from '../state/selectors.js';
import { saveSettings } from '../core/settings.js';
import { fromDayNumber, formatDateDE } from '../core/calendar.js';
import { esc, flagEmoji } from '../util/format.js';
import { DEFAULT_SCENARIO } from '../data/scenarios.js';

const PANELS = Object.fromEntries(
  [OverviewPanel, EconomyPanel, PoliticsPanel, DiplomacyPanel, TradePanel, ResearchPanel, MilitaryPanel, WarPanel, WorldPanel, NewsPanel].map((p) => [p.id, p]),
);

export class UIManager {
  /**
   * @param {{session: import('../core/GameSession.js').GameSession, saves: import('../save/SaveManager.js').SaveManager, settings: object, storageLabel: string}} deps
   */
  constructor({ session, saves, settings, storageLabel }) {
    this.session = session;
    this.saves = saves;
    this.settings = settings;
    this.storageLabel = storageLabel;
    this.mode = 'setup';
    this.activePanel = null;
    this.selected = null;
    this.mapMode = 'political';
    this.mapResource = 'oil';
    this.worldSort = 'gdp';
    this.revision = 0; // bumped on every state change that affects tooltips/panels
    this.dirty = new Set();
    this.sliderActive = false;
    this.monthsSinceAutosave = 0;
    this.autosaveSlot = 1;
    this.rankCache = null;
    this.selectedRegion = null;
    this.moveMode = null; // { unitIds } while the player picks a destination on the map
    this.moveTargetOk = false;
    this.militaryTab = 'quick';
    this.procurementFilter = 'all';
    this.unitSelection = new Set();
    this.openWar = null;
    this.collapsedWars = new Set();
    this.peaceDraft = null;
  }

  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      drawer: $('drawer'),
      mapWrap: $('map-wrap'),
      startScreen: $('start-screen'),
    };
    this.tooltip = new Tooltip($('tooltip'));
    this.modals = new ModalManager($('modal-root'));
    this.toasts = new Toasts($('toasts'));
    this.topBar = new TopBar($('topbar'), this);
    this.sidebar = new Sidebar($('sidebar'), this);
    this.infoPanel = new InfoPanel($('infopanel'), this);
    this.ticker = new NewsTicker($('newsfeed'), this);
    this.mapControls = new MapControls($('map-controls'), this);
    this.eventModal = new EventModal(this);
    this.menu = new MenuModal(this);
    this.startScreen = new StartScreen(this.el.startScreen, this);
    this.tutorial = new Tutorial($('tutorial-root'), this);
    this.declareWar = new DeclareWarModal(this);
    this.map = new MapRenderer($('map'), {
      getState: () => this.session.state,
      getMode: () => this.mapMode,
      getUi: () => this,
      onSelect: (regionId) => this.selectRegion(regionId),
      onHover: (id, ev) => this.onMapHover(id, ev),
    });
    this.map.showLabels = this.settings.showLabels;
    this.bindDom();
    this.bindBus();
    this.loop();
  }

  // ------------------------------------------------------------------ state

  enterSetup() {
    this.mode = 'setup';
    this.modals.closeAll();
    const preview = createGameState({ scenarioId: DEFAULT_SCENARIO, playerId: null, seed: 'preview' });
    this.session.replaceState(preview);
    this.selected = null;
    this.selectedRegion = null;
    this.moveMode = null;
    this.activePanel = null;
    if (MAP_MODE_BY_ID[this.mapMode]?.needsPlayer) this.mapMode = 'political';
    document.body.classList.add('is-setup');
    this.startScreen.show();
    this.map.resetView();
    this.markAll();
  }

  enterGame(state) {
    this.mode = 'game';
    this.session.replaceState(state);
    document.body.classList.remove('is-setup');
    this.startScreen.hide();
    this.modals.closeAll();
    this.activePanel = 'overview';
    this.selected = this.isNarrow ? null : state.playerId;
    this.selectedRegion = null;
    this.moveMode = null;
    this.unitSelection = new Set();
    this.openWar = null;
    this.collapsedWars = new Set();
    this.peaceDraft = null;
    this.map.setSelected(this.selected);
    this.monthsSinceAutosave = 0;
    this.map.focusCountry(state.playerId);
    this.markAll();
  }

  startNewGame(playerId) {
    const state = this.session.newGame({ scenarioId: DEFAULT_SCENARIO, playerId, seed: Date.now() });
    this.enterGame(state);
    if (this.settings.tutorialDone) {
      this.toasts.show(`Willkommen in ${state.countries[playerId].name}. Drücken Sie die Leertaste, um die Zeit zu starten.`, { ms: 6000 });
    } else {
      // first game: start the guided tour once the game screen has rendered
      requestAnimationFrame(() => requestAnimationFrame(() => this.tutorial.start()));
    }
  }

  /** Used by tutorial steps to show a specific panel / country. */
  setTutorialLayout({ panel = null, select = null, region = null, militaryTab = null }) {
    this.activePanel = panel;
    this.selected = select;
    this.selectedRegion = region;
    if (militaryTab) this.militaryTab = militaryTab;
    this.map.setSelected(select, region);
    this.mark('drawer', 'nav', 'info');
  }

  onTutorialFinished() {
    this.updateSetting('tutorialDone', true);
    this.toasts.show('Viel Erfolg! Starten Sie die Zeit mit der Leertaste.', { tone: 'good', ms: 5000 });
  }

  // --------------------------------------------------------------- render

  mark(...parts) {
    for (const p of parts) this.dirty.add(p);
  }

  markAll() {
    this.revision++;
    this.rankCache = null;
    this.mark('top', 'nav', 'drawer', 'info', 'news', 'controls', 'map', 'events');
  }

  ranks() {
    const state = this.session.state;
    const key = `${state.time.day}|${this.revision}`;
    if (this.rankCache?.key !== key) {
      this.rankCache = { key, gdp: rankBy(state, (c) => c.economy.gdp), military: rankBy(state, (c) => c.military.power) };
    }
    return this.rankCache;
  }

  loop() {
    let last = performance.now();
    const frame = (now) => {
      const elapsed = now - last;
      last = now;
      if (this.mode === 'game' && !this.tutorial.active) {
        try {
          this.session.update(elapsed);
        } catch (err) {
          this.session.setSpeed(0);
          console.error(err);
          this.toasts.show(`Simulationsfehler: ${err.message}. Das Spiel wurde pausiert.`, { tone: 'bad', ms: 8000 });
        }
      }
      this.flush();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  flush() {
    if (!this.dirty.size || !this.session.state) return;
    const d = this.dirty;
    this.dirty = new Set();
    if (d.has('top')) this.topBar.update();
    if (d.has('nav')) this.sidebar.update();
    if (d.has('controls')) this.mapControls.render();
    if (d.has('map')) this.map.requestRender();
    if (this.mode === 'setup') {
      if (d.has('start')) this.startScreen.render();
      return;
    }
    if (d.has('news')) this.ticker.render(d.has('drawer'));
    if (d.has('events')) this.eventModal.sync();
    if (d.has('drawer')) {
      if (this.sliderActive) this.dirty.add('drawer');
      else this.renderDrawer();
    }
    if (d.has('info')) {
      if (this.sliderActive) this.dirty.add('info');
      else this.renderInfo();
    }
  }

  renderDrawer() {
    const panel = PANELS[this.activePanel];
    const el = this.el.drawer;
    el.hidden = !panel || this.mode !== 'game';
    if (el.hidden) return;
    const body = el.querySelector('.panel-scroll');
    const scroll = body && el.dataset.panel === panel.id ? body.scrollTop : 0;
    el.dataset.panel = panel.id;
    el.innerHTML = `<header class="drawer-head"><h2>${panel.title}</h2><button class="icon-btn" data-action="closePanel" aria-label="Panel schließen">✕</button></header>
      <div class="panel-scroll">${panel.render(this)}</div>`;
    mountCharts(el, panel.charts?.(this));
    el.querySelector('.panel-scroll').scrollTop = scroll;
  }

  renderInfo() {
    const el = this.infoPanel.el;
    const body = el.querySelector('.panel-scroll');
    const scroll = body && el.dataset.country === this.selected ? body.scrollTop : 0;
    el.dataset.country = this.selected ?? '';
    this.infoPanel.render();
    if (!el.hidden) {
      mountCharts(el, this.infoPanel.charts());
      el.querySelector('.panel-scroll').scrollTop = scroll;
    }
  }

  // --------------------------------------------------------------- actions

  /** On narrow screens drawer and info panel are overlays and must not stack. */
  get isNarrow() {
    return window.matchMedia('(max-width: 1100px)').matches;
  }

  select(id, regionId = null) {
    this.selected = id && this.session.state.countries[id] ? id : null;
    this.selectedRegion = this.selected && regionId ? regionId : null;
    if (this.selected && this.isNarrow && this.mode === 'game' && this.activePanel) {
      this.activePanel = null;
      this.mark('drawer', 'nav');
    }
    this.map.setSelected(this.selected, this.selectedRegion);
    if (this.mode === 'setup') this.mark('start');
    else this.mark('info');
  }

  /** Map click: select a region (and its owner) – or give a move order in move mode. */
  selectRegion(regionId) {
    if (this.moveMode && this.mode === 'game') {
      if (regionId) this.orderMove(this.moveMode.unitIds, regionId);
      this.cancelMove();
      return;
    }
    const r = regionId ? this.session.state.regions[regionId] : null;
    if (this.mode === 'setup') this.select(r?.owner ?? null);
    else this.select(r?.owner ?? null, regionId);
  }

  startMove(unitIds) {
    const ids = unitIds.filter(Boolean);
    if (!ids.length) return;
    this.moveMode = { unitIds: ids };
    document.body.classList.add('is-move-mode');
    this.toasts.show(`${ids.length} Verband/Verbände ausgewählt – Zielregion auf der Karte anklicken (Esc bricht ab).`, { ms: 4500 });
    this.map.requestRender();
  }

  cancelMove() {
    this.moveMode = null;
    this.moveTargetOk = false;
    document.body.classList.remove('is-move-mode');
    this.tooltip.hide();
    this.map.requestRender();
  }

  /** Issues moveUnit for several formations and reports one summary. */
  orderMove(unitIds, regionId) {
    let ok = 0;
    let lastError = '';
    let lastMsg = '';
    for (const unitId of unitIds) {
      const res = this.session.execute({ type: 'moveUnit', unitId, regionId });
      if (res.ok) {
        ok++;
        lastMsg = res.message;
      } else lastError = res.error;
    }
    const name = STATIC_REGIONS[regionId]?.name ?? regionId;
    if (ok === 1) this.toasts.show(lastMsg, { tone: 'good' });
    else if (ok > 1) this.toasts.show(`${ok} Verbände erhalten den Befehl: ${name}.`, { tone: 'good' });
    if (lastError) this.toasts.show(`${unitIds.length - ok} Verband/Verbände konnten nicht: ${lastError}`, { tone: ok ? 'warn' : 'bad', ms: 5000 });
    this.unitSelection = new Set();
    this.markAll();
  }

  openWarsPanel(warId = null) {
    if (warId) {
      this.openWar = warId;
      this.collapsedWars.delete(warId);
    }
    this.activePanel = 'wars';
    this.closeInfoIfNarrow();
    this.mark('drawer', 'nav');
  }

  /** Reaction to an automatic pause (war outbreak, attack, crisis …). */
  onInterrupted(info) {
    if (this.mode !== 'game') return;
    const state = this.session.state;
    const labels = {
      warDeclared: 'Kriegsausbruch',
      playerDeclared: 'Kriegserklärung',
      attackOnPlayer: 'Angriff auf Ihr Land',
      warJoined: 'Neuer Kriegsgegner',
      allianceCall: 'Bündnisfall',
      diplomaticCrisis: 'Diplomatische Krise',
      peace: 'Friedensschluss',
      bankruptcy: 'Staatsbankrott',
      revolution: 'Machtwechsel',
    };
    const who = info.countryId ? ` (${state.countries[info.countryId]?.name ?? ''})` : '';
    // a crisis window explains the pause by itself; otherwise one short note
    if (!this.session.hasPendingPlayerEvent && info.kind !== 'playerDeclared') this.toasts.show(`⏸ Spiel angehalten: ${labels[info.kind] ?? info.kind}${who}.`, { tone: 'warn', ms: 4000 });
    const war = info.warId ? state.wars.find((w) => w.id === info.warId) : null;
    if (war && info.kind !== 'peace') {
      this.openWarsPanel(war.id);
      const goal = war.goals.find((g) => g.type === 'region')?.regionId;
      if (goal) this.map.focusRegion(goal, 9);
    }
    this.markAll();
  }

  openPanel(id) {
    if (!PANELS[id]) return;
    this.activePanel = id;
    this.closeInfoIfNarrow();
    this.mark('drawer', 'nav');
  }

  closeInfoIfNarrow() {
    if (this.isNarrow && this.selected) {
      this.selected = null;
      this.map.setSelected(null);
      this.mark('info');
    }
  }

  execute(cmd) {
    const res = this.session.execute(cmd);
    if (!res.ok) this.toasts.show(res.error, { tone: 'bad' });
    else if (res.message) this.toasts.show(res.message, { tone: res.accepted === false ? 'warn' : 'good', ms: 2500 });
    this.markAll();
    if (cmd.type === 'resolveEvent') this.eventModal.sync();
    return res;
  }

  confirm(text) {
    return new Promise((resolve) => {
      let answered = false;
      const m = this.modals.open({
        title: 'Bestätigen',
        className: 'confirm-modal',
        body: `<p>${esc(text)}</p><div class="btn-row"><button class="btn btn-danger" data-confirm-yes autofocus>Ja, fortfahren</button><button class="btn" data-confirm-no>Abbrechen</button></div>`,
        onRender: (el) => {
          el.querySelector('[data-confirm-yes]').addEventListener('click', () => {
            answered = true;
            m.close();
            resolve(true);
          });
          el.querySelector('[data-confirm-no]').addEventListener('click', () => m.close());
        },
        onClose: () => {
          if (!answered) resolve(false);
        },
      });
    });
  }

  async saveGame(slot, name) {
    try {
      const id = slot || `manual-${Date.now()}`;
      const meta = await this.saves.save(id, this.session.state, { name, kind: 'manual' });
      this.toasts.show(`Gespeichert: ${meta.name}`, { tone: 'good' });
      await this.menu.refresh();
    } catch (err) {
      this.toasts.show(`Speichern fehlgeschlagen: ${err.message}`, { tone: 'bad', ms: 7000 });
    }
  }

  async loadGame(slot) {
    try {
      const state = await this.saves.load(slot);
      this.enterGame(state);
      this.toasts.show(`Spielstand geladen (${formatDateDE(state.time.day)}).`, { tone: 'good' });
    } catch (err) {
      this.toasts.show(`Laden fehlgeschlagen: ${err.message}`, { tone: 'bad', ms: 7000 });
    }
  }

  async autosave() {
    const slot = `auto-${this.autosaveSlot}`;
    this.autosaveSlot = this.autosaveSlot === 1 ? 2 : 1;
    try {
      await this.saves.save(slot, this.session.state, { name: `Autosave ${this.session.player.name}`, kind: 'auto' });
    } catch (err) {
      this.toasts.show(`Autosave fehlgeschlagen: ${err.message}`, { tone: 'bad', ms: 7000 });
    }
  }

  exportGame() {
    const text = this.saves.exportToText(this.session.state);
    const state = this.session.state;
    const { year, month, day } = fromDayNumber(state.time.day);
    const name = `world-strategy-${state.playerId}-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.json`;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toasts.show(`Exportiert als ${name}`, { tone: 'good' });
  }

  async importGame(file) {
    try {
      const state = this.saves.importFromText(await file.text());
      this.enterGame(state);
      this.toasts.show('Spielstand importiert.', { tone: 'good' });
    } catch (err) {
      this.toasts.show(`Import fehlgeschlagen: ${err.message}`, { tone: 'bad', ms: 7000 });
    }
  }

  updatePauseSetting(key, value) {
    this.settings.pauseOn = { ...(this.settings.pauseOn ?? {}), [key]: value };
    saveSettings(this.settings);
    this.session.settings = this.settings;
  }

  updateSetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.session.settings = this.settings;
    if (key === 'showLabels') {
      this.map.showLabels = value;
      this.mark('map', 'controls');
    }
    if (key === 'newsFilter' || key === 'showNewsTicker') this.mark('news', 'drawer');
  }

  /** Handlers for data-action="..." */
  get actions() {
    return {
      selectCountry: (ds) => this.select(ds.id || null),
      clearRegion: () => this.select(this.selected),
      focusRegion: (ds) => {
        const r = this.session.state.regions[ds.region];
        if (!r) return;
        this.select(r.owner, ds.region);
        this.map.focusRegion(ds.region);
      },
      startMove: (ds) => this.startMove(String(ds.units ?? '').split(',')),
      orderMove: (ds) => this.orderMove(String(ds.units ?? '').split(',').filter(Boolean), ds.region),
      openDeclareWar: (ds) => this.declareWar.open(ds.target, ds.region || null),
      setMilitaryTab: (ds) => {
        this.militaryTab = ds.tab;
        this.activePanel = 'military';
        this.mark('drawer', 'nav');
      },
      setProcurementFilter: (ds) => {
        this.procurementFilter = ds.filter;
        this.mark('drawer');
      },
      clearUnitSelection: () => {
        this.unitSelection = new Set();
        this.mark('drawer');
      },
      toggleWar: (ds) => {
        const war = this.session.state.wars.find((w) => w.id === ds.war);
        const own = war && (war.attackers.includes(this.session.state.playerId) || war.defenders.includes(this.session.state.playerId));
        if (own) {
          if (this.collapsedWars.has(ds.war)) this.collapsedWars.delete(ds.war);
          else this.collapsedWars.add(ds.war);
        } else this.openWar = this.openWar === ds.war ? null : ds.war;
        this.mark('drawer');
      },
      focusPlayer: () => {
        this.select(this.session.state.playerId);
        this.map.focusCountry(this.session.state.playerId);
      },
      togglePanel: (ds) => {
        this.activePanel = this.activePanel === ds.panel ? null : ds.panel;
        if (this.activePanel) this.closeInfoIfNarrow();
        this.mark('drawer', 'nav');
      },
      openPanel: (ds) => this.openPanel(ds.panel),
      closePanel: () => {
        this.activePanel = null;
        this.mark('drawer', 'nav');
      },
      setSpeed: (ds) => {
        if (this.session.hasPendingPlayerEvent && this.settings.pauseOnEvents && Number(ds.speed) > 0) {
          this.toasts.show('Zuerst die offene Entscheidung treffen.', { tone: 'warn' });
          return;
        }
        this.session.setSpeed(Number(ds.speed));
      },
      setMapMode: (ds) => {
        this.mapMode = ds.mode;
        this.mark('map', 'controls');
      },
      setMapResource: (ds) => {
        this.mapResource = ds.resource;
        this.mark('map', 'controls');
      },
      zoom: (ds) => this.map.zoomBy(Number(ds.factor)),
      resetView: () => this.map.resetView(),
      toggleLabels: () => this.updateSetting('showLabels', !this.settings.showLabels),
      setWorldSort: (ds) => {
        this.worldSort = ds.sort;
        this.mark('drawer');
      },
      setNewsFilter: (ds) => this.updateSetting('newsFilter', ds.filter),
      openMenu: (ds) => this.menu.open(ds.tab || (this.mode === 'game' ? 'game' : 'saves')),
      menuTab: (ds) => this.menu.open(ds.tab),
      saveGame: (ds) => this.saveGame(ds.slot, ds.name),
      quickSave: () => this.saveGame('quick', 'Schnellspeicherung'),
      loadGame: async (ds) => {
        if (this.mode === 'game' && !(await this.confirm('Aktuelles Spiel verlassen und Spielstand laden? Nicht gespeicherter Fortschritt geht verloren.'))) return;
        await this.loadGame(ds.slot);
      },
      deleteSave: async (ds) => {
        if (!(await this.confirm('Diesen Spielstand endgültig löschen?'))) return;
        await this.saves.delete(ds.slot);
        await this.menu.refresh();
        if (this.mode === 'setup') this.startScreen.show();
      },
      exportGame: () => this.exportGame(),
      newGame: async () => {
        if (await this.confirm('Neues Spiel beginnen? Nicht gespeicherter Fortschritt geht verloren.')) this.enterSetup();
      },
      startGame: (ds) => this.startNewGame(ds.id),
      startTutorial: () => {
        this.menu.close();
        this.tutorial.start();
      },
    };
  }

  // ------------------------------------------------------------ DOM events

  bindDom() {
    document.addEventListener('click', async (ev) => {
      const cmdEl = ev.target.closest('[data-cmd]');
      if (cmdEl && !cmdEl.disabled) {
        if (cmdEl.dataset.confirm && !(await this.confirm(cmdEl.dataset.confirm))) return;
        this.execute(JSON.parse(cmdEl.dataset.cmd));
        return;
      }
      const el = ev.target.closest('[data-action]');
      if (!el || el.disabled || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'FORM') return;
      const handler = this.actions[el.dataset.action];
      if (handler) {
        ev.preventDefault();
        await handler(el.dataset, el);
      }
    });

    document.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.matches('input[type=range][data-slider]')) {
        this.sliderActive = false;
        const cmd = { ...JSON.parse(t.dataset.slider), value: Number(t.value) / 100 };
        this.execute(cmd);
        return;
      }
      const action = t.dataset.actionChange;
      if (!action) return;
      if (action === 'selectCountry' && t.value) {
        this.select(t.value);
        this.map.focusCountry(t.value);
      } else if (action === 'toggleUnitSel') {
        if (t.checked) this.unitSelection.add(t.dataset.unit);
        else this.unitSelection.delete(t.dataset.unit);
        this.mark('drawer');
      } else if (action === 'setAutoFront') {
        this.execute({ type: 'setAutoFront', active: t.checked });
      } else if (action === 'togglePeaceRegion' || action === 'setPeaceReparations') {
        const warId = t.dataset.war;
        const d = this.peaceDraft?.warId === warId ? this.peaceDraft : { warId, regions: [], reparations: 0 };
        if (action === 'togglePeaceRegion') d.regions = t.checked ? [...new Set([...d.regions, t.dataset.region])] : d.regions.filter((r) => r !== t.dataset.region);
        else d.reparations = Math.max(0, Math.round(Number(t.value) || 0));
        this.peaceDraft = d;
        this.mark('drawer');
      } else if (action === 'setPauseSetting') {
        this.updatePauseSetting(t.dataset.key, t.checked);
      } else if (action === 'setSetting') {
        const key = t.dataset.key;
        this.updateSetting(key, t.type === 'checkbox' ? t.checked : Number(t.value));
      } else if (action === 'importGame' && t.files?.[0]) {
        this.importGame(t.files[0]);
        t.value = '';
      }
    });

    document.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('input[type=range][data-slider]')) {
        const out = t.closest('.slider')?.querySelector('output');
        if (out) out.textContent = `${Number(t.value).toFixed(1)} %`;
      } else if (t.dataset.input === 'startSearch') {
        this.startScreen.query = t.value;
        this.startScreen.render();
      }
    });

    document.addEventListener('submit', (ev) => {
      const cmdForm = ev.target.closest('form[data-cmd-form]');
      if (cmdForm) {
        ev.preventDefault();
        this.execute(formCommand(cmdForm));
        return;
      }
      const form = ev.target.closest('form[data-action-submit]');
      if (!form) return;
      ev.preventDefault();
      if (form.dataset.actionSubmit === 'saveGame') this.saveGame(null, new FormData(form).get('name')?.toString().trim());
    });

    // While a slider is dragged, periodic re-renders must not replace it.
    document.addEventListener('pointerdown', (ev) => {
      if (ev.target.matches?.('input[type=range][data-slider]')) this.sliderActive = true;
    });
    document.addEventListener('pointerup', () => {
      if (this.sliderActive) setTimeout(() => (this.sliderActive = false), 0);
    });

    document.addEventListener('keydown', (ev) => this.onKey(ev));
  }

  onKey(ev) {
    if (this.tutorial.handleKey(ev)) return;
    const tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (this.modals.isOpen) return; // Escape handled by the modal manager
    if (ev.key === 'Escape') {
      if (this.moveMode) this.cancelMove();
      else if (this.selectedRegion && this.mode === 'game') this.select(this.selected);
      else if (this.activePanel) this.actions.closePanel();
      else if (this.selected && this.mode === 'game') this.select(null);
      else this.actions.openMenu({});
      ev.preventDefault();
      return;
    }
    if (this.mode !== 'game') return;
    const speedKeys = { 1: 1, 2: 2, 3: 3, 4: 4 };
    if (ev.key === ' ') {
      ev.preventDefault();
      if (this.session.hasPendingPlayerEvent && this.settings.pauseOnEvents) return;
      this.session.togglePause();
    } else if (ev.key in speedKeys) {
      this.actions.setSpeed({ speed: speedKeys[ev.key] });
    } else if (ev.key === '+') {
      this.session.setSpeed(Math.max(1, this.session.clock.speed + 1));
    } else if (ev.key === '-') {
      this.session.setSpeed(this.session.clock.speed - 1);
    } else {
      const nav = NAV_ITEMS.find((n) => n.key === ev.key.toUpperCase());
      if (nav) this.actions.togglePanel({ panel: nav.id });
    }
  }

  onMapHover(regionId, ev) {
    const state = this.session.state;
    const r = regionId ? state?.regions[regionId] : null;
    const c = r ? state.countries[r.owner] : null;
    if (!c || !ev) {
      if (this.tooltip.manual) this.tooltip.hide();
      return;
    }
    if (this.moveMode && this.mode === 'game') {
      const player = this.session.player;
      const unit = player.military.units.find((u) => u.id === this.moveMode.unitIds[0]);
      const plan = unit ? planMove(state, player, unit, regionId) : { error: 'Verband nicht gefunden.' };
      this.moveTargetOk = !plan.error;
      const what = plan.error ? `<span class="bad">${esc(plan.error)}</span>` : plan.type === 'attack' ? '<span class="bad">Angriff</span>' : plan.type === 'landing' ? `Landung über See (${plan.days} Tage)` : `Verlegung: ${plan.days} Tage${plan.type === 'sea' ? ' (Seeweg)' : ''}`;
      const n = this.moveMode.unitIds.length;
      this.tooltip.showAt(`<b>${esc(STATIC_REGIONS[regionId].name)}</b><br>${n > 1 ? `${n} Verbände · ` : unit ? `${esc(unitLabel(unit))} · ` : ''}${what}`, ev.clientX, ev.clientY);
      return;
    }
    const mode = MAP_MODE_BY_ID[this.mapMode];
    const ctrl = r.controller !== r.owner ? `<br><span class="bad">Besetzt durch ${esc(state.countries[r.controller].name)}</span>` : '';
    const siege = r.siege ? `<br><span class="warn">Belagerung ${Math.round(r.siege.progress)} %</span>` : '';
    this.tooltip.showAt(`<b>${esc(STATIC_REGIONS[regionId].name)}</b> · ${flagEmoji(c.iso2)} ${esc(c.name)}${ctrl}${siege}<br>${esc(mode.value(state, c, this))}`, ev.clientX, ev.clientY);
  }

  /** Major news about the player's country (or the whole world) appear as a toast. */
  announceNews() {
    const state = this.session.state;
    if (this.mode !== 'game' || !state.news.length) return;
    if (!this.settings.newsToasts) {
      this.lastNewsId = state.news.at(-1).id;
      return;
    }
    for (const n of state.news) {
      if (n.id <= (this.lastNewsId ?? 0)) continue;
      if (n.importance >= 3 && n.category !== 'event') this.toasts.show(n.text, { tone: 'info', ms: 6000 });
    }
    this.lastNewsId = state.news.at(-1).id;
  }

  // ------------------------------------------------------------- bus events

  bindBus() {
    const bus = this.session.bus;
    bus.on('day', () => {
      this.mark('top', 'news', 'events');
      // fronts, sieges and marching formations change daily during wars
      if (this.session.state.wars.some((w) => w.status === 'active')) {
        this.mark('map');
        if (this.activePanel === 'wars' || this.selectedRegion) this.dailyWarRefresh = (this.dailyWarRefresh ?? 0) + 1;
        if (this.dailyWarRefresh >= 7) {
          this.dailyWarRefresh = 0;
          this.mark('drawer', 'info');
        }
      }
      this.announceNews();
    });
    bus.on('month', () => {
      this.markAll();
      if (this.mode !== 'game') return;
      const interval = this.settings.autosaveMonths;
      this.monthsSinceAutosave++;
      if (interval > 0 && this.monthsSinceAutosave >= interval) {
        this.monthsSinceAutosave = 0;
        this.autosave();
      }
    });
    bus.on('speed', () => this.mark('top'));
    bus.on('interrupted', (info) => this.onInterrupted(info));
    bus.on('war:declared', () => this.markAll());
    bus.on('war:ended', () => this.markAll());
    bus.on('region:control', () => this.mark('map', 'info'));
    bus.on('event:pending', () => this.mark('events'));
    bus.on('event:resolved', () => this.mark('events'));
    bus.on('state:replaced', (state) => {
      this.lastNewsId = state.news.at(-1)?.id ?? 0;
      this.markAll();
    });
  }
}

/** Builds a command from a form: data-cmd-form holds the fixed part, fields add the rest. */
function formCommand(form) {
  const cmd = JSON.parse(form.dataset.cmdForm);
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.name === 'product') {
      const [kind, item] = el.value.split(':');
      cmd.kind = kind;
      cmd.item = item;
    } else cmd[el.name] = el.type === 'number' ? Number(el.value) : el.value;
  }
  return cmd;
}
