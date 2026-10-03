import { BUDGET_CATEGORIES } from '../../state/selectors.js';
import { alliesOf } from '../../systems/diplomacy.js';
import { neighborCountryIds } from '../../state/worldIndex.js';
import { getMod } from '../../systems/modifiers.js';
import { formatBn, formatNumber, formatPopulation, formatPct } from '../../util/format.js';
import { section, stat, slider } from '../widgets.js';
import { countryLink } from '../components/InfoPanel.js';

export const MilitaryPanel = {
  id: 'military',
  title: 'Militär',
  render(ui) {
    const state = ui.session.state;
    const c = ui.session.player;
    const m = c.military;
    const rank = ui.ranks().military[c.id];
    const allies = alliesOf(state, c.id);
    const alliedPower = allies.reduce((s, id) => s + (state.countries[id]?.military.power ?? 0), 0);
    const compare = (ids) =>
      `<ul class="list">${ids
        .map((id) => state.countries[id])
        .sort((a, b) => b.military.power - a.military.power)
        .map((x) => `<li>${countryLink(state, x.id)}<span class="num ${x.military.power > m.power ? 'bad' : 'good'}">${formatNumber(x.military.power)}</span></li>`)
        .join('')}</ul>`;
    const top = Object.entries(ui.ranks().military)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10)
      .map(([id]) => id);
    const def = BUDGET_CATEGORIES.military;
    return `
      ${section(
        'Streitkräfte',
        `<div class="stat-grid">
          ${stat('Militärstärke', formatNumber(m.power), { tip: 'Index aus Ausrüstung, Technologie, Stabilität und Infrastruktur (Logistik).' })}
          ${stat('Weltrang', `#${rank}`)}
          ${stat('Ausrüstungswert', formatBn(m.equipment), { tip: 'Angesammelte Militärausgaben abzüglich Abschreibung (≈10 % pro Jahr).' })}
          ${stat('Personal', formatPopulation(m.manpower))}
          ${stat('Technologiebonus', formatPct(getMod(c, 'militaryPower'), 0))}
          ${stat('Stärke der Verbündeten', formatNumber(alliedPower))}
        </div>`,
      )}
      ${section(
        'Militärbudget',
        slider({
          cmd: { type: 'setBudget', category: 'military' },
          value: Math.round(c.budget.military * 1000) / 10,
          min: def.min * 100,
          max: def.max * 100,
          label: 'Verteidigungsausgaben',
          display: `${(c.budget.military * 100).toFixed(1)} % · ${formatBn((c.economy.gdp * c.budget.military) / 12)}/Monat`,
          tip: 'Höhere Ausgaben bauen über Jahre Ausrüstung auf. In Nicht-Demokratien stützt das Militär zudem die Stabilität.',
        }),
      )}
      ${section('Nachbarn im Vergleich', neighborCountryIds(state, c.id).length ? compare(neighborCountryIds(state, c.id)) : '<p class="muted small">Keine Landgrenzen.</p>')}
      ${section('Verbündete', allies.length ? compare(allies) : '<p class="muted small">Keine Bündnispartner.</p>')}
      ${section('Größte Militärmächte', compare(top))}`;
  },
};
