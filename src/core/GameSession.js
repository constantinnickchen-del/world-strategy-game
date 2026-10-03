/**
 * A running game: state + simulation + clock + command entry point.
 *
 * The UI talks only to the session (read state, execute commands, change
 * speed). The session emits bus events the UI can subscribe to:
 *   day, month, year           – time advanced
 *   command                    – a command changed the state
 *   event:pending              – the player must decide an event
 *   event:resolved             – an event was resolved
 *   state:replaced             – a new game was started or a save was loaded
 *   speed                      – clock speed changed
 *   interrupted                – the clock was stopped by a crisis ({kind, warId, countryId, day, speedBefore})
 *
 * Crisis interrupts: the simulation emits 'interrupt' on the bus (war outbreak,
 * attack on the player, alliance call, crisis, bankruptcy, revolution). The
 * session stops the clock at the end of that very day – also at maximum speed
 * – if the matching pause setting is on. When a setting is off, the advisors
 * decide the related player event automatically and the game keeps running.
 */
import { EventBus } from './EventBus.js';
import { GameClock } from './GameClock.js';
import { Simulation } from './Simulation.js';
import { createGameState } from '../state/createGameState.js';
import { executeCommand, validateCommand } from '../commands/commands.js';
import { addNews } from '../systems/news.js';
import { advisorChoice } from '../systems/events.js';
import { EVENT_BY_ID } from '../data/events.js';
import { alliesOf } from '../systems/diplomacy.js';
import { DEFAULT_SETTINGS } from './settings.js';

/** Interrupt kind -> pause setting (null = never pauses on its own). */
export const INTERRUPT_SETTING = {
  warDeclared: 'warDeclared',
  playerDeclared: 'warDeclared',
  attackOnPlayer: 'attackOnPlayer',
  warJoined: 'attackOnPlayer',
  allianceCall: 'allianceCall',
  diplomaticCrisis: 'diplomaticCrisis',
  peace: 'diplomaticCrisis',
  bankruptcy: 'bankruptcy',
  revolution: 'revolution',
  regionLost: null,
};

const BIG_ECONOMY_GDP = 1500; // bn – defaults and coups of such states shake the world
import { formatDateDE } from './calendar.js';

export class GameSession {
  constructor({ bus = new EventBus(), settings = {} } = {}) {
    this.bus = bus;
    this.settings = settings;
    this.clock = new GameClock();
    this.sim = new Simulation({ bus });
    this.state = null;
    this.pendingInterrupt = null;
    this.lastInterrupt = null;
    bus.on('interrupt', (info) => this.onInterrupt(info));
  }

  pauseEnabled(settingId) {
    const pauseOn = this.settings.pauseOn ?? DEFAULT_SETTINGS.pauseOn;
    return pauseOn[settingId] !== false;
  }

  /** Is a bankruptcy / revolution elsewhere relevant enough to stop the game? */
  concernsPlayer(countryId) {
    const s = this.state;
    if (!s || !countryId || countryId === s.playerId) return true;
    if (alliesOf(s, s.playerId).includes(countryId)) return true;
    return (s.countries[countryId]?.economy.gdp ?? 0) > BIG_ECONOMY_GDP;
  }

  onInterrupt(info) {
    if (!this.state) return;
    const setting = INTERRUPT_SETTING[info.kind];
    if (!setting || !this.pauseEnabled(setting)) return;
    if ((info.kind === 'bankruptcy' || info.kind === 'revolution') && !this.concernsPlayer(info.countryId)) return;
    // keep the most important reason of the day (wars beat everything else)
    const rank = (k) => ['attackOnPlayer', 'warJoined', 'allianceCall', 'playerDeclared', 'warDeclared'].indexOf(k);
    const cur = this.pendingInterrupt;
    if (!cur || (rank(info.kind) >= 0 && (rank(cur.kind) < 0 || rank(info.kind) < rank(cur.kind)))) {
      this.pendingInterrupt = { ...info, day: this.state.time.day };
    }
  }

