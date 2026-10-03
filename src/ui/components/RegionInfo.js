/**
 * Region section of the information panel: ownership and control, economy,
 * resources, military facilities, claims, troops and the actions the player
 * can take for this region (build, raise units, claim, declare war, attack).
 */
import { STATIC_REGIONS } from '../../state/worldIndex.js';
import { TERRAIN, UNIT_TYPES, UNIT_TYPE_IDS } from '../../data/military/army.js';
import { FACILITIES, FACILITY_IDS } from '../../data/military/facilities.js';
import { RESOURCES } from '../../data/resources.js';
import { areEnemies } from '../../systems/war/wars.js';
import { constructionError } from '../../systems/military/construction.js';
import { friendlyCountries } from '../../systems/war/movement.js';
import { unitLabel } from '../../systems/military/units.js';
import { CLAIM_DAYS } from '../../commands/militaryCommands.js';
import { formatBn, formatPopulation, formatNumber, esc } from '../../util/format.js';
import { formatDateDE } from '../../core/calendar.js';
import { section, stat, meter, cmdButton, actionButton, attr } from '../widgets.js';
import { countryLink } from './InfoPanel.js';

export function regionStatus(state, r) {
  if (r.siege) {
    const by = state.countries[r.siege.by];
    return { text: `Umkämpft – Belagerung durch ${by?.name ?? '?'} (${Math.round(r.siege.progress ?? 0)} %)`, tone: 'warn' };
  }
  if (r.controller !== r.owner) {
    return { text: `Besetzt durch ${state.countries[r.controller].name}${r.occupiedSince !== null ? ` seit ${formatDateDE(r.occupiedSince)}` : ''}`, tone: 'bad' };
  }
  return { text: 'Unter Kontrolle des Eigentümers (Friedenskontrolle)', tone: 'good' };
}

function unitRow(u) {
  const t = UNIT_TYPES[u.type];
  const status = u.status === 'training' ? 'in Ausbildung' : u.status === 'reserve' ? 'Reserve' : u.attacking ? 'greift an' : u.target ? 'auf dem Marsch' : u.inCombat ? 'im Gefecht' : 'bereit';
  return `<li><span>${t.icon} ${esc(unitLabel(u))}</span><span class="num muted">${Math.round(u.strength * 100)} % · ${status}</span></li>`;
}

