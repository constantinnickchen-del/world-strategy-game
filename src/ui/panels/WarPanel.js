/**
 * War overview: every active war with sides, duration, fronts, war score,
 * superiority, casualties, goals – and for the player's wars the front
 * command and a peace negotiation with a deterministic acceptance forecast.
 */
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { activeWars, sideOf, otherSide, evaluatePeace, peaceTermsError, isCapitalRegion } from '../../systems/war/wars.js';
import { formatDateDE } from '../../core/calendar.js';
import { formatBn, formatNumber, esc } from '../../util/format.js';
import { section, cmdButton, actionButton, signClass, tipAttr, meter } from '../widgets.js';
import { countryLink } from '../components/InfoPanel.js';
import { warOutlook } from '../../systems/war/outlook.js';
import { sideSummary } from '../../systems/military/quickOrders.js';

/** Side-by-side force comparison with bars. */
function comparison(a, b, labels = ['Ihre Seite', 'Gegner']) {
  const rows = [
    ['Soldaten', 'soldiers'],
    ['Kampfverbände', 'units'],
    ['Panzer', 'tanks'],
    ['Geschütze', 'guns'],
    ['Kampfjets', 'fighters'],
    ['Flugzeuge gesamt', 'aircraft'],
    ['Kriegsschiffe', 'warships'],
    ['U-Boote', 'submarines'],
    ['Militärstärke', 'power'],
  ];
  return `<table class="data-table compare-table"><thead><tr><th></th><th class="num">${labels[0]}</th><th></th><th class="num">${labels[1]}</th></tr></thead><tbody>${rows
    .filter(([, k]) => (a[k] ?? 0) + (b[k] ?? 0) > 0)
    .map(([label, k]) => {
      const x = a[k] ?? 0;
      const y = b[k] ?? 0;
      const share = x + y > 0 ? (x / (x + y)) * 100 : 50;
      return `<tr><td>${label}</td><td class="num ${x >= y ? 'good' : ''}">${formatNumber(x)}</td><td class="cmp-cell"><div class="cmp-track"><span style="width:${share.toFixed(1)}%"></span></div></td><td class="num ${y > x ? 'bad' : ''}">${formatNumber(y)}</td></tr>`;
    })
    .join('')}</tbody></table>`;
}

/** The player's situation in a war: verdict, estimated duration, forces. */
function situation(ui, war, side) {
  const o = warOutlook(ui.session.state, war, side);
  const duration = o.months === null ? 'Noch zu früh für eine Schätzung' : o.months <= 1 ? 'Entscheidung steht kurz bevor' : `noch ca. ${o.months} Monate (Schätzung)`;
  return `<div class="war-situation tone-${o.tone}">
      <div class="war-verdict"><b>${o.verdict}</b><span class="small">${duration}</span></div>
      <ul class="war-reasons">${o.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>
    <h4 class="sub-head">Kräftevergleich</h4>
    ${comparison(o.own, o.enemy)}`;
}

function stanceButtons(ui) {
  const m = ui.session.player.military;
  const cur = m.autoFront === false ? null : (m.stance ?? 'balanced');
  const opts = [
    ['offensive', 'Angreifen', 'Der Generalstab greift an, sobald er nicht deutlich unterlegen ist – schnellere Eroberungen, höhere Verluste.'],
    ['balanced', 'Ausgewogen', 'Angriffe nur mit klarer Überlegenheit, sonst Front halten.'],
    ['defensive', 'Verteidigen', 'Front halten und nur eigene besetzte Gebiete zurückerobern – geringe Verluste.'],
  ];
  return `<div class="stance-row"><span class="small">Strategie des Generalstabs:</span><div class="seg-row">${opts
    .map(([id, label, tip]) => cmdButton(ui, label, { type: 'setFrontStance', stance: id }, { cls: cur === id ? 'btn-primary is-on' : '', tip }))
    .join('')}</div></div>`;
}

function duration(state, war) {
  const days = (war.endDay ?? state.time.day) - war.startDay;
  if (days < 60) return `${days} Tage`;
  const months = Math.round(days / 30.44);
  return months < 24 ? `${months} Monate` : `${(days / 365.25).toFixed(1)} Jahre`;
}

