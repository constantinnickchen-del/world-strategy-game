/**
 * Right-hand information panel for the selected country (any country).
 * For foreign countries it offers the diplomatic actions of the player.
 */
import { GOVERNMENTS, IDEOLOGIES } from '../../data/governments.js';
import { gdpPerCapita, debtRatio } from '../../state/selectors.js';
import { getOpinion, hasTreaty, hasEmbargo, evaluateProposal, TREATIES } from '../../systems/diplomacy.js';
import { neighborCountryIds } from '../../state/worldIndex.js';
import { improveRelationsCost } from '../../commands/commands.js';
import { formatBn, formatPct, formatSignedPct, formatPopulation, formatUsd, esc } from '../../util/format.js';
import { flag, stat, meter, opinionBar, section, cmdButton, actionButton, signClass, tipAttr } from '../widgets.js';
import { gdpTip, approvalTip, stabilityTip, debtTip } from '../tips.js';

export function countryLink(state, id) {
  const c = state.countries[id];
  if (!c) return esc(id);
  return `<button class="link" data-action="selectCountry" data-id="${c.id}">${flag(c)} ${esc(c.name)}</button>`;
}

function proposalTip(state, from, to, treaty) {
  const v = evaluateProposal(state, from, to, treaty);
  const rows = v.reasons.map((r) => `<tr><td>${esc(r.text)}</td><td class="${signClass(r.value)}">${r.value > 0 ? '+' : ''}${r.value}</td></tr>`).join('');
  return `<b>${TREATIES[treaty].name} vorschlagen</b><br><span class="${v.accept ? 'good' : 'bad'}">${v.accept ? 'Würde wahrscheinlich annehmen' : 'Würde ablehnen'}</span><table class="tip-table">${rows}<tr class="tip-sum"><td>Summe</td><td>${v.score}</td></tr></table>`;
}

export class InfoPanel {
  constructor(el, ui) {
    this.el = el;
    this.ui = ui;
  }

