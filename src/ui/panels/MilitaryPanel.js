/**
 * Military command: dashboard (army, air force, navy, industry, logistics),
 * formations, aircraft, fleets, production queues, international
 * procurement, facilities and stockpiles. All figures come from the state;
 * all buttons are game commands validated at render time.
 */
import { BUDGET_CATEGORIES } from '../../state/selectors.js';
import { alliesOf } from '../../systems/diplomacy.js';
import { neighborCountryIds, STATIC_REGIONS } from '../../state/worldIndex.js';
import { UNIT_TYPES, UNIT_TYPE_IDS, MOBILIZATION_LEVELS } from '../../data/military/army.js';
import { AIRCRAFT, AIRCRAFT_BY_ID, AIRCRAFT_ROLES } from '../../data/military/aircraft.js';
import { SHIP_CLASSES, SHIP_CLASS_IDS } from '../../data/military/navy.js';
import { EQUIPMENT, EQUIPMENT_IDS, CONSUMABLES } from '../../data/military/equipment.js';
import { FACILITIES, FACILITY_IDS, FACTORY_TYPES } from '../../data/military/facilities.js';
import { TECH_BY_ID } from '../../data/technologies.js';
import { unitLabel, personnelOf } from '../../systems/military/units.js';
import { aircraftCount, shipCount } from '../../systems/military/power.js';
import { mobilizablePopulation, trainingCapacity, mobilizationEffects } from '../../systems/military/manpower.js';
import { canProduce, itemDef, factoryLevels, factoryCapacity, productionCostFactor } from '../../systems/military/production.js';
import { procurementOffers } from '../../systems/military/procurement.js';
import { constructionError } from '../../systems/military/construction.js';
import { dailyNeeds } from '../../systems/military/logistics.js';
import { monthlyUpkeep } from '../../systems/military/budget.js';
import { isAtWar } from '../../systems/war/wars.js';
import { formatBn, formatNumber, formatPopulation, formatPrice, esc } from '../../util/format.js';
import { formatDateDE } from '../../core/calendar.js';
import { section, stat, slider, cmdButton, actionButton, attr, meter, tipAttr, flag } from '../widgets.js';
import { countryLink } from '../components/InfoPanel.js';
import { QUICK_ORDERS, planQuickOrder, forceSummary, equipmentStatus, restockPlan, armyCondition } from '../../systems/military/quickOrders.js';

export const MILITARY_TABS = [
  ['quick', 'Aufrüsten'],
  ['overview', 'Übersicht'],
  ['army', 'Heer'],
  ['air', 'Luftwaffe'],
  ['navy', 'Marine'],
  ['production', 'Produktion'],
  ['procurement', 'Beschaffung'],
  ['facilities', 'Anlagen'],
  ['stock', 'Lager'],
];

const pct = (v) => `${Math.round(v * 100)} %`;
const KIND_NAMES = { equipment: 'Ausrüstung', aircraft: 'Flugzeug', ship: 'Schiff' };

function avg(list, fn) {
  return list.length ? list.reduce((s, x) => s + fn(x), 0) / list.length : 0;
}

function regionLink(regionId) {
  return `<button class="link" data-action="focusRegion" data-region="${regionId}">${esc(STATIC_REGIONS[regionId]?.name ?? regionId)}</button>`;
}

function facilityTotal(state, c, type) {
  let lv = 0;
  for (const rid of c.regionIds) lv += state.regions[rid].buildings[type] ?? 0;
  return lv;
}

function stockDays(c, id) {
  const need = dailyNeeds(c, 1);
  return need[id] > 0 ? c.military.stock[id] / need[id] : Infinity;
}

// ------------------------------------------------------------------- tabs

/** What the player already has, for each simple order. */
function ownedFor(c, order, f) {
  if (order.unitType === 'armored') return `${formatNumber(f.tanks)} Panzer`;
  if (order.unitType === 'artillery') return `${formatNumber(f.guns)} Geschütze`;
  if (order.unitType) {
    const n = c.military.units.filter((u) => u.type === order.unitType && u.status !== 'reserve').length;
    return `${n} Verbände`;
  }
  if (order.id === 'fighters') return `${formatNumber(f.fighters)} Kampfjets`;
  if (order.id === 'bombers') return `${formatNumber(f.bombers)} Bomber`;
  if (order.id === 'drones') return `${formatNumber(f.drones)} Drohnen`;
  if (order.id === 'warship') return `${formatNumber(f.warships)} Kriegsschiffe`;
  return `${formatNumber(f.submarines)} U-Boote`;
}

