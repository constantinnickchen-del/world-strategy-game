/**
 * Shows pending player events one at a time. Each option lists its concrete,
 * already-resolved effects, so the player knows exactly what a choice does.
 * Crisis events (war outbreaks, attacks, alliance calls) additionally show a
 * situation analysis built from the game state; options that are not
 * possible right now are disabled with the reason.
 */
import { EVENT_BY_ID } from '../../data/events.js';
import { eventText, eventTitle, optionUnavailable, PLAYER_EVENT_TIMEOUT_DAYS } from '../../systems/events.js';
import { describeEffects } from '../../systems/effects.js';
import { warById } from '../../systems/war/queries.js';
import { getOpinion, hasTreaty } from '../../systems/diplomacy.js';
import { formatDateDE } from '../../core/calendar.js';
import { formatNumber, formatBn, esc } from '../../util/format.js';
import { flag } from '../widgets.js';

function analysis(state, inst) {
  const p = state.playerId;
  const war = inst.data?.warId ? warById(state, inst.data.warId) : null;
  const attackerId = inst.data?.attacker;
  const defenderId = inst.data?.defender;
  if (!attackerId || !defenderId) return '';
  const sideIds = (side, fallback) => (war ? war[side] : [fallback]);
  const power = (ids) => ids.reduce((s, id) => s + (state.countries[id]?.military.power ?? 0), 0);
  const row = (id) => {
    const c = state.countries[id];
    const trade = c.trade.partners.find((x) => x.id === p);
    return `<li><span>${flag(c)} ${esc(c.name)}</span><span class="num muted">Stärke ${formatNumber(c.military.power)} · Meinung ${id === p ? '–' : Math.round(getOpinion(state, p, id))}${trade ? ` · Handel ${formatBn(trade.value)}/J.` : ''}${id !== p && hasTreaty(state, p, id, 'alliance') ? ' · <b>Bündnis</b>' : ''}</span></li>`;
  };
  const a = sideIds('attackers', attackerId);
  const d = sideIds('defenders', defenderId);
  return `<details class="crisis-analysis" open><summary>Lage analysieren</summary>
      <div class="war-sides">
        <div><h4 class="sub-head">Angreifer · ${formatNumber(power(a))}</h4><ul class="list">${a.map(row).join('')}</ul></div>
        <div><h4 class="sub-head">Verteidiger · ${formatNumber(power(d))}</h4><ul class="list">${d.map(row).join('')}</ul></div>
      </div>
      ${war ? `<p class="small muted">Kriegsziele: ${war.goals.filter((g) => g.type === 'region').length} Regionen. Die Kriegsübersicht (⚔) zeigt Fronten und Verlauf.</p>` : ''}
    </details>`;
}

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
        const effects = describeEffects(state, country, o.effects, { otherId: next.otherId, data: next.data })
          .map((e) => `<li class="${e.positive ? 'good' : 'bad'}">${esc(e.text)}</li>`)
          .join('');
        const blocked = optionUnavailable(state, next, i);
        return `<button class="event-option${blocked ? ' is-blocked' : ''}" data-cmd="${esc(JSON.stringify({ type: 'resolveEvent', uid: next.uid, option: i }))}"${blocked ? ' disabled aria-disabled="true"' : ''}>
            <span class="event-option-label">${esc(o.label)}</span>
            <ul class="event-effects">${effects || '<li class="muted">Keine direkten Auswirkungen</li>'}</ul>
            ${blocked ? `<span class="small bad">Nicht möglich: ${esc(blocked)}</span>` : ''}
          </button>`;
      })
      .join('');
    const more = state.events.pending.length > 1 ? `<p class="muted small">Weitere ${state.events.pending.length - 1} Entscheidung(en) warten.</p>` : '';
    const interrupt = this.ui.session.lastInterrupt;
    const paused = def.crisis && interrupt && interrupt.day === next.day ? `<p class="crisis-paused small">⏸ Die Simulation wurde am ${formatDateDE(interrupt.day)} automatisch angehalten.</p>` : '';
    this.open = this.ui.modals.open({
      title: esc(eventTitle(state, next)),
      className: `event-modal${def.crisis ? ' is-crisis' : ''}`,
      dismissible: false,
      body: `<p class="event-date muted num">${formatDateDE(next.day)}</p>
        ${paused}
        <p class="event-text">${esc(eventText(state, next))}</p>
        ${def.crisis ? analysis(state, next) : ''}
        <div class="event-options">${options}</div>
        ${more}
        <p class="muted small">Ohne Entscheidung wählen Ihre Berater nach ${PLAYER_EVENT_TIMEOUT_DAYS} Tagen selbst.</p>`,
      onClose: () => {
        this.open = null;
      },
    });
    this.open.el.querySelector('.event-option:not([disabled])')?.focus();
  }
}
