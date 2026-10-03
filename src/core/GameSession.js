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
 */
import { EventBus } from './EventBus.js';
import { GameClock } from './GameClock.js';
import { Simulation } from './Simulation.js';
import { createGameState } from '../state/createGameState.js';
import { executeCommand, validateCommand } from '../commands/commands.js';
import { addNews } from '../systems/news.js';
import { formatDateDE } from './calendar.js';

export class GameSession {
  constructor({ bus = new EventBus(), settings = {} } = {}) {
    this.bus = bus;
    this.settings = settings;
    this.clock = new GameClock();
    this.sim = new Simulation({ bus });
    this.state = null;
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

  /** Advance the simulation by `days`, stopping early when the player has to decide something. */
  step(days) {
    if (!this.state) return 0;
    let done = 0;
    for (let i = 0; i < days; i++) {
      this.sim.advanceDay(this.state);
      done++;
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
    const result = executeCommand(this.state, full, this.sim.context(this.state));
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