function quick(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const f = forceSummary(c);
  const big = (label, value, tip) => `<div class="big-stat"${tipAttr(tip)}><span class="big-stat-value num">${value}</span><span class="big-stat-label">${label}</span></div>`;
  const forces = `<div class="big-stats">
      ${big('Soldaten', formatPopulation(f.soldiers), `Aktive Soldaten in ${f.units} einsatzbereiten Verbänden. Dazu ${formatPopulation(f.reserve)} Reservisten.`)}
      ${big('Panzer', formatNumber(f.tanks), 'Kampfpanzer in den Verbänden und im Lager.')}
      ${big('Geschütze', formatNumber(f.guns), 'Artilleriesysteme in den Verbänden und im Lager.')}
      ${big('Flugzeuge', formatNumber(f.aircraft), `${f.fighters} Kampfjets, ${f.bombers} Bomber, ${f.drones} Drohnen, Rest Transport/Aufklärung.`)}
      ${big('Schiffe', formatNumber(f.ships), `${f.warships} Kriegsschiffe, ${f.submarines} U-Boote, ${f.carriers} Flugzeugträger.`)}
      ${big('Weltrang', `#${ui.ranks().military[c.id] ?? '–'}`, `Militärstärke ${formatNumber(m.power)}`)}
    </div>`;
  const cond = armyCondition(c);
  const condition = `<div class="army-condition">
      <p class="small"><b>Zustand des Heeres</b> – die Militärstärke ergibt sich aus Soldaten und Ausrüstung, abgeschwächt durch diese Werte:</p>
      <div class="cond-grid">${cond.items
        .map((it) => `<div class="cond-item${it.value < 0.6 ? ' is-low' : ''}"${tipAttr(`<b>${esc(it.label)}: ${pct(it.value)}</b><br>${esc(it.fix)}`)}><span class="small">${it.label}</span>${meter(it.value * 100, { tone: it.value >= 0.75 ? 'good' : it.value >= 0.5 ? 'brass' : 'bad' })}<span class="num small">${pct(it.value)}</span></div>`)
        .join('')}</div>
      ${cond.items.filter((it) => it.value < 0.6).map((it) => `<p class="small bad">⚠ ${esc(it.label)} niedrig: ${esc(it.fix)}</p>`).join('')}
      ${cond.training ? `<p class="small muted">${cond.training} Verband/Verbände in Ausbildung zählen erst nach der Ausbildung voll.</p>` : ''}
    </div>`;
  const groups = ['Heer', 'Luftwaffe', 'Marine'].map((g) => {
    const cards = QUICK_ORDERS.filter((o) => o.group === g)
      .map((o) => {
        const plan = planQuickOrder(state, c, o.id);
        const body = plan.error
          ? `<p class="small bad">${esc(plan.error)}</p>`
          : `<p class="order-gives"><b>${esc(plan.gives)}</b></p>
             <div class="order-facts"><span${tipAttr('Wird aus dem Verteidigungshaushalt bezahlt (Käufe: 15 % Anzahlung sofort).')}>💰 ${formatBn(plan.cost)}</span><span>⏱ ca. ${plan.months} Mon.</span></div>
             <p class="small muted">${plan.sources.map(esc).join(' · ')}</p>
             ${plan.warning ? `<p class="small bad">${esc(plan.warning)}</p>` : ''}`;
        return `<div class="order-card">
            <header><span class="order-icon" aria-hidden="true">${o.icon}</span><b>${o.name}</b><span class="small muted">${ownedFor(c, o, f)}</span></header>
            <p class="small">${esc(o.role)}</p>
            ${body}
            ${cmdButton(ui, 'Bestellen', { type: 'quickOrder', order: o.id }, { cls: 'btn-primary' })}
          </div>`;
      })
      .join('');
    return section(g, `<div class="order-grid">${cards}</div>`);
  });
  // what is on its way
  const pending = [];
  for (const u of m.units.filter((x) => x.status === 'training')) pending.push(`${UNIT_TYPES[u.type].icon} ${esc(unitLabel(u))} – einsatzbereit ab ${formatDateDE(u.trainingUntil)}`);
  for (const l of m.production) pending.push(`🏭 ${esc(itemDef(l.kind, l.item).name)} – ${formatNumber(l.done)} von ${formatNumber(l.quantity)} fertig${l.blocked ? ` <span class="bad">(${esc(l.blocked)})</span>` : ''}`);
  for (const ct of m.contracts.filter((x) => x.status !== 'completed')) pending.push(`🚢 ${esc(itemDef(ct.kind, ct.item).name)} – ${formatNumber(ct.delivered)} von ${formatNumber(ct.quantity)} geliefert${ct.status === 'suspended' ? ' <span class="bad">(Lieferstopp)</span>' : state.time.day < ct.firstDelivery ? `, erste Lieferung ${formatDateDE(ct.firstDelivery)}` : ''}`);
  return `
    ${section('Ihre Streitkräfte', forces + condition, { tut: 'military-dash' })}
    <div class="howto small">
      <b>So einfach geht's:</b> Wählen Sie unten, was Sie brauchen, und klicken Sie auf <b>Bestellen</b>. Das Spiel kümmert sich um alles:
      Soldaten ausbilden, fehlende Ausrüstung in eigenen Fabriken bauen oder im Ausland kaufen. Bezahlt wird aus dem Verteidigungshaushalt.
      Im Krieg führt der Generalstab Ihre Truppen automatisch – Sie wählen in der Kriegsübersicht ⚔ nur die Strategie.
    </div>
    ${groups.join('')}
    ${section(`Unterwegs (${pending.length})`, pending.length ? `<ul class="list pending-list">${pending.map((p) => `<li>${p}</li>`).join('')}</ul>` : '<p class="muted small">Nichts in Arbeit.</p>')}
    <p class="muted small">Für Profis: In den Reitern Heer, Produktion, Beschaffung und Anlagen lässt sich alles im Detail steuern.</p>`;
}

function overview(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const units = m.units;
  const active = units.filter((u) => u.status === 'active');
  const airTotal = aircraftCount(c);
  const airCap = facilityTotal(state, c, 'airBase') * FACILITIES.airBase.capacity;
  const ships = shipCount(c);
  const navalCap = facilityTotal(state, c, 'navalBase') * FACILITIES.navalBase.capacity;
  const cutOff = active.filter((u) => u.supply < 0.35).length;
  // before the first monthly settlement show the calculated upkeep as an estimate
  const settled = (m.spending?.budget ?? 0) > 0;
  const sp = settled ? m.spending : { upkeep: monthlyUpkeep(state, c).total, procurement: 0, construction: 0, production: 0, supplies: 0, total: monthlyUpkeep(state, c).total, budget: (c.economy.gdp * c.budget.military) / 12, funding: 1 };
  const def = BUDGET_CATEGORIES.military;
  const eff = mobilizationEffects(state, c);
  const dash = (title, rows, tab) => `<button class="dash-card" data-action="setMilitaryTab" data-tab="${tab}"><h4>${title}</h4>${rows}</button>`;
  const row = (label, value, cls = '') => `<div class="dash-row"><span>${label}</span><b class="num ${cls}">${value}</b></div>`;
  const stockCls = (d) => (d < 15 ? 'bad' : d < 40 ? 'warn' : 'good');
  const factories = FACTORY_TYPES.map((t) => `${FACILITIES[t].icon} ${formatNumber(factoryLevels(state, c, t), 0)}`).join(' · ');
  const allies = alliesOf(state, c.id);
  const compare = (ids) =>
    `<ul class="list">${ids
      .map((id) => state.countries[id])
      .sort((a, b) => b.military.power - a.military.power)
      .slice(0, 12)
      .map((x) => `<li>${countryLink(state, x.id)}<span class="num ${x.military.power > m.power ? 'bad' : 'good'}">${formatNumber(x.military.power)}</span></li>`)
      .join('')}</ul>`;

  return `
    <div class="dash-grid">
      ${dash('HEER', row('Verbände aktiv', `${active.length} / ${units.length}`) + row('Personal aktiv', formatPopulation(m.activePersonnel ?? 0)) + row('Einsatzbereitschaft', pct(avg(active, (u) => u.readiness))) + row('Ausrüstung', pct(avg(active, (u) => u.equip))) + row('Landstärke', formatNumber(m.landPower)), 'army')}
      ${dash('LUFTWAFFE', row('Flugzeuge', formatNumber(airTotal)) + row('Jäger / Bomber', `${aircraftCount(c, 'fighter') + aircraftCount(c, 'interceptor')} / ${aircraftCount(c, 'bomber')}`) + row('Drohnen', formatNumber(aircraftCount(c, 'drone'))) + row('Basiskapazität', `${formatNumber(airTotal)} / ${formatNumber(airCap)}`, airTotal > airCap ? 'bad' : '') + row('Luftstärke', formatNumber(m.airPower)), 'air')}
      ${dash('MARINE', row('Schiffe', formatNumber(ships)) + row('Flotten', m.fleets.length) + row('Träger / U-Boote', `${shipCount(c, 'carrier')} / ${shipCount(c, 'submarine')}`) + row('Hafenkapazität', `${ships} / ${navalCap}`, ships > navalCap ? 'bad' : '') + row('Seestärke', formatNumber(m.navalPower)), 'navy')}
      ${dash('INDUSTRIE', row('Fabriken', factories) + row('Aufträge', m.production.length) + row('Verträge aktiv', m.contracts.filter((x) => x.status !== 'completed').length) + row('Rüstungsexporte', `${formatBn(m.armsExportsLast ?? 0)}/Mon.`), 'production')}
      ${dash('LOGISTIK', row('Treibstoff', `${formatNumber(Math.min(999, stockDays(c, 'fuel')))} Tage`, stockCls(stockDays(c, 'fuel'))) + row('Munition', `${formatNumber(Math.min(999, stockDays(c, 'ammunition')))} Tage`, stockCls(stockDays(c, 'ammunition'))) + row('Verpflegung', `${formatNumber(Math.min(999, stockDays(c, 'rations')))} Tage`, stockCls(stockDays(c, 'rations'))) + row('Versorgung Ø', pct(avg(active, (u) => u.supply))) + row('Abgeschnitten', cutOff, cutOff ? 'bad' : ''), 'stock')}
    </div>
    ${section(
      'Verteidigungshaushalt',
      `${slider({
        cmd: { type: 'setBudget', category: 'military' },
        value: Math.round(c.budget.military * 1000) / 10,
        min: def.min * 100,
        max: def.max * 100,
        label: 'Verteidigungsausgaben (Obergrenze)',
        display: `${(c.budget.military * 100).toFixed(1)} % · ${formatBn((c.economy.gdp * c.budget.military) / 12)}/Monat`,
        tip: 'Obergrenze für das Militär. Bezahlt werden der Reihe nach: Unterhalt, Beschaffungsverträge, Bauprojekte, Produktion, Nachschub. Nicht benötigtes Geld bleibt im Staatshaushalt.',
      })}
      <table class="data-table"><tbody>
        <tr><td>Unterhalt (Personal, Wartung, Anlagen)</td><td class="num">${formatBn(sp.upkeep ?? 0)}</td></tr>
        <tr><td>Beschaffungsverträge</td><td class="num">${formatBn(sp.procurement ?? 0)}</td></tr>
        <tr><td>Bauprojekte</td><td class="num">${formatBn(sp.construction ?? 0)}</td></tr>
        <tr><td>Produktion</td><td class="num">${formatBn(sp.production ?? 0)}</td></tr>
        <tr><td>Nachschub (Treibstoff, Munition, Verpflegung, Ersatzteile)</td><td class="num">${formatBn(sp.supplies ?? 0)}</td></tr>
        <tr class="tip-sum"><td>${settled ? 'Ausgegeben letzten Monat' : 'Geplant (erste Abrechnung zum Monatsersten)'}</td><td class="num">${formatBn(sp.total ?? 0)} / ${formatBn(sp.budget ?? 0)}</td></tr>
      </tbody></table>
      ${m.warCredits > 0.0005 ? `<p class="warn small">Kriegskredite: ${formatBn(m.warCredits)} im letzten Monat für Verpflegung, Treibstoff und Munition direkt aus der Staatskasse (Budget reichte nicht). Ein höheres Verteidigungsbudget macht das planbar.</p>` : ''}
      ${(sp.funding ?? 1) < 0.999 ? `<p class="bad small">Der Haushalt deckt nur ${pct(sp.funding)} des Unterhalts – Einsatzbereitschaft und Wartung leiden.</p>` : ''}`,
    )}
    ${section(
      'Personal & Mobilmachung',
      `<div class="stat-grid">
        ${stat('Aktive Soldaten', formatPopulation(m.activePersonnel ?? 0))}
        ${stat('Reservisten', formatPopulation(m.reserve))}
        ${stat('Wehrfähig verfügbar', formatPopulation(mobilizablePopulation(c)), { tip: '18 % der Bevölkerung gelten als wehrfähig, abzüglich aktiver Soldaten und Reservisten.' })}
        ${stat('Ausbildung/Monat', `${formatPopulation(m.trainingLeft ?? 0)} / ${formatPopulation(trainingCapacity(c))}`, { tip: 'Verbleibende Ausbildungsplätze diesen Monat. Mobilmachung erhöht die Kapazität.' })}
        ${stat('Wachstumseffekt', `${(eff.growth * 100).toFixed(2)} %`, { cls: eff.growth < 0 ? 'bad' : '', tip: 'Soldaten fehlen als Arbeitskräfte; Krieg und Kriegsmüdigkeit belasten zusätzlich.' })}
        ${stat('Kriegsmüdigkeit', pct(m.exhaustion), { cls: m.exhaustion > 0.3 ? 'bad' : '' })}
      </div>
      <div class="seg-row" role="group" aria-label="Mobilmachung">${MOBILIZATION_LEVELS.map((l) => cmdButton(ui, l.name, { type: 'setMobilization', level: l.id }, { cls: m.mobilization === l.id ? 'btn-primary is-on' : '', tip: esc(l.description) })).join('')}</div>`,
    )}
    ${section(
      'Strategische Fähigkeiten',
      `<p class="small">${m.deterrent ? '<b>Strategische Abschreckung vorhanden.</b> Senkt die Bereitschaft anderer Staaten, Ihr Land anzugreifen, deutlich – und alarmiert die Weltgemeinschaft bei jedem Konflikt.' : 'Keine strategische Abschreckung. (Abstrakte staatliche Fähigkeit – beeinflusst nur Kriegsrisiko-Abwägungen der KI und internationale Reaktionen.)'}</p>`,
    )}
    ${section('Nachbarn im Vergleich', neighborCountryIds(state, c.id).length ? compare(neighborCountryIds(state, c.id)) : '<p class="muted small">Keine Landgrenzen.</p>')}
    ${section('Verbündete', allies.length ? compare(allies) : '<p class="muted small">Keine Bündnispartner.</p>')}`;
}

function army(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const sel = ui.unitSelection;
  const own = c.regionIds.filter((rid) => state.regions[rid].controller === c.id);
  own.sort((a, b) => (a === c.capitalRegion ? -1 : b === c.capitalRegion ? 1 : STATIC_REGIONS[a].name.localeCompare(STATIC_REGIONS[b].name)));
  const raise = `<form class="inline-form" data-cmd-form="${attr({ type: 'raiseUnit' })}">
      <label class="field"><span>Typ</span><select name="unitType">${UNIT_TYPE_IDS.map((t) => `<option value="${t}">${UNIT_TYPES[t].icon} ${UNIT_TYPES[t].name} – ${formatNumber(UNIT_TYPES[t].personnel)} Soldaten, ${UNIT_TYPES[t].trainMonths} Mon.</option>`).join('')}</select></label>
      <label class="field"><span>Standort</span><select name="regionId">${own.map((rid) => `<option value="${rid}">${esc(STATIC_REGIONS[rid].name)}</option>`).join('')}</select></label>
      <button class="btn btn-primary" type="submit">Aufstellen</button>
    </form>
    <p class="muted small">Neue Verbände werden zuerst aus Reservisten (1 Monat), sonst aus Rekruten aufgestellt und aus dem Lager ausgerüstet. Fehlende Ausrüstung muss produziert oder beschafft werden.</p>`;
  const groups = { active: [], training: [], reserve: [] };
  for (const u of m.units) groups[u.status]?.push(u);
  const selCount = m.units.filter((u) => sel.has(u.id)).length;
  const toolbar = `<div class="btn-row">
      ${actionButton(`Ausgewählte verlegen (${selCount})`, 'startMove', { units: m.units.filter((u) => sel.has(u.id)).map((u) => u.id).join(',') }, { cls: 'btn-primary', disabled: !selCount, tip: 'Danach die Zielregion auf der Karte anklicken.' })}
      ${actionButton('Auswahl aufheben', 'clearUnitSelection', {}, { disabled: !selCount })}
    </div>`;
  const rows = (list) =>
    list
      .map((u) => {
        const t = UNIT_TYPES[u.type];
        const state_ = u.status === 'training' ? `Ausbildung bis ${formatDateDE(u.trainingUntil)}` : u.status === 'reserve' ? 'Reserve' : u.attacking ? `greift ${esc(STATIC_REGIONS[u.target]?.name ?? '')} an` : u.target ? `→ ${esc(STATIC_REGIONS[u.target]?.name ?? '')} (${formatDateDE(u.arrival)})` : u.inCombat ? 'im Gefecht' : 'bereit';
        return `<tr>
          <td><input type="checkbox" aria-label="auswählen" data-action-change="toggleUnitSel" data-unit="${u.id}"${sel.has(u.id) ? ' checked' : ''}${u.status !== 'active' ? ' disabled' : ''}></td>
          <td${tipAttr(`${esc(t.name)} · ${formatNumber(personnelOf(u))} Soldaten<br>Moral ${pct(u.morale)} · Erfahrung ${pct(u.experience)}${u.manual ? '<br>Manuell geführt' : '<br>Vom Generalstab geführt (A)'}`)}>${t.icon} ${esc(unitLabel(u))}${u.manual ? '' : ' <span class="muted small">A</span>'}</td>
          <td>${regionLink(u.region)}</td>
          <td class="num"${tipAttr(`${formatNumber(personnelOf(u))} Soldaten`)}>${pct(u.strength)}</td>
          <td class="num">${pct(u.equip)}</td>
          <td class="num">${pct(u.readiness)}</td>
          <td class="num">${pct(u.org)}</td>
          <td class="num ${u.supply < 0.4 ? 'bad' : ''}">${pct(u.supply)}</td>
          <td class="small">${state_}</td>
          <td class="row-actions">${u.status === 'active' ? actionButton('Verlegen', 'startMove', { units: u.id }, { cls: 'btn-sm' }) : ''}${u.manual ? cmdButton(ui, 'Auto', { type: 'setUnitAutomatic', unitId: u.id }, { cls: 'btn-sm', tip: 'Dem Generalstab unterstellen (automatische Frontführung).' }) : ''}${cmdButton(ui, '✕', { type: 'disbandUnit', unitId: u.id }, { cls: 'btn-sm btn-danger', tip: 'Auflösen: Personal geht in die Reserve, Ausrüstung ins Lager.', confirm: `${unitLabel(u)} auflösen?` })}</td>
        </tr>`;
      })
      .join('');
  const table = (list) => `<div class="table-wrap"><table class="data-table unit-table"><thead><tr><th></th><th>Verband</th><th>Standort</th><th${tipAttr('Personalstärke')}>Stärke</th><th${tipAttr('Ausrüstungsgrad')}>Ausr.</th><th${tipAttr('Einsatzbereitschaft')}>Bereit</th><th${tipAttr('Organisation (Gefechtsfähigkeit)')}>Org.</th><th${tipAttr('Versorgung')}>Vers.</th><th>Status</th><th></th></tr></thead><tbody>${rows(list)}</tbody></table></div>`;
  const byType = UNIT_TYPE_IDS.map((t) => [t, m.units.filter((u) => u.type === t)]).filter(([, l]) => l.length);
  return `
    ${section('Verband aufstellen', raise)}
    ${section('Zusammensetzung', `<div class="tag-list">${byType.map(([t, l]) => `<span class="tag"${tipAttr(`Angriff ${UNIT_TYPES[t].attack} · Verteidigung ${UNIT_TYPES[t].defense} · Panzerung ${Math.round(UNIT_TYPES[t].hardness * 100)} % · Mobilität ${UNIT_TYPES[t].mobility} km/Tag`)}>${UNIT_TYPES[t].icon} ${UNIT_TYPES[t].name}: ${l.length}</span>`).join('')}</div>`)}
    ${section(`Aktive Verbände (${groups.active.length})`, `${toolbar}${groups.active.length ? table(groups.active) : '<p class="muted small">Keine.</p>'}`, { tut: 'army-units' })}
    ${groups.training.length ? section(`In Ausbildung (${groups.training.length})`, table(groups.training)) : ''}
    ${groups.reserve.length ? section(`Reserveverbände (${groups.reserve.length})`, `<p class="muted small">Werden durch Teil- bzw. Generalmobilmachung aktiviert.</p>${table(groups.reserve)}`) : ''}`;
}

function air(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const models = Object.entries(m.aircraft).filter(([, a]) => a.count > 0);
  models.sort((a, b) => AIRCRAFT_BY_ID[a[0]].role.localeCompare(AIRCRAFT_BY_ID[b[0]].role) || b[1].count - a[1].count);
  const airCap = facilityTotal(state, c, 'airBase') * FACILITIES.airBase.capacity;
  const table = models.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Muster</th><th>Rolle</th><th>Anzahl</th><th>Bereit</th><th>Alter</th><th${tipAttr('Luftkampf / Bodenangriff')}>Luft/Boden</th><th>Reichweite</th></tr></thead><tbody>
      ${models.map(([id, a]) => {
        const d = AIRCRAFT_BY_ID[id];
        return `<tr><td>${esc(d.name)} <span class="muted small">Gen. ${d.gen}</span></td><td>${AIRCRAFT_ROLES[d.role].name}</td><td class="num">${formatNumber(a.count)}</td><td class="num">${pct(a.readiness)}</td><td class="num ${a.age > d.serviceLife * 0.8 ? 'bad' : ''}">${formatNumber(a.age)} J.</td><td class="num">${d.airAttack} / ${d.groundAttack}</td><td class="num">${formatNumber(d.range)} km</td></tr>`;
      }).join('')}
    </tbody></table></div>`
    : '<p class="muted small">Keine Luftstreitkräfte.</p>';
  const line = ['jaegerMk1', 'jaegerMk2', 'advancedFighter'].map((id) => {
    const d = AIRCRAFT_BY_ID[id];
    const err = canProduce(state, c, 'aircraft', id);
    const tech = d.requiresTech ? TECH_BY_ID[d.requiresTech]?.name : null;
    return `<div class="devline-step ${err ? '' : 'is-ready'}"${tipAttr(`${esc(d.name)}: Luftkampf ${d.airAttack}, Boden ${d.groundAttack}, ${formatNumber(d.speed)} km/h, Reichweite ${formatNumber(d.range)} km, Nutzlast ${d.payload} t, Kosten ${formatBn(d.cost)}, Zuverlässigkeit ${pct(d.reliability)}${tech ? `<br>Benötigt: ${esc(tech)}` : ''}${err ? `<br><b>${esc(err)}</b>` : '<br><b>Produzierbar</b>'}`)}><b>${esc(d.name)}</b><span class="small muted">${tech ? esc(tech) : 'Grundmodell'}</span><span class="small ${err ? 'bad' : 'good'}">${err ? 'gesperrt' : 'produzierbar'}</span></div>`;
  }).join('<span class="devline-arrow">→</span>');
  return `
    ${section('Luftstreitkräfte', `<div class="stat-grid">${stat('Flugzeuge', formatNumber(aircraftCount(c)))}${stat('Luftstärke', formatNumber(m.airPower))}${stat('Luftwaffenbasen', `${facilityTotal(state, c, 'airBase')} Stufen`)}${stat('Basiskapazität', `${formatNumber(aircraftCount(c))} / ${formatNumber(airCap)}`, { cls: aircraftCount(c) > airCap ? 'bad' : '', tip: 'Flugzeuge über der Kapazität verlieren Einsatzbereitschaft.' })}</div>${table}`)}
    ${section('Entwicklungslinie Jagdflugzeuge', `<div class="devline">${line}</div><p class="muted small">Neue Muster werden über Forschung (Militärtechnologien) freigeschaltet und in Flugzeugfabriken produziert – oder bei Herstellern beschafft.</p>`)}
    ${section('Rollen', `<div class="tag-list">${Object.entries(AIRCRAFT_ROLES).map(([r, d]) => `<span class="tag">${d.name}: ${formatNumber(aircraftCount(c, r))}</span>`).join('')}</div>`)}`;
}