  /** Player events whose pause category is switched off are decided by the advisors. */
  autoDecideEvents() {
    const s = this.state;
    for (const inst of [...s.events.pending]) {
      const kind = inst.data?.pauseKind;
      const setting = kind ? INTERRUPT_SETTING[kind] : null;
      if (!setting || this.pauseEnabled(setting)) continue;
      const ctx = this.sim.context(s);
      const option = advisorChoice(s, inst, ctx);
      const res = executeCommand(s, { type: 'resolveEvent', countryId: s.playerId, uid: inst.uid, option }, ctx);
      if (res.ok) {
        addNews(s, {
          category: 'system',
          countryId: s.playerId,
          importance: 2,
          text: `Beraterstab entschied „${EVENT_BY_ID[inst.eventId].title}“: ${inst.options[option].label}.`,
        });
      }
    }
  }

  newGame({ scenarioId, playerId, seed = Date.now() }) {
    const state = createGameState({ scenarioId, playerId, seed });
    addNews(state, {
      category: 'system',
      countryId: playerId,
      importance: 3,
      text: `Sie übernehmen am ${formatDateDE(state.time.day)} die Regierung von ${state.countries[playerId].name}.`,
    });
    this.replaceState(state);
    return state;
  }

  replaceState(state) {
    this.state = state;
    this.autoPausedSpeed = 0;
    this.pendingInterrupt = null;
    this.lastInterrupt = null;
    this.clock.setSpeed(0);
    this.bus.emit('state:replaced', state);
  }

  get player() {
    return this.state?.countries[this.state.playerId] ?? null;
  }

  get hasPendingPlayerEvent() {
    return !!this.state && this.state.events.pending.length > 0;
  }

  setSpeed(speed) {
    if (speed > 0) this.autoPausedSpeed = 0;
    const s = this.clock.setSpeed(speed);
    this.bus.emit('speed', s);
    return s;
  }

  togglePause() {
    const s = this.clock.togglePause();
    this.bus.emit('speed', s);
    return s;
  }

  /**
   * Advance the simulation by `days`, stopping early when the player has to
   * decide something or a crisis interrupt arrived (the same day it happened).
   */
  step(days) {
    if (!this.state) return 0;
    let done = 0;
    for (let i = 0; i < days; i++) {
      this.pendingInterrupt = null;
      this.sim.advanceDay(this.state);
      done++;
      this.autoDecideEvents();
      if (this.pendingInterrupt) {
        const info = { ...this.pendingInterrupt, speedBefore: this.clock.speed };
        this.pendingInterrupt = null;
        this.lastInterrupt = info;
        if (this.clock.speed > 0) this.autoPausedSpeed = this.clock.speed;
        this.setSpeed(0);
        this.bus.emit('interrupted', info);
        break;
      }
      if (this.hasPendingPlayerEvent && this.settings.pauseOnEvents !== false) {
        this.autoPausedSpeed = this.clock.speed;
        this.setSpeed(0);
        break;
      }
    }
    return done;
  }

  /** Called every animation frame with the elapsed wall time. */
  update(elapsedMs) {
    const days = this.clock.update(elapsedMs);
    return days ? this.step(days) : 0;
  }

  /** Execute a command for the player country (countryId defaults to the player). */
  execute(cmd) {
    const full = { countryId: this.state.playerId, ...cmd };
    this.pendingInterrupt = null;
    const result = executeCommand(this.state, full, this.sim.context(this.state));
    // a command can itself start a war (declareWar): stop the clock right away
    if (this.pendingInterrupt) {
      const info = { ...this.pendingInterrupt, speedBefore: this.clock.speed };
      this.pendingInterrupt = null;
      this.lastInterrupt = info;
      this.setSpeed(0);
      this.bus.emit('interrupted', info);
    }
    // The game paused itself for an event: resume once the last decision is made.
    if (result.ok && cmd.type === 'resolveEvent' && !this.hasPendingPlayerEvent && this.autoPausedSpeed) {
      this.setSpeed(this.autoPausedSpeed);
      this.autoPausedSpeed = 0;
    }
    return result;
  }

  validate(cmd) {
    return validateCommand(this.state, { countryId: this.state.playerId, ...cmd });
  }
}
