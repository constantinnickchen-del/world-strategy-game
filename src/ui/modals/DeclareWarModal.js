/**
 * War declaration dialog: choose war goals, see who will join each side,
 * compare strength and read the political consequences before confirming.
 * Every number comes from the game state (power, alliances, claims).
 */
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { alliesOf, hasTreaty, getOpinion } from '../../systems/diplomacy.js';
import { willJoinWar, regionWeight } from '../../systems/war/wars.js';
import { friendlyCountries } from '../../systems/war/movement.js';
import { formatBn, formatNumber, esc } from '../../util/format.js';
import { flag } from '../widgets.js';

const MAX_GOALS = 8;

export class DeclareWarModal {
  constructor(ui) {
    this.ui = ui;
    this.modal = null;
  }

  candidates(targetId) {
    const state = this.ui.session.state;
    const p = state.playerId;
    const friends = friendlyCountries(state, p);
    const t = state.countries[targetId];
    const list = t.regionIds.map((rid) => {
      const r = state.regions[rid];
      const s = STATIC_REGIONS[rid];
      const claimed = r.claims.includes(p) || r.cores.includes(p);
      const border = s.neighbors.some((n) => friends.has(state.regions[n]?.controller));
      return { rid, claimed, border, weight: regionWeight(state, rid) };
    });
    return list
      .filter((x) => x.claimed || x.border)
      .sort((a, b) => Number(b.claimed) - Number(a.claimed) || Number(b.border) - Number(a.border) || b.weight - a.weight)
      .slice(0, 30)
      .concat(list.filter((x) => !x.claimed && !x.border).sort((a, b) => b.weight - a.weight).slice(0, 6));
  }

  open(targetId, regionId = null) {
    const state = this.ui.session.state;
    const t = state.countries[targetId];
    if (!t) return;
    this.targetId = targetId;
    const cands = this.candidates(targetId);
    this.goals = new Set();
    if (regionId && state.regions[regionId]?.owner === targetId) this.goals.add(regionId);
    for (const c of cands) if (c.claimed && this.goals.size < 3) this.goals.add(c.rid);
    if (!this.goals.size && cands[0]) this.goals.add(cands[0].rid);
    this.reparations = false;
    this.modal = this.ui.modals.open({
      title: `Krieg gegen ${esc(t.name)}`,
      className: 'war-modal',
      body: this.body(),
      onRender: (el) => this.bind(el),
      onClose: () => {
        this.modal = null;
      },
    });
  }

  command() {
    const state = this.ui.session.state;
    const goals = [...this.goals].map((regionId) => ({ type: 'region', regionId }));
    if (this.reparations) goals.push({ type: 'reparations', amount: Math.round(state.countries[this.targetId].economy.gdp * 0.05 * 10) / 10 });
    return { type: 'declareWar', targetId: this.targetId, goals };
  }

  /** Who joins which side if the war started now (same rules as declareWar()). */
  forecast() {
    const state = this.ui.session.state;
    const p = state.playerId;
    const t = this.targetId;
    const war = { attackers: [p], defenders: [t] };
    const defenders = [t];
    for (const ally of alliesOf(state, t)) {
      if (ally === p) continue;
      if (willJoinWar(state, ally, war, 'defenders')) defenders.push(ally);
    }
    const attackers = [p];
    for (const ally of alliesOf(state, p)) {
      if (defenders.includes(ally)) continue;
      if (getOpinion(state, ally, t) < -40 && willJoinWar(state, ally, war, 'attackers')) attackers.push(ally);
    }
    const power = (ids) => ids.reduce((s, id) => s + state.countries[id].military.power, 0);
    return { attackers, defenders, attackPower: power(attackers), defensePower: power(defenders) };
  }