  render() {
    const ui = this.ui;
    const state = ui.session.state;
    const id = ui.selected;
    const c = state?.countries[id];
    this.el.hidden = !c;
    if (!c) return;
    const p = state.playerId;
    const isPlayer = id === p;
    const e = c.economy;
    const ranks = ui.ranks();
    const head = `<header class="info-head">
        <div class="info-flag">${flag(c)}</div>
        <div class="info-title"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.formalName ?? '')}</p></div>
        <button class="icon-btn" data-action="selectCountry" data-id="" aria-label="Auswahl schließen">✕</button>
      </header>
      <div class="chips">
        <span class="chip">${GOVERNMENTS[c.politics.government].name}</span>
        <span class="chip" style="--chip:${IDEOLOGIES[c.politics.ideology].color}">${IDEOLOGIES[c.politics.ideology].name}</span>
        ${isPlayer ? '<span class="chip chip-brass">Ihr Land</span>' : ''}
      </div>`;
    const stats = `<div class="stat-grid">
        ${stat('BIP', formatBn(e.gdp), { tip: gdpTip(c) })}
        ${stat('Weltrang BIP', `#${ranks.gdp[id] ?? '–'}`)}
        ${stat('BIP pro Kopf', formatUsd(gdpPerCapita(c)))}
        ${stat('Wachstum', `<span class="${signClass(e.growth)}">${formatSignedPct(e.growth)}</span>`, { tip: gdpTip(c) })}
        ${stat('Bevölkerung', formatPopulation(c.population))}
        ${stat('Inflation', formatPct(e.inflation))}
        ${stat('Schuldenquote', formatPct(debtRatio(c), 0), { tip: debtTip(c) })}
        ${stat('Militär (Rang)', `#${ranks.military[id] ?? '–'}`)}
      </div>
      <div class="meters">
        <div${tipAttr(stabilityTip(c))}><span class="meter-label">Stabilität <b class="num">${Math.round(c.politics.stability)}</b></span>${meter(c.politics.stability)}</div>
        <div${tipAttr(approvalTip(c))}><span class="meter-label">Zustimmung <b class="num">${Math.round(c.politics.approval)}</b></span>${meter(c.politics.approval)}</div>
      </div>`;
    const chart = section('Wirtschaftsleistung', '<div class="chart" data-chart="infoGdp"></div>');

    let diplomacy = '';
    if (!isPlayer && p) {
      const opinion = getOpinion(state, p, id);
      const treaties = Object.keys(TREATIES).filter((t) => hasTreaty(state, p, id, t));
      const embargoOut = hasEmbargo(state, p, id);
      const embargoIn = hasEmbargo(state, id, p);
      const cost = formatBn(improveRelationsCost(ui.session.player));
      const proposals = Object.keys(TREATIES)
        .filter((t) => !hasTreaty(state, p, id, t))
        .map((t) => cmdButton(ui, `${TREATIES[t].name} vorschlagen`, { type: 'proposeTreaty', targetId: id, treaty: t }, { tip: proposalTip(state, p, id, t) }))
        .join('');
      const cancels = treaties
        .map((t) => cmdButton(ui, `${TREATIES[t].name} kündigen`, { type: 'cancelTreaty', targetId: id, treaty: t }, { cls: 'btn-danger', confirm: `${TREATIES[t].name} mit ${c.name} wirklich kündigen? Die Beziehungen verschlechtern sich deutlich.` }))
        .join('');
      diplomacy = section(
        'Beziehungen zu Ihnen',
        `<div class="opinion-row"><span class="num ${signClass(opinion)}">${opinion > 0 ? '+' : ''}${Math.round(opinion)}</span>${opinionBar(opinion)}</div>
         <p class="muted small">${treaties.length ? treaties.map((t) => TREATIES[t].name).join(' · ') : 'Keine Verträge'}${embargoOut ? ' · <span class="bad">Ihr Embargo</span>' : ''}${embargoIn ? ' · <span class="bad">Embargo gegen Sie</span>' : ''}</p>
         <div class="btn-col">
           ${cmdButton(ui, 'Beziehungen verbessern', { type: 'improveRelations', targetId: id }, { cls: 'btn-primary', tip: `Diplomatische Initiative: +8 Meinung, Kosten ${cost}. Danach 180 Tage Pause.` })}
           ${proposals}
           ${cancels}
           ${cmdButton(ui, embargoOut ? 'Embargo aufheben' : 'Handelsembargo verhängen', { type: 'setEmbargo', targetId: id, active: !embargoOut }, { cls: embargoOut ? '' : 'btn-danger', confirm: embargoOut ? '' : `Handelsembargo gegen ${c.name} verhängen? Der Handel wird vollständig unterbrochen und die Beziehungen leiden.` })}
         </div>`,
      );
    } else if (isPlayer) {
      diplomacy = section(
        'Regierung',
        `<p class="muted small">Sie regieren dieses Land. Steuern, Haushalt und Forschung steuern Sie über die Navigation links.</p>
         <div class="btn-row">${actionButton('Wirtschaft', 'openPanel', { panel: 'economy' })}${actionButton('Politik', 'openPanel', { panel: 'politics' })}${actionButton('Forschung', 'openPanel', { panel: 'research' })}</div>`,
      );
    }

    const partners = c.trade.partners.length
      ? `<ul class="list">${c.trade.partners.map((pt) => `<li>${countryLink(state, pt.id)}<span class="num muted">${formatBn(pt.value)}/Jahr</span></li>`).join('')}</ul>`
      : '<p class="muted small">Kein Rohstoffhandel.</p>';
    const neighbors = neighborCountryIds(state, id);
    const nb = neighbors.length ? `<div class="tag-list">${neighbors.map((n) => countryLink(state, n)).join('')}</div>` : '<p class="muted small">Keine Landgrenzen.</p>';

    this.el.innerHTML = `<div class="panel-scroll">${head}${stats}${diplomacy}${chart}${section('Wichtigste Rohstoff-Handelspartner', partners)}${section('Nachbarn', nb)}</div>`;
  }

  charts() {
    const state = this.ui.session.state;
    const c = state?.countries[this.ui.selected];
    if (!c) return null;
    return { infoGdp: { values: c.history.gdp, endDay: state.time.day, format: (v) => formatBn(v), label: `BIP von ${c.name}` } };
  }
}