function navy(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const navalCap = facilityTotal(state, c, 'navalBase') * FACILITIES.navalBase.capacity;
  const fleets = m.fleets.length
    ? m.fleets
        .map((f) => `<div class="fleet-card"><header><b>${esc(f.name)}</b><span class="small muted">Heimathafen ${regionLink(f.base)}</span></header>
          <div class="tag-list">${Object.entries(f.ships).filter(([, n]) => n > 0).map(([cls, n]) => `<span class="tag">${SHIP_CLASSES[cls].name}: ${n}</span>`).join('')}</div>
          <div class="sup-row"><span class="small">Zustand</span>${meter(f.condition * 100, { tone: f.condition > 0.6 ? 'good' : 'bad' })}<span class="num small">${pct(f.condition)} · Ø ${formatNumber(f.age)} J.</span></div></div>`)
        .join('')
    : '<p class="muted small">Keine Seestreitkräfte.</p>';
  const classes = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Klasse</th><th>Bestand</th><th${tipAttr('Seekampf / U-Jagd / Luftabwehr')}>See/U/Luft</th><th>Werft</th><th>Bauzeit</th><th>Kosten</th><th>Bau</th></tr></thead><tbody>
    ${SHIP_CLASS_IDS.map((cls) => {
      const d = SHIP_CLASSES[cls];
      const err = canProduce(state, c, 'ship', cls);
      return `<tr><td>${d.name}</td><td class="num">${shipCount(c, cls)}</td><td class="num">${d.naval}/${d.antiSub}/${d.airDefense}</td><td class="num">Stufe ${d.shipyard}</td><td class="num">${d.minMonths} Mon.</td><td class="num">${formatBn(d.cost)}</td><td class="small ${err ? 'bad' : 'good'}">${err ? esc(err) : 'möglich'}</td></tr>`;
    }).join('')}
  </tbody></table></div>
  <p class="muted small">Schiffe benötigen Werften (Stufe je Klasse), Stahl/Metalle und Elektronik (Rohstoffe vom Weltmarkt), Geld und Zeit. Größere Werften bauen mehrere Rümpfe parallel.</p>`;
  return `
    ${section('Seestreitkräfte', `<div class="stat-grid">${stat('Schiffe', formatNumber(shipCount(c)))}${stat('Seestärke', formatNumber(m.navalPower))}${stat('Marinebasen', `${facilityTotal(state, c, 'navalBase')} Stufen`)}${stat('Hafenkapazität', `${shipCount(c)} / ${navalCap}`, { cls: shipCount(c) > navalCap ? 'bad' : '' })}</div>${fleets}`)}
    ${section('Schiffsklassen', classes)}`;
}

function productOptions(state, c) {
  const group = (label, kind, ids, name) =>
    `<optgroup label="${label}">${ids
      .map((id) => {
        const err = canProduce(state, c, kind, id);
        if (err && kind === 'aircraft' && AIRCRAFT_BY_ID[id].origin !== 'national' && err.startsWith('Lizenz')) return '';
        return `<option value="${kind}:${id}"${err ? ' disabled' : ''}>${esc(name(id))}${err ? ` – ${esc(err)}` : ''}</option>`;
      })
      .join('')}</optgroup>`;
  return (
    group('Ausrüstung', 'equipment', EQUIPMENT_IDS.filter((id) => EQUIPMENT[id].factory), (id) => EQUIPMENT[id].name) +
    group('Flugzeuge', 'aircraft', AIRCRAFT.map((a) => a.id), (id) => `${AIRCRAFT_BY_ID[id].name} (${AIRCRAFT_ROLES[AIRCRAFT_BY_ID[id].role].name})`) +
    group('Schiffe', 'ship', SHIP_CLASS_IDS, (id) => SHIP_CLASSES[id].name)
  );
}

function production(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const costF = productionCostFactor(c);
  const factories = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Fabriktyp</th><th>Stufen</th><th${tipAttr('Produktionspunkte pro Monat (Mobilmachung erhöht die Kapazität)')}>Kapazität</th><th>Produziert</th></tr></thead><tbody>
    ${FACTORY_TYPES.map((t) => `<tr><td>${FACILITIES[t].icon} ${FACILITIES[t].name}</td><td class="num">${formatNumber(factoryLevels(state, c, t), 1)}</td><td class="num">${formatNumber(factoryCapacity(state, c, t))} PP</td><td class="small muted">${esc(FACILITIES[t].produces)}</td></tr>`).join('')}
  </tbody></table></div>`;
  const form = `<form class="inline-form" data-cmd-form="${attr({ type: 'queueProduction' })}">
      <label class="field grow"><span>Produkt</span><select name="product">${productOptions(state, c)}</select></label>
      <label class="field"><span>Menge</span><input type="number" name="quantity" min="1" max="1000000000" step="1" value="10"></label>
      <button class="btn btn-primary" type="submit">In Auftrag geben</button>
    </form>`;
  const queue = m.production.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Produkt</th><th>Fortschritt</th><th${tipAttr('Fertigstellung pro Monat (letzter Monat)')}>Rate</th><th>Stückkosten</th><th>Status</th><th></th></tr></thead><tbody>
      ${m.production.map((l, i) => {
        const d = itemDef(l.kind, l.item);
        const rate = l.lastRate ?? 0;
        const eta = rate > 0 ? Math.ceil((l.quantity - l.done - l.progress / d.pp) / rate) : null;
        return `<tr><td class="num">${i + 1}</td><td>${esc(d.name)} <span class="muted small">${KIND_NAMES[l.kind]}</span></td>
          <td><span class="num">${formatNumber(l.done)} / ${formatNumber(l.quantity)}</span>${meter(((l.done + l.progress / d.pp) / l.quantity) * 100)}</td>
          <td class="num">${rate >= 10 ? formatNumber(rate) : rate.toFixed(2)}/Mon.</td>
          <td class="num">${formatPrice(d.cost * costF)}</td>
          <td class="small ${l.blocked ? 'bad' : ''}">${l.blocked ? esc(l.blocked) : eta !== null ? `fertig in ~${eta} Mon.` : rate === 0 && l.lastRate !== undefined ? 'wartet (Kapazität/Budget)' : 'startet nächsten Monat'}</td>
          <td class="row-actions">${cmdButton(ui, '▲', { type: 'prioritizeProduction', lineId: l.id, direction: 'up' }, { cls: 'btn-sm', tip: 'Höhere Priorität (zuerst Kapazität und Budget)' })}${cmdButton(ui, '▼', { type: 'prioritizeProduction', lineId: l.id, direction: 'down' }, { cls: 'btn-sm', tip: 'Niedrigere Priorität' })}${cmdButton(ui, '✕', { type: 'cancelProduction', lineId: l.id }, { cls: 'btn-sm btn-danger', confirm: 'Auftrag stornieren? Bereits investierte Mittel sind verloren.' })}</td></tr>`;
      }).join('')}
    </tbody></table></div>`
    : '<p class="muted small">Keine Produktionsaufträge.</p>';
  return `
    ${section('Rüstungsindustrie', factories)}
    ${section('Neuer Produktionsauftrag', `${form}<p class="muted small">Die Reihenfolge der Aufträge ist ihre Priorität: Kapazität und Geld gehen zuerst an Auftrag 1. Rohstoffmangel (Metalle) senkt die Kapazität.</p>`)}
    ${section(`Produktionswarteschlange (${m.production.length})`, queue, { tut: 'production' })}`;
}

function procurement(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const offers = procurementOffers(state, c.id);
  const bySupplier = new Map();
  for (const o of offers) {
    if (!bySupplier.has(o.supplier)) bySupplier.set(o.supplier, []);
    bySupplier.get(o.supplier).push(o);
  }
  const filter = ui.procurementFilter ?? 'all';
  const kinds = [['all', 'Alle'], ['equipment', 'Ausrüstung'], ['aircraft', 'Flugzeuge'], ['ship', 'Schiffe']];
  const suppliers = [...bySupplier.entries()]
    .map(([, list]) => {
      const s = list[0];
      const home = state.countries[s.home];
      const rows = list
        .filter((o) => filter === 'all' || o.kind === filter)
        .map((o) => `<tr><td>${esc(o.name)} <span class="muted small">${KIND_NAMES[o.kind]}</span></td><td class="num">${formatPrice(o.unitPrice)}</td><td class="num">${o.leadMonths} Mon.</td><td class="num">${o.rate >= 1 ? formatNumber(o.rate) : o.rate.toFixed(2)}/Mon.</td>
          <td>${o.refusal ? '' : `<form class="inline-form compact" data-cmd-form="${attr({ type: 'signContract', supplier: o.supplier, kind: o.kind, item: o.item })}"><input type="number" name="quantity" min="1" max="${o.maxQuantity}" value="${Math.max(1, Math.min(o.maxQuantity, Math.round(o.rate * 12)))}" aria-label="Menge"><button class="btn btn-sm" type="submit"${tipAttr(`Bis zu ${formatNumber(o.maxQuantity)} Stück (Lieferung ${o.rate >= 1 ? formatNumber(o.rate) : o.rate.toFixed(2)} pro Monat). Anzahlung 15 % sofort aus der Staatskasse, Rest bei Lieferung aus dem Verteidigungshaushalt.`)}>Kaufen</button></form>`}</td></tr>`)
        .join('');
      if (!rows) return '';
      return `<div class="supplier-card${s.refusal ? ' is-refused' : ''}"><header><b>${esc(s.supplierName)}</b><span class="small muted">${home ? `${flag(home)} ${esc(home.name)}` : ''}</span></header>
        ${s.refusal ? `<p class="small bad">Liefert nicht: ${esc(s.refusal)}</p>` : ''}
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Produkt</th><th>Stückpreis</th><th>Lieferzeit</th><th>Rate</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    })
    .join('');
  const contracts = m.contracts.filter((x) => x.status !== 'completed');
  const ctTable = contracts.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Produkt</th><th>Lieferant</th><th>Geliefert</th><th>Status</th><th></th></tr></thead><tbody>
      ${contracts.map((ct) => `<tr><td>${esc(itemDef(ct.kind, ct.item).name)}</td><td>${esc(offers.find((o) => o.supplier === ct.supplier)?.supplierName ?? ct.supplier)}</td><td class="num">${formatNumber(ct.delivered)} / ${formatNumber(ct.quantity)}</td>
        <td class="small ${ct.status === 'suspended' ? 'bad' : ''}">${ct.status === 'suspended' ? 'Lieferstopp' : state.time.day < ct.firstDelivery ? `erste Lieferung ${formatDateDE(ct.firstDelivery)}` : 'liefert'}</td>
        <td>${cmdButton(ui, '✕', { type: 'cancelContract', contractId: ct.id }, { cls: 'btn-sm btn-danger', confirm: 'Vertrag stornieren? Die Anzahlung ist verloren.' })}</td></tr>`).join('')}
    </tbody></table></div>`
    : '<p class="muted small">Keine laufenden Verträge.</p>';
  return `
    ${section(`Laufende Verträge (${contracts.length})`, ctTable)}
    ${section('Internationaler Rüstungsmarkt', `<div class="seg-row">${kinds.map(([k, l]) => actionButton(l, 'setProcurementFilter', { filter: k }, { cls: filter === k ? 'btn-primary is-on' : '' })).join('')}</div>
      <p class="muted small">Verfügbarkeit hängt von Beziehungen, Bündnissen, Embargos und Kriegen ab. Viele Aufträge beim selben Hersteller verlängern Lieferzeiten und erhöhen Preise.</p>${suppliers}`, { tut: 'procurement' })}`;
}

function facilities(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const own = c.regionIds.filter((rid) => state.regions[rid].controller === c.id);
  own.sort((a, b) => STATIC_REGIONS[a].name.localeCompare(STATIC_REGIONS[b].name));
  const totals = `<div class="tag-list">${FACILITY_IDS.map((f) => `<span class="tag"${tipAttr(`${esc(FACILITIES[f].name)}: ${formatBn(FACILITIES[f].cost)} je Stufe, ${FACILITIES[f].months} Monate, Unterhalt ${formatBn(FACILITIES[f].upkeep)}/Jahr${FACILITIES[f].coastal ? ', nur an der Küste' : ''}`)}>${FACILITIES[f].icon} ${FACILITIES[f].name}: ${facilityTotal(state, c, f)}</span>`).join('')}</div>`;
  const form = `<form class="inline-form" data-cmd-form="${attr({ type: 'buildFacility' })}">
      <label class="field"><span>Anlage</span><select name="facility">${FACILITY_IDS.map((f) => `<option value="${f}">${FACILITIES[f].name} (${formatBn(FACILITIES[f].cost)}, ${FACILITIES[f].months} Mon.)</option>`).join('')}</select></label>
      <label class="field"><span>Region</span><select name="regionId">${own.map((rid) => `<option value="${rid}">${esc(STATIC_REGIONS[rid].name)}${STATIC_REGIONS[rid].coastal ? ' (Küste)' : ''}</option>`).join('')}</select></label>
      <label class="field field-narrow"><span>Stufen</span><input type="number" name="levels" min="1" max="10" step="1" value="1"></label>
      <button class="btn btn-primary" type="submit">Bauen</button>
    </form>
    <p class="muted small">Mehrere Stufen werden gleichzeitig gebaut – z. B. 5 Stufen Werft sind nach einer Bauzeit fertig, kosten aber 5-mal so viel pro Monat.</p>`;
  // identical projects (same facility, region and progress) are shown as one line "× n"
  const grouped = new Map();
  for (const p of m.construction) {
    const key = `${p.type}|${p.region}|${p.monthsDone}|${p.stalled ?? ''}`;
    const g = grouped.get(key);
    if (g) g.n++;
    else grouped.set(key, { p, n: 1 });
  }
  const queue = m.construction.length
    ? `<ul class="list">${[...grouped.values()].map(({ p, n }) => `<li><span>${FACILITIES[p.type].icon} ${FACILITIES[p.type].name}${n > 1 ? ` <b>× ${n} Stufen</b>` : ''} · ${regionLink(p.region)}</span><span class="num ${p.stalled ? 'bad' : ''}">${p.monthsDone}/${p.months} Mon.${p.stalled ? ` – ${esc(p.stalled)}` : ''}</span></li>`).join('')}</ul>`
    : '<p class="muted small">Keine Bauprojekte.</p>';
  const withBuildings = c.regionIds.filter((rid) => Object.values(state.regions[rid].buildings).some((lv) => lv > 0));
  const list = withBuildings.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Region</th><th>Anlagen</th></tr></thead><tbody>${withBuildings
        .map((rid) => `<tr><td>${regionLink(rid)}${state.regions[rid].controller !== c.id ? ' <span class="bad small">besetzt</span>' : ''}</td><td>${Object.entries(state.regions[rid].buildings).filter(([, lv]) => lv > 0).map(([f, lv]) => `${FACILITIES[f].icon} ${FACILITIES[f].name} ${lv}`).join(' · ')}</td></tr>`)
        .join('')}</tbody></table></div>`
    : '<p class="muted small">Keine Anlagen.</p>';
  const firstErr = own.length ? constructionError(state, c, own[0], 'depot') : 'Keine kontrollierten Regionen.';
  return `
    ${section('Bestand', totals)}
    ${section('Neue Anlage', `${form}${firstErr && !own.length ? `<p class="bad small">${esc(firstErr)}</p>` : ''}<p class="muted small">Bauprojekte werden monatlich aus dem Verteidigungshaushalt bezahlt. Besetzte Regionen stoppen den Bau.</p>`)}
    ${section(`Bauprojekte (${m.construction.length})`, queue)}
    ${section('Anlagen nach Region', list)}`;
}