  body() {
    const ui = this.ui;
    const state = ui.session.state;
    const p = state.playerId;
    const t = state.countries[this.targetId];
    const cmd = this.command();
    const error = ui.session.validate(cmd);
    const fc = this.forecast();
    const ratio = fc.attackPower / Math.max(1, fc.defensePower);
    const claimed = [...this.goals].some((rid) => state.regions[rid].claims.includes(p) || state.regions[rid].cores.includes(p));
    const goalRows = this.candidates(this.targetId)
      .map((c) => {
        const s = STATIC_REGIONS[c.rid];
        const r = state.regions[c.rid];
        const checked = this.goals.has(c.rid);
        const disabled = !checked && this.goals.size >= MAX_GOALS;
        return `<label class="goal-row${checked ? ' is-on' : ''}">
            <input type="checkbox" data-goal="${c.rid}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
            <span class="goal-name">${esc(s.name)}</span>
            <span class="goal-tags">${c.claimed ? '<span class="chip chip-warn">Anspruch</span>' : ''}${c.border ? '<span class="chip">Grenze</span>' : '<span class="chip">Landung nötig</span>'}</span>
            <span class="num muted">${formatBn(r.econ)} · ${formatNumber(r.population / 1e6, 1)} Mio.</span>
          </label>`;
      })
      .join('');
    const side = (ids, power) => `<ul class="list">${ids.map((id) => `<li><span>${flag(state.countries[id])} ${esc(state.countries[id].name)}</span><span class="num">${formatNumber(state.countries[id].military.power)}</span></li>`).join('')}
        <li class="list-sum"><span>Summe Militärstärke</span><span class="num">${formatNumber(power)}</span></li></ul>`;
    const consequences = [
      claimed ? 'Legitimer Kriegsgrund (Anspruch): Stabilität −3.' : '<span class="bad">Angriffskrieg ohne Anspruch: Stabilität −10, Zustimmung −6, deutliche Verurteilung durch die Freunde des Gegners.</span>',
      `Handelsabkommen mit ${esc(t.name)} endet, Meinung −40.`,
      fc.defenders.length > 1 ? `<span class="bad">Bündnisfall: ${fc.defenders.slice(1).map((id) => esc(state.countries[id].name)).join(', ')} ${fc.defenders.length > 2 ? 'treten' : 'tritt'} voraussichtlich bei.</span>` : 'Keine Verbündeten des Gegners werden voraussichtlich eingreifen.',
      t.military.deterrent ? '<span class="bad">Der Gegner verfügt über strategische Abschreckung – die Weltgemeinschaft reagiert besonders alarmiert.</span>' : '',
      'Der Gegner mobilisiert sofort. Kriegsmüdigkeit belastet über die Zeit Wirtschaft und Zustimmung.',
      hasTreaty(state, p, t.id, 'trade') ? 'Ihr Handelsabkommen wird aufgehoben.' : '',
    ].filter(Boolean);
    return `<p class="muted small">Kriegsziele sind die Regionen, die Sie im Frieden fordern wollen. Erobert werden kann jede feindliche Region – Ziele zählen im Frieden aber mehr und machen den Krieg mit Anspruch legitimer.</p>
      <div class="war-modal-grid">
        <section class="card"><header class="card-head"><h3>Kriegsziele (${this.goals.size}/${MAX_GOALS})</h3></header>
          <div class="goal-list">${goalRows || '<p class="muted small">Keine erreichbaren Regionen.</p>'}</div>
          <label class="goal-row${this.reparations ? ' is-on' : ''}"><input type="checkbox" data-reparations${this.reparations ? ' checked' : ''}><span class="goal-name">Reparationen fordern</span><span class="num muted">${formatBn(t.economy.gdp * 0.05)}</span></label>
        </section>
        <section class="card"><header class="card-head"><h3>Kräfteverhältnis</h3><span class="num ${ratio >= 1.3 ? 'good' : ratio < 0.8 ? 'bad' : ''}">${ratio.toFixed(2)} : 1</span></header>
          <h4 class="sub-head">Angreifer</h4>${side(fc.attackers, fc.attackPower)}
          <h4 class="sub-head">Verteidiger (voraussichtlich)</h4>${side(fc.defenders, fc.defensePower)}
        </section>
      </div>
      <section class="card"><header class="card-head"><h3>Folgen</h3></header><ul class="consequences">${consequences.map((x) => `<li>${x}</li>`).join('')}</ul></section>
      ${error ? `<p class="bad">Nicht möglich: ${esc(error)}</p>` : ''}
      <div class="btn-row">
        <button class="btn btn-danger" data-declare${error ? ' disabled' : ''}>Krieg erklären</button>
        <button class="btn" data-modal-close>Abbrechen</button>
      </div>`;
  }

  bind(el) {
    // setBody() re-renders into the same element: attach delegated listeners once
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.goal) {
        if (t.checked) this.goals.add(t.dataset.goal);
        else this.goals.delete(t.dataset.goal);
      } else if (t.hasAttribute('data-reparations')) this.reparations = t.checked;
      else return;
      const scroll = el.querySelector('.goal-list')?.scrollTop ?? 0;
      this.modal.setBody(this.body());
      const list = this.modal.el.querySelector('.goal-list');
      if (list) list.scrollTop = scroll;
    });
    el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-declare]');
      if (!btn || btn.disabled) return;
      const res = this.ui.execute(this.command());
      if (res.ok) {
        this.modal?.close();
        this.ui.openWarsPanel(res.warId);
      }
    });
  }
}