/** Occupation, sieges and front length of a war. */
export function warFronts(state, war) {
  const A = new Set(war.attackers);
  const D = new Set(war.defenders);
  let occByA = 0;
  let occByD = 0;
  let sieges = 0;
  const contested = new Set();
  for (const r of Object.values(state.regions)) {
    if (D.has(r.owner) && A.has(r.controller)) occByA++;
    if (A.has(r.owner) && D.has(r.controller)) occByD++;
    if (r.siege?.warId === war.id) sieges++;
    const sideR = A.has(r.controller) ? 'a' : D.has(r.controller) ? 'd' : null;
    if (!sideR) continue;
    for (const n of STATIC_REGIONS[r.id].neighbors) {
      const c = state.regions[n]?.controller;
      if ((sideR === 'a' && D.has(c)) || (sideR === 'd' && A.has(c))) contested.add(r.id);
    }
  }
  return { occByA, occByD, sieges, frontRegions: contested.size };
}

function sideList(state, war, side) {
  return war[side]
    .map((id) => `<li>${countryLink(state, id)}<span class="num muted" data-tip="Verluste (Personal) · Kriegsmüdigkeit">${formatNumber(war.casualties[id] ?? 0)} · ${Math.round(state.countries[id].military.exhaustion * 100)} %</span></li>`)
    .join('');
}

function scoreBar(score) {
  const v = Math.max(-100, Math.min(100, score));
  const left = v < 0 ? 50 + v / 2 : 50;
  return `<div class="opinion-bar war-score" role="meter" aria-valuenow="${Math.round(v)}" aria-valuemin="-100" aria-valuemax="100"><span class="${v < 0 ? 'neg' : 'pos'}" style="left:${left}%;width:${Math.abs(v) / 2}%"></span><i></i></div>`;
}

function peaceTip(state, war, side, terms) {
  const v = evaluatePeace(state, war, side, terms);
  const rows = v.reasons.map((r) => `<tr><td>${esc(r.text)}</td><td class="${signClass(r.value)}">${r.value > 0 ? '+' : ''}${r.value}</td></tr>`).join('');
  return `<b>${v.accept ? 'Würde voraussichtlich angenommen' : 'Würde abgelehnt'}</b><table class="tip-table">${rows}<tr class="tip-sum"><td>Ergebnis</td><td>${v.score}</td></tr></table>`;
}

function peaceBuilder(ui, war, side) {
  const state = ui.session.state;
  const p = state.playerId;
  if (war[side][0] !== p) return `<p class="muted small">Frieden verhandelt der Anführer Ihrer Kriegspartei (${esc(state.countries[war[side][0]].name)}).</p>`;
  const draft = ui.peaceDraft?.warId === war.id ? ui.peaceDraft : { warId: war.id, regions: [], reparations: 0 };
  const enemies = new Set(war[otherSide(side)]);
  const friends = new Set(war[side]);
  const occupied = Object.values(state.regions).filter((r) => enemies.has(r.owner) && friends.has(r.controller) && !isCapitalRegion(state, r.id));
  const goalIds = new Set(war.goals.filter((g) => g.type === 'region').map((g) => g.regionId));
  occupied.sort((a, b) => Number(goalIds.has(b.id)) - Number(goalIds.has(a.id)) || b.econ - a.econ);
  const enemyLeader = state.countries[war[otherSide(side)][0]];
  const terms = { regions: draft.regions.filter((rid) => occupied.some((r) => r.id === rid)), reparations: draft.reparations, reparationsFrom: enemyLeader.id };
  const termsError = peaceTermsError(state, war, side, terms);
  const verdict = termsError ? null : evaluatePeace(state, war, side, terms);
  const rows = occupied.length
    ? occupied
        .slice(0, 40)
        .map((r) => `<label class="goal-row${terms.regions.includes(r.id) ? ' is-on' : ''}"><input type="checkbox" data-action-change="togglePeaceRegion" data-war="${war.id}" data-region="${r.id}"${terms.regions.includes(r.id) ? ' checked' : ''}>
            <span class="goal-name">${esc(STATIC_REGIONS[r.id].name)}</span><span class="goal-tags">${goalIds.has(r.id) ? '<span class="chip chip-warn">Kriegsziel</span>' : ''}</span><span class="num muted">${formatBn(r.econ)}</span></label>`)
        .join('')
    : '<p class="muted small">Sie halten keine Regionen des Gegners besetzt. Forderungen nach Gebieten setzen eine Besetzung voraus.</p>';
  return `<div class="peace-builder">
      <div class="btn-row">${cmdButton(ui, 'Weißen Frieden anbieten', { type: 'proposePeace', warId: war.id, terms: { whitePeace: true } }, { tip: peaceTip(state, war, side, { whitePeace: true }) })}</div>
      <h4 class="sub-head">Forderungen an ${esc(enemyLeader.name)}</h4>
      <div class="goal-list">${rows}</div>
      <p class="muted small">Hauptstadtregionen können nicht abgetreten werden – kein Staat wird per Vertrag ganz annektiert.</p>
      <label class="field"><span>Reparationen (Mrd. $, max. ${formatBn(enemyLeader.economy.gdp * 0.3)})</span>
        <input type="number" min="0" step="1" max="${Math.floor(enemyLeader.economy.gdp * 0.3)}" value="${draft.reparations}" data-action-change="setPeaceReparations" data-war="${war.id}"></label>
      ${verdict ? `<p class="small">Prognose: <b class="${verdict.accept ? 'good' : 'bad'}">${verdict.accept ? 'Annahme wahrscheinlich' : 'Ablehnung'}</b> (Verhandlungsstärke ${verdict.score + verdict.needed} / benötigt ${verdict.needed})</p>` : ''}
      <div class="btn-row">${cmdButton(ui, 'Friedensvertrag vorschlagen', { type: 'proposePeace', warId: war.id, terms }, { cls: 'btn-primary', tip: verdict ? peaceTip(state, war, side, terms) : '' })}</div>
    </div>`;
}