function stock(ui) {
  const state = ui.session.state;
  const c = ui.session.player;
  const m = c.military;
  const eq = equipmentStatus(c);
  const war = dailyNeeds(c, 1);
  const equipRows = EQUIPMENT_IDS.filter((id) => !CONSUMABLES.includes(id)).map((id) => {
    const d = EQUIPMENT[id];
    const st = eq.items[id];
    let status = '<span class="good">vollständig</span>';
    let action = '';
    if (st) {
      if (st.deficit > 0) {
        status = `<span class="bad">${formatNumber(st.deficit)} fehlen</span>`;
        const plan = restockPlan(state, c, id, st.deficit * 1.05);
        action = plan ? cmdButton(ui, 'Bestellen', plan.cmd, { cls: 'btn-sm', tip: `${formatNumber(plan.cmd.quantity)} ${d.unit} – ${esc(plan.how)}, ${formatBn(plan.cost)}, ca. ${plan.months} Mon.` }) : '<span class="small muted">nicht beschaffbar</span>';
      } else if (st.stock < st.need) {
        status = '<span class="warn">bestellt</span>';
      } else {
        status = `<span class="good"${tipAttr('Liegt im Lager und wird zum Monatsersten an die Verbände ausgegeben – sofern der Engpass es zulässt.')}>im Lager</span>`;
      }
    }
    return `<tr${eq.bottleneck === id ? ' class="is-bottleneck"' : ''}><td>${d.name}${eq.bottleneck === id ? ' <span class="chip chip-bad">Engpass</span>' : ''}</td>
      <td class="num">${st ? formatNumber(st.need) : '–'}</td>
      <td class="num">${formatNumber(m.stock[id])}</td>
      <td class="num">${st?.incoming ? formatNumber(st.incoming) : '–'}</td>
      <td class="small">${status}</td><td>${action}</td></tr>`;
  }).join('');
  const supplyRows = CONSUMABLES.map((id) => {
    const d = EQUIPMENT[id];
    const days = war[id] ? m.stock[id] / war[id] : null;
    return `<tr><td>${d.name}</td><td class="num">${formatNumber(m.stock[id])} ${d.unit}</td>
      <td class="num">${war[id] ? `${formatNumber(war[id])}/Tag` : '–'}</td>
      <td class="num ${days !== null && days < 20 ? 'bad' : ''}">${days !== null ? `${formatNumber(Math.min(999, days))} Tage` : '–'}</td>
      <td class="small muted">${d.factory ? FACILITIES[d.factory].name : 'Weltmarkt'}</td></tr>`;
  }).join('');
  const bn = eq.bottleneck ? EQUIPMENT[eq.bottleneck].name : null;
  return `
    ${section('Ausrüstung der Verbände', `<div class="howto small">Ein Verband wird nur so weit aufgefüllt, wie <b>alle</b> Güter vorhanden sind, die er braucht. ${bn ? `Derzeit bremst <b>${esc(bn)}</b> – mehr von anderen Gütern hilft erst, wenn dieser Engpass behoben ist.` : 'Alle Verbände sind versorgt.'} Neue Ausrüstung wird jeweils zum Monatsersten an die Truppe ausgegeben.</div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Gut</th><th${tipAttr('Was den Verbänden (auch in Ausbildung) bis zur vollen Ausrüstung fehlt')}>Bedarf</th><th>Im Lager</th><th${tipAttr('Bestellt: laufende Produktion und Kaufverträge')}>Bestellt</th><th>Status</th><th></th></tr></thead><tbody>${equipRows}</tbody></table></div>`)}
    ${section('Verbrauchsgüter', `<div class="table-wrap"><table class="data-table"><thead><tr><th>Gut</th><th>Bestand</th><th${tipAttr('Bedarf pro Tag bei vollem Kampfeinsatz')}>Bedarf</th><th${tipAttr('Reichweite bei vollem Kampfeinsatz aller aktiven Verbände')}>Reichweite</th><th>Quelle</th></tr></thead><tbody>${supplyRows}</tbody></table></div>
      <p class="muted small">Treibstoff und Verpflegung werden monatlich am Weltmarkt nachgekauft (Ölknappheit durch Embargos/Blockaden begrenzt Treibstoff). Munition, Ersatzteile und Ausrüstung kommen aus der Produktion; Notkäufe sind teuer und begrenzt.</p>
      ${isAtWar(ui.session.state, c.id) && m.supplyFill ? `<p class="small">Nachschub gestern: Treibstoff ${pct(m.supplyFill.fuel)}, Munition ${pct(m.supplyFill.ammunition)}, Verpflegung ${pct(m.supplyFill.rations)}</p>` : ''}`)}`;
}

const TAB_RENDER = { quick, overview, army, air, navy, production, procurement, facilities, stock };

export const MilitaryPanel = {
  id: 'military',
  title: 'Militär',
  render(ui) {
    const tab = TAB_RENDER[ui.militaryTab] ? ui.militaryTab : 'quick';
    const tabs = `<div class="tab-row" role="tablist" data-tut="military-tabs">${MILITARY_TABS.map(([id, label]) => `<button class="tab-btn${id === tab ? ' is-active' : ''}" role="tab" aria-selected="${id === tab}" data-action="setMilitaryTab" data-tab="${id}">${label}</button>`).join('')}</div>`;
    return tabs + TAB_RENDER[tab](ui);
  },
};
