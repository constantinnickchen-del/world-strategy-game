import { GOVERNMENTS, IDEOLOGIES } from '../../data/governments.js';
import { approvalFactors, stabilityFactors } from '../../systems/politics.js';
import { techModifiers, STATS, formatModValue, isPositiveMod } from '../../systems/modifiers.js';
import { formatDateDE } from '../../core/calendar.js';
import { esc } from '../../util/format.js';
import { section, meter, factorTable } from '../widgets.js';

export const PoliticsPanel = {
  id: 'politics',
  title: 'Innenpolitik',
  render(ui) {
    const state = ui.session.state;
    const c = ui.session.player;
    const p = c.politics;
    const gov = GOVERNMENTS[p.government];
    const mods = c.modifiers
      .map((m) => {
        const left = m.until === null ? 'dauerhaft' : `bis ${formatDateDE(m.until, { long: false })}`;
        return `<li><span>${esc(m.label || STATS[m.stat].label)}</span><span class="${isPositiveMod(m.stat, m.value) ? 'good' : 'bad'}">${STATS[m.stat].label} ${formatModValue(m.stat, m.value)}</span><span class="muted small">${left}</span></li>`;
      })
      .join('');
    const tech = Object.entries(techModifiers(c))
      .map(([stat, v]) => `<li><span>${STATS[stat].label}</span><span class="${isPositiveMod(stat, v) ? 'good' : 'bad'}">${formatModValue(stat, v)}</span></li>`)
      .join('');
    return `
      ${section(
        'Regierung',
        `<p><b>${gov.name}</b> · <span style="color:${IDEOLOGIES[p.ideology].color}">●</span> ${IDEOLOGIES[p.ideology].name}</p>
         <p class="muted small">${
           p.nextElection
             ? `Nächste Wahl: <b>${formatDateDE(p.nextElection)}</b>. Die Regierung wird bei einer Zustimmung ab etwa ${gov.reelectionThreshold} wiedergewählt, sonst kommt es zum Regierungswechsel.`
             : 'Keine freien Wahlen. Sinkt die Stabilität stark, drohen Unruhen und Putschversuche.'
         }</p>`,
      )}
      ${section('Zustimmung', `<div class="meter-big"><b class="num">${Math.round(p.approval)}</b>${meter(p.approval)}</div><p class="muted small">Zielwert, auf den sich die Zustimmung zubewegt:</p>${factorTable(approvalFactors(c))}<div class="chart" data-chart="approval"></div>`)}
      ${section('Stabilität', `<div class="meter-big"><b class="num">${Math.round(p.stability)}</b>${meter(p.stability)}</div><p class="muted small">Zielwert, auf den sich die Stabilität zubewegt:</p>${factorTable(stabilityFactors(c))}<div class="chart" data-chart="stability"></div>`)}
      ${section('Aktive Effekte', mods ? `<ul class="mod-list">${mods}</ul>` : '<p class="muted small">Keine zeitlich begrenzten Effekte aktiv.</p>')}
      ${section('Technologieeffekte', tech ? `<ul class="mod-list">${tech}</ul>` : '<p class="muted small">Noch keine Technologien erforscht.</p>')}
      <p class="muted small">Stand: ${formatDateDE(state.time.day)}</p>`;
  },
  charts(ui) {
    const h = ui.session.player.history;
    const endDay = ui.session.state.time.day;
    return {
      approval: { values: h.approval, endDay, format: (v) => v.toFixed(0), label: 'Zustimmung' },
      stability: { values: h.stability, endDay, format: (v) => v.toFixed(0), label: 'Stabilität' },
    };
  },
};