export function renderRegionSection(ui, regionId) {
  const state = ui.session.state;
  const r = state.regions[regionId];
  const s = STATIC_REGIONS[regionId];
  if (!r || !s) return '';
  const p = state.playerId;
  const owner = state.countries[r.owner];
  const controller = state.countries[r.controller];
  const status = regionStatus(state, r);
  const isCapital = owner.capitalRegion === regionId;

  const chips = `<div class="chips">
      <span class="chip">${TERRAIN[s.terrain]?.name ?? s.terrain}</span>
      ${s.coastal ? '<span class="chip">Küste</span>' : ''}
      ${isCapital ? '<span class="chip chip-brass">Hauptstadt</span>' : ''}
      ${r.cores.includes(p) && r.owner !== p ? '<span class="chip chip-bad">Ihr Kerngebiet</span>' : ''}
      ${r.claims.includes(p) ? '<span class="chip chip-warn">Ihr Anspruch</span>' : ''}
    </div>`;

  const ownership = `<ul class="list">
      <li><span>Eigentümer</span>${countryLink(state, owner.id)}</li>
      <li><span>Kontrolle</span>${countryLink(state, controller.id)}</li>
    </ul>
    <p class="region-status tone-${status.tone} small">${esc(status.text)}</p>
    ${r.siege ? meter(r.siege.progress ?? 0, { tone: 'bad', label: 'Belagerungsfortschritt' }) : ''}`;

  const stats = `<div class="stat-grid">
      ${stat('Bevölkerung', formatPopulation(r.population))}
      ${stat('Wirtschaftsleistung', `${formatBn(r.econ)}/Jahr`, { tip: 'Anteil am BIP des Eigentümers. Besetzte Regionen liefern dem Eigentümer nur 30 %, dem Besatzer 12 %.' })}
      ${stat('Infrastruktur', formatNumber(r.infrastructure, 0), { tip: 'Bestimmt Marschgeschwindigkeit und Nachschub.' })}
      ${stat('Fläche', `${formatNumber(s.areaKm)} km²`)}
      ${r.devastation > 0.01 ? stat('Verwüstung', `${Math.round(r.devastation * 100)} %`, { cls: 'bad', tip: 'Kriegsschäden senken die Wirtschaftsleistung und erholen sich langsam.' }) : ''}
      ${r.unrest > 0.01 ? stat('Unruhe', `${Math.round(r.unrest * 100)} %`, { cls: 'bad' }) : ''}
    </div>`;

  const cities = s.cities?.length ? `<p class="small muted">Städte: ${s.cities.map(([n, pop]) => `${esc(n)} (${formatPopulation(pop)})`).join(' · ')}</p>` : '';
  const res = Object.entries(r.resources).filter(([, v]) => v >= 0.05);
  const resources = res.length
    ? `<div class="tag-list">${res.map(([rid, v]) => `<span class="tag" data-tip="Förderkapazität ${formatNumber(v, 1)} Einheiten/Jahr">${RESOURCES[rid].icon} ${RESOURCES[rid].name} ${formatNumber(v, 1)}</span>`).join('')}</div>`
    : '<p class="muted small">Keine nennenswerten Rohstoffe.</p>';

  const building = Object.entries(r.buildings).filter(([, lv]) => lv > 0);
  const owned = r.owner === p;
  const underConstruction = owned ? ui.session.player.military.construction.filter((c) => c.region === regionId) : [];
  const facilities = `${building.length ? `<ul class="list">${building.map(([id, lv]) => `<li><span>${FACILITIES[id].icon} ${FACILITIES[id].name}</span><span class="num">Stufe ${lv}</span></li>`).join('')}</ul>` : '<p class="muted small">Keine militärischen Anlagen.</p>'}
    ${underConstruction.map((c) => `<p class="small">🏗 ${FACILITIES[c.type].name} im Bau – ${c.monthsDone}/${c.months} Monate${c.stalled ? ` <span class="bad">(${esc(c.stalled)})</span>` : ''}</p>`).join('')}`;

  const claimants = [...new Set([...r.cores.filter((id) => id !== r.owner), ...r.claims])];
  const claims = claimants.length ? `<p class="small">Ansprüche: ${claimants.map((id) => countryLink(state, id)).join(' ')}</p>` : '';

  // troops
  const own = p ? state.countries[p].military.units.filter((u) => u.region === regionId) : [];
  const friends = p ? friendlyCountries(state, p) : new Set();
  const visibleEnemy = p && areEnemies(state, p, r.controller);
  let enemyCount = 0;
  if (visibleEnemy) for (const u of state.countries[r.controller].military.units) if (u.region === regionId && u.status === 'active') enemyCount++;
  const movable = own.filter((u) => u.status === 'active' && !u.inCombat);
  const troops = `${own.length ? `<ul class="list unit-list">${own.slice(0, 12).map(unitRow).join('')}</ul>${own.length > 12 ? `<p class="muted small">… und ${own.length - 12} weitere</p>` : ''}` : '<p class="muted small">Keine eigenen Verbände.</p>'}
    ${visibleEnemy ? `<p class="small bad">Feindliche Verbände (aufgeklärt): ${enemyCount}</p>` : ''}
    ${movable.length ? `<div class="btn-row">${actionButton(`${movable.length} Verbände verlegen…`, 'startMove', { units: movable.map((u) => u.id).join(',') }, { tip: 'Danach die Zielregion auf der Karte anklicken (Esc bricht ab).' })}</div>` : ''}`;

  // actions for the player
  let actions = '';
  if (p && ui.mode === 'game') {
    const parts = [];
    if (owned && r.controller === p) {
      const options = FACILITY_IDS.map((f) => {
        const err = constructionError(state, ui.session.player, regionId, f);
        return `<option value="${f}"${err ? ' disabled' : ''}>${FACILITIES[f].name} (${formatBn(FACILITIES[f].cost)}, ${FACILITIES[f].months} Mon.)${err ? ` – ${esc(err)}` : ''}</option>`;
      }).join('');
      parts.push(`<form class="inline-form" data-cmd-form="${attr({ type: 'buildFacility', regionId })}">
          <label class="field"><span>Anlage bauen</span><select name="facility">${options}</select></label>
          <label class="field field-narrow"><span>Stufen</span><input type="number" name="levels" min="1" max="10" step="1" value="1"></label>
          <button class="btn" type="submit">Bauen</button>
        </form>`);
      const unitOptions = UNIT_TYPE_IDS.map((t) => `<option value="${t}">${UNIT_TYPES[t].name} (${formatNumber(UNIT_TYPES[t].personnel)} Soldaten)</option>`).join('');
      parts.push(`<form class="inline-form" data-cmd-form="${attr({ type: 'raiseUnit', regionId })}">
          <label class="field"><span>Verband aufstellen</span><select name="unitType">${unitOptions}</select></label>
          <button class="btn" type="submit">Aufstellen</button>
        </form>`);
    }
    if (!owned) {
      if (!r.claims.includes(p) && !r.cores.includes(p)) {
        parts.push(cmdButton(ui, 'Gebietsanspruch vorbereiten', { type: 'fabricateClaim', regionId }, { tip: `Dauert ${CLAIM_DAYS} Tage und verschlechtert die Beziehungen. Ansprüche machen Kriege legitimer (geringere Stabilitätskosten).` }));
      }
      if (!areEnemies(state, p, r.owner)) {
        parts.push(actionButton('Krieg erklären…', 'openDeclareWar', { target: r.owner, region: regionId }, { cls: 'btn-danger', tip: 'Kriegsziele wählen und Folgen prüfen – nichts passiert ohne Bestätigung.' }));
      }
    }
    if (areEnemies(state, p, r.controller)) {
      const attackers = state.countries[p].military.units.filter((u) => u.status === 'active' && !u.target && !u.inCombat && s.neighbors.includes(u.region));
      parts.push(attackers.length
        ? actionButton(`Angreifen mit ${attackers.length} Verbänden aus Nachbarregionen`, 'orderMove', { units: attackers.map((u) => u.id).join(','), region: regionId }, { cls: 'btn-danger' })
        : '<p class="muted small">Für einen Angriff Verbände in eine angrenzende Region verlegen (oder per Landung über See).</p>');
    } else if (r.owner === p && r.controller !== p && friends.size) {
      parts.push('<p class="muted small">Zur Befreiung Verbände in eine angrenzende eigene Region verlegen und angreifen.</p>');
    }
    actions = parts.length ? `<div class="btn-col">${parts.join('')}</div>` : '';
  }

  return section(
    `Region: ${esc(s.name)}`,
    `${chips}${ownership}${stats}${cities}
     <h4 class="sub-head">Rohstoffe</h4>${resources}
     <h4 class="sub-head">Militärische Anlagen</h4>${facilities}
     ${claims}
     <h4 class="sub-head">Truppen</h4>${troops}
     ${actions}`,
    { extra: `<button class="icon-btn" data-action="clearRegion" aria-label="Regionsauswahl aufheben">✕</button>`, tut: 'region' },
  );
}
