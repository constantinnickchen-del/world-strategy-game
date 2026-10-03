/**
 * Shows pending player events one at a time. Each option lists its concrete,
 * already-resolved effects, so the player knows exactly what a choice does.
 */
import { EVENT_BY_ID } from '../../data/events.js';
import { eventText, PLAYER_EVENT_TIMEOUT_DAYS } from '../../systems/events.js';
import { describeEffects } from '../../systems/effects.js';
import { formatDateDE } from '../../core/calendar.js';
import { esc } from '../../util/format.js';

export class EventModal {
  constructor(ui) {
    this.ui = ui;
    this.open = null;
    this.uid = null;
  }

  sync() {
    const state = this.ui.session.state;
    const next = state?.events.pending[0];
    if (!next) {
      this.open?.close();
      this.open = null;
      this.uid = null;
      return;
    }
    if (this.uid === next.uid && this.open) return;
    this.open?.close();
    this.uid = next.uid;
    const def = EVENT_BY_ID[next.eventId];
    const country = state.countries[next.countryId];
    const options = next.options
      .map((o, i) => {
        const effects = describeEffects(state, country, o.effects, { otherId: next.otherId })
          .map((e) => `<li class="${e.positive ? 'good' : 'bad'}">${esc(e.text)}</li>`)
          .join('');
        return `<button class="event-option" data-cmd="${esc(JSON.stringify({ type: 'resolveEvent', uid: next.uid, option: i }))}" ${i === 0 ? 'autofocus' : ''}>
            <span class="event-option-label">${esc(o.label)}</span>
            <ul class="event-effects">${effects || '<li class="muted">Keine direkten Auswirkungen</li>'}</ul>
          </button>`;
      })
      .join('');
    const more = state.events.pending.length > 1 ? `<p class="muted small">Weitere ${state.events.pending.length - 1} Entscheidung(en) warten.</p>` : '';
    this.open = this.ui.modals.open({
      title: esc(def.title),
      className: 'event-modal',
      dismissible: false,
      body: `<p class="event-date muted num">${formatDateDE(next.day)}</p>
        <p class="event-text">${esc(eventText(state, next))}</p>
        <div class="event-options">${options}</div>
        ${more}
        <p class="muted small">Ohne Entscheidung wählen Ihre Berater nach ${PLAYER_EVENT_TIMEOUT_DAYS} Tagen selbst.</p>`,
      onClose: () => {
        this.open = null;
      },
    });
  }
}
