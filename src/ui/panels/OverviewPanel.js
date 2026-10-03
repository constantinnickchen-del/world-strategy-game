import { formatBn, formatPct, formatSignedPct, formatPopulation, esc } from '../../util/format.js';
import { debtRatio } from '../../state/selectors.js';
import { TECH_BY_ID } from '../../data/technologies.js';
import { techCost } from '../../systems/technology.js';
import { GOVERNMENTS, IDEOLOGIES } from '../../data/governments.js';
import { formatDateDE } from '../../core/calendar.js';
import { section, stat, meter, actionButton, signClass } from '../widgets.js';
import { gdpTip, budgetTip, approvalTip, stabilityTip } from '../tips.js';

/** Situation report: concrete hints derived from the current state. */
export function advisorNotes(state, c) {
  const e = c.economy;
  const notes = [];
  const deficit = (-e.lastBalance * 12) / e.gdp;
  if (!c.technology.current) notes.push({ tone: 'warn', text: 'Es läuft kein Forschungsprojekt.', panel: 'research', label: 'Forschung wählen' });
  if (deficit > 0.05) notes.push({ tone: 'bad', text: `Haushaltsdefizit von ${formatPct(deficit)} des BIP – die Schulden wachsen schnell.`, panel: 'economy', label: 'Haushalt' });
  if (debtRatio(c) > e.debtTolerance) notes.push({ tone: 'bad', text: `Schuldenquote über der Toleranz der Märkte (${formatPct(e.debtTolerance, 0)}): steigende Zinsen.`, panel: 'economy', label: 'Haushalt' });
  if (e.inflation > 0.06) notes.push({ tone: 'bad', text: `Hohe Inflation (${formatPct(e.inflation)}) belastet Zustimmung und Wachstum.`, panel: 'economy', label: 'Wirtschaft' });
  if (c.politics.approval < 35) notes.push({ tone: 'bad', text: 'Die Zustimmung ist gefährlich niedrig – Proteste drohen.', panel: 'politics', label: 'Politik' });
  if (c.trade.unmetValue > e.gdp * 0.002) notes.push({ tone: 'warn', text: 'Rohstoffengpässe bremsen die Wirtschaft.', panel: 'trade', label: 'Handel' });
  if (e.treasury > e.gdp * 0.05 && e.debt > 0) notes.push({ tone: 'info', text: 'Die Staatskasse ist gut gefüllt – Schulden tilgen senkt die Zinslast.', panel: 'economy', label: 'Tilgen' });
  if (c.politics.nextElection && c.politics.nextElection - state.time.day < 180) notes.push({ tone: 'info', text: `Wahl am ${formatDateDE(c.politics.nextElection)} – aktuelle Zustimmung ${Math.round(c.politics.approval)}.`, panel: 'politics', label: 'Politik' });
  if (!notes.length) notes.push({ tone: 'good', text: 'Keine dringenden Probleme. Nutzen Sie die Zeit für Reformen und Diplomatie.' });
  return notes;
}

export const OverviewPanel = {
  id: 'overview',
  title: 'Lagebericht',
  render(ui) {
    const state = ui.session.state;
    const c = ui.session.player;
    const e = c.economy;
    const t = c.technology;
    const tech = t.current ? TECH_BY_ID[t.current] : null;
    const progress = tech ? (t.progress[tech.id] ?? 0) / techCost(state, tech.id) : 0;
    const notes = advisorNotes(state, c)
      .map((n) => `<li class="note note-${n.tone}"><span>${esc(n.text)}</span>${n.panel ? actionButton(n.label, 'openPanel', { panel: n.panel }, { cls: 'btn-small' }) : ''}</li>`)
      .join('');
    return `
      ${section('Berater', `<ul class="notes">${notes}</ul>`, { tut: 'advisor' })}
      ${section(
        'Kennzahlen',
        `<div class="stat-grid">
          ${stat('BIP', formatBn(e.gdp), { tip: gdpTip(c) })}
          ${stat('Wachstum', `<span class="${signClass(e.growth)}">${formatSignedPct(e.growth)}</span>`, { tip: gdpTip(c) })}
          ${stat('Haushaltssaldo / Monat', `<span class="${signClass(e.lastBalance)}">${formatBn(e.lastBalance)}</span>`, { tip: budgetTip(c) })}
          ${stat('Schuldenquote', formatPct(debtRatio(c), 0))}
          ${stat('Bevölkerung', formatPopulation(c.population))}
          ${stat('Regierung', `${GOVERNMENTS[c.politics.government].name}`, { tip: IDEOLOGIES[c.politics.ideology].name })}
        </div>
        <div class="meters">
          <div data-tip="${esc(stabilityTip(c))}"><span class="meter-label">Stabilität <b class="num">${Math.round(c.politics.stability)}</b></span>${meter(c.politics.stability)}</div>
          <div data-tip="${esc(approvalTip(c))}"><span class="meter-label">Zustimmung <b class="num">${Math.round(c.politics.approval)}</b></span>${meter(c.politics.approval)}</div>
        </div>`,
      )}
      ${section(
        'Forschung',
        tech
          ? `<p><b>${esc(tech.name)}</b> <span class="muted">· ${Math.round(progress * 100)} %</span></p>${meter(progress * 100, { tone: 'teal' })}`
          : `<p class="muted">Kein aktives Projekt.</p>${actionButton('Forschung wählen', 'openPanel', { panel: 'research' }, { cls: 'btn-primary' })}`,
      )}
      ${section('Entwicklung', `<div class="multiples">
          <figure><figcaption>BIP</figcaption><div class="chart" data-chart="gdp"></div></figure>
          <figure><figcaption>Zustimmung</figcaption><div class="chart" data-chart="approval"></div></figure>
          <figure><figcaption>Inflation</figcaption><div class="chart" data-chart="inflation"></div></figure>
          <figure><figcaption>Schuldenquote</figcaption><div class="chart" data-chart="debt"></div></figure>
        </div>`)}`;
  },
  charts(ui) {
    const state = ui.session.state;
    const h = ui.session.player.history;
    const endDay = state.time.day;
    return {
      gdp: { values: h.gdp, endDay, format: formatBn, label: 'BIP' },
      approval: { values: h.approval, endDay, format: (v) => v.toFixed(0), label: 'Zustimmung' },
      inflation: { values: h.inflation, endDay, format: (v) => formatPct(v), baseline: 0, label: 'Inflation' },
      debt: { values: h.debtRatio, endDay, format: (v) => formatPct(v, 0), label: 'Schuldenquote' },
    };
  },
};
