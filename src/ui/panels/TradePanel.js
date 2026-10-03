import { RESOURCES, RESOURCE_IDS } from '../../data/resources.js';
import { formatBn, formatNumber, formatPct, esc } from '../../util/format.js';
import { section, signClass } from '../widgets.js';
import { countryLink } from '../components/InfoPanel.js';

export const TradePanel = {
  id: 'trade',
  title: 'Handel & Rohstoffe',
  render(ui) {
    const state = ui.session.state;
    const c = ui.session.player;
    const t = c.trade;
    const rows = RESOURCE_IDS.map((rid) => {
      const r = c.resources[rid];
      const net = r.production - r.consumption;
      return `<tr>
        <td>${RESOURCES[rid].icon} ${esc(RESOURCES[rid].name)}</td>
        <td class="num">${formatNumber(r.production, 1)}</td>
        <td class="num">${formatNumber(r.consumption, 1)}</td>
        <td class="num ${signClass(net)}">${net > 0 ? '+' : ''}${formatNumber(net, 1)}</td>
        <td class="num ${r.shortage > 0.01 ? 'bad' : 'muted'}">${r.shortage > 0.01 ? formatNumber(r.shortage, 1) : '–'}</td>
      </tr>`;
    }).join('');
    const market = RESOURCE_IDS.map((rid) => {
      const m = state.market[rid];
      const rel = m.price / m.basePrice;
      return `<figure class="market-card">
          <figcaption><span>${RESOURCES[rid].icon} ${esc(RESOURCES[rid].name)}</span><b class="num ${rel > 1.05 ? 'bad' : rel < 0.95 ? 'good' : ''}" data-tip="Preisindex (100 = Ausgangspreis). Angebot ${formatNumber(m.supply)} · Nachfrage ${formatNumber(m.demand)} Einheiten/Jahr">${formatNumber(rel * 100)}</b></figcaption>
          <div class="chart" data-chart="price-${rid}"></div>
        </figure>`;
    }).join('');
    const partners = t.partners.length
      ? `<ul class="list">${t.partners.map((p) => `<li>${countryLink(state, p.id)}<span class="num muted">${formatBn(p.value)}/Jahr</span></li>`).join('')}</ul>`
      : '<p class="muted small">Kein Rohstoffhandel.</p>';
    return `
      ${section(
        'Ihre Handelsbilanz (Rohstoffe)',
        `<table class="table">
          <tr><td>Exporte</td><td class="num good">${formatBn(t.exports)}/Jahr</td></tr>
          <tr><td>Importe</td><td class="num bad">${formatBn(t.imports)}/Jahr</td></tr>
          <tr class="sum"><td>Saldo</td><td class="num ${signClass(t.balance)}">${formatBn(t.balance)}/Jahr</td></tr>
          <tr><td>Nicht gedeckter Bedarf</td><td class="num ${t.unmetValue > 0.01 ? 'bad' : ''}">${formatBn(t.unmetValue)}/Jahr</td></tr>
          <tr><td>Handelsabkommen</td><td class="num">${t.agreements ?? 0}</td></tr>
        </table>
        <p class="muted small">Exporterlöse fließen zu ${formatPct(c.economy.rentShare, 0)} als Rohstoffrente in die Staatskasse. Engpässe senken das Wachstum und treiben die Inflation.</p>`,
      )}
      ${section(
        'Produktion & Verbrauch (Einheiten/Jahr)',
        `<table class="table table-res"><thead><tr><th>Rohstoff</th><th>Förderung</th><th>Bedarf</th><th>Saldo</th><th>Engpass</th></tr></thead><tbody>${rows}</tbody></table>`,
      )}
      ${section('Wichtigste Handelspartner', partners)}
      ${section('Weltmarktpreise', `<p class="muted small">Index: 100 = Preisniveau zu Spielbeginn. Hohe Preise lassen Förderkapazitäten wachsen und dämpfen die Nachfrage.</p><div class="multiples">${market}</div>`)}`;
  },
  charts(ui) {
    const state = ui.session.state;
    const out = {};
    for (const rid of RESOURCE_IDS) {
      const m = state.market[rid];
      out[`price-${rid}`] = { values: m.history.map((p) => (p / m.basePrice) * 100), endDay: state.time.day, format: (v) => formatNumber(v), baseline: 100, label: `Preisindex ${RESOURCES[rid].name}`, color: 'var(--brass)' };
    }
    return out;
  },
};