function warCard(ui, war) {
  const state = ui.session.state;
  const p = state.playerId;
  const side = sideOf(war, p);
  const fronts = warFronts(state, war);
  const perspective = side === 'defenders' ? -war.score : war.score;
  const open = side ? !ui.collapsedWars.has(war.id) : ui.openWar === war.id;
  const goals = war.goals.map((g) => (g.type === 'region' ? esc(STATIC_REGIONS[g.regionId].name) : `Reparationen ${formatBn(g.amount)}`)).join(', ');
  const air = war.airSuperiority ?? 0.5;
  const sea = war.navalSuperiority ?? 0.5;
  const blockade = Object.entries(war.blockade ?? {}).filter(([, v]) => v > 0.02);
  const scoreLabel = side ? 'Kriegslage aus Ihrer Sicht' : `Kriegslage aus Sicht von ${esc(state.countries[war.attackers[0]].name)}`;
  const focusRegion = war.goals.find((g) => g.type === 'region')?.regionId ?? state.countries[war.defenders[0]].capitalRegion;
  const head = `<button class="war-head" data-action="toggleWar" data-war="${war.id}" aria-expanded="${open}">
      <span class="war-name">${side ? '⚔ ' : ''}${esc(war.name)}</span>
      <span class="num muted">${duration(state, war)}</span>
    </button>`;
  if (!open) {
    const mini = side ? warOutlook(state, war, side) : null;
    return `<div class="war-card${side ? ' is-player' : ''}">${head}<div class="war-mini">${scoreBar(perspective)}<span class="num ${signClass(perspective)}">${Math.round(perspective)}</span></div>${mini ? `<p class="small tone-${mini.tone} war-mini-verdict">${mini.verdict}</p>` : ''}</div>`;
  }
  const join = !side && war.status === 'active'
    ? `<div class="btn-row">${cmdButton(ui, `Für ${esc(state.countries[war.attackers[0]].name)} eintreten`, { type: 'joinWar', warId: war.id, side: 'attackers' }, { cls: 'btn-danger', confirm: `Dem ${war.name} auf Seite der Angreifer beitreten?` })}${cmdButton(ui, `Für ${esc(state.countries[war.defenders[0]].name)} eintreten`, { type: 'joinWar', warId: war.id, side: 'defenders' }, { cls: 'btn-danger', confirm: `Dem ${war.name} auf Seite der Verteidiger beitreten?` })}</div>`
    : '';
  const command = side
    ? `${stanceButtons(ui)}<label class="check"${tipAttr('Der Generalstab verteilt Ihre nicht manuell geführten Verbände auf Front, Angriffe und Verteidigung. Manuell befohlene Verbände bleiben unter Ihrer Kontrolle.')}><input type="checkbox" data-action-change="setAutoFront"${ui.session.player.military.autoFront !== false ? ' checked' : ''}> Front automatisch durch den Generalstab führen</label>`
    : '';
  const overviewBlock = side
    ? situation(ui, war, side)
    : `<h4 class="sub-head">Kräftevergleich</h4>${comparison(sideSummary(state, war.attackers), sideSummary(state, war.defenders), ['Angreifer', 'Verteidiger'])}`;
  return `<div class="war-card is-open${side ? ' is-player' : ''}">${head}
      <p class="small muted">Seit ${formatDateDE(war.startDay)} · Ziele: ${goals || '–'}</p>
      ${overviewBlock}
      <div class="war-sides">
        <div><h4 class="sub-head">Angreifer</h4><ul class="list">${sideList(state, war, 'attackers')}</ul></div>
        <div><h4 class="sub-head">Verteidiger</h4><ul class="list">${sideList(state, war, 'defenders')}</ul></div>
      </div>
      <div class="war-score-row"><span class="small">${scoreLabel}</span>${scoreBar(perspective)}<span class="num ${signClass(perspective)}">${Math.round(perspective)}</span></div>
      <div class="stat-grid">
        <div class="stat"><span class="stat-label">Besetzt durch Angreifer</span><span class="stat-value num">${fronts.occByA} Reg.</span></div>
        <div class="stat"><span class="stat-label">Besetzt durch Verteidiger</span><span class="stat-value num">${fronts.occByD} Reg.</span></div>
        <div class="stat"><span class="stat-label">Frontregionen</span><span class="stat-value num">${fronts.frontRegions}</span></div>
        <div class="stat"><span class="stat-label">Belagerungen</span><span class="stat-value num">${fronts.sieges}</span></div>
        <div class="stat"><span class="stat-label">Gewonnene Schlachten A/V</span><span class="stat-value num">${war.battles.attackers} / ${war.battles.defenders}</span></div>
      </div>
      <div class="sup-row"><span class="small">Luftherrschaft Angreifer</span>${meter(air * 100, { tone: air > 0.5 ? 'good' : 'bad' })}<span class="num small">${Math.round(air * 100)} %</span></div>
      <div class="sup-row"><span class="small">Seeherrschaft Angreifer</span>${meter(sea * 100, { tone: sea > 0.5 ? 'good' : 'bad' })}<span class="num small">${Math.round(sea * 100)} %</span></div>
      ${blockade.length ? `<p class="small bad">Seeblockade: ${blockade.map(([id, v]) => `${esc(state.countries[id].name)} ${Math.round(v * 100)} %`).join(', ')}</p>` : ''}
      <div class="btn-row">${actionButton('Auf Karte zeigen', 'focusRegion', { region: focusRegion })}${actionButton('Kriegskarte', 'setMapMode', { mode: 'war' })}</div>
      ${command}
      ${join}
      ${side ? peaceBuilder(ui, war, side) : ''}
    </div>`;
}

export const WarPanel = {
  id: 'wars',
  title: 'Kriege',
  render(ui) {
    const state = ui.session.state;
    const p = state.playerId;
    const wars = activeWars(state);
    const mine = wars.filter((w) => sideOf(w, p));
    const others = wars.filter((w) => !sideOf(w, p)).sort((a, b) => a.startDay - b.startDay);
    const ended = state.wars.filter((w) => w.status !== 'active').slice(-8).reverse();
    const truces = Object.entries(state.truces ?? {}).filter(([k, until]) => until > state.time.day && k.split('|').includes(p));
    return `
      ${section(`Ihre Kriege (${mine.length})`, mine.length ? mine.map((w) => warCard(ui, w)).join('') : '<p class="muted small">Ihr Land befindet sich im Frieden. Einen Krieg erklären Sie über ein Land oder eine Region auf der Karte („Krieg erklären…“).</p>', { tut: 'wars' })}
      ${section(`Kriege weltweit (${others.length})`, others.length ? others.map((w) => warCard(ui, w)).join('') : '<p class="muted small">Derzeit keine weiteren Kriege.</p>')}
      ${truces.length ? section('Waffenstillstände', `<ul class="list">${truces.map(([k, until]) => `<li>${countryLink(state, k.split('|').find((id) => id !== p))}<span class="num muted">bis ${formatDateDE(until)}</span></li>`).join('')}</ul>`) : ''}
      ${ended.length ? section('Beendete Kriege', `<ul class="list">${ended.map((w) => `<li><span>${esc(w.name)}</span><span class="small muted">${formatDateDE(w.endDay)} · ${esc(w.outcome ?? '')}</span></li>`).join('')}</ul>`) : ''}`;
  },
};

