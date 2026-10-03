import { BUDGET_CATEGORIES, BUDGET_IDS, TAX_LIMITS, debtRatio, totalSpendingShare } from '../../state/selectors.js';
import { formatBn, formatPct, formatSignedPct } from '../../util/format.js';
import { section, slider, stat, cmdButton, signClass } from '../widgets.js';
import { budgetTip, debtTip, inflationTip, unemploymentTip, gdpTip } from '../tips.js';

const pct = (v) => Math.round(v * 1000) / 10;

export const EconomyPanel = {
  id: 'economy',
  title: 'Wirtschaft & Haushalt',
  render(ui) {
    const c = ui.session.player;
    const e = c.economy;
    const sliders = BUDGET_IDS.map((id) => {
      const def = BUDGET_CATEGORIES[id];
      const v = c.budget[id];
      return slider({
        cmd: { type: 'setBudget', category: id },
        value: pct(v),
        min: def.min * 100,
        max: def.max * 100,
        step: id === 'research' ? 0.1 : 0.5,
        label: def.name,
        display: `${pct(v).toFixed(1)} % · ${formatBn((e.gdp * v) / 12)}/Monat`,
        tip: `<b>${def.name}</b><br>${def.description}<br><span class="muted">Anteil am BIP, ${def.min * 100}–${def.max * 100} %</span>`,
      });
    }).join('');
    const repayAmount = Math.min(e.treasury * 0.5, e.debt);
    return `
      ${section(
        'Lage',
        `<div class="stat-grid">
          ${stat('Wachstum', `<span class="${signClass(e.growth)}">${formatSignedPct(e.growth)}</span>`, { tip: gdpTip(c) })}
          ${stat('Inflation', formatPct(e.inflation), { tip: inflationTip(c) })}
          ${stat('Arbeitslosigkeit', formatPct(e.unemployment), { tip: unemploymentTip(c) })}
          ${stat('Staatskasse', formatBn(e.treasury), { tip: budgetTip(c) })}
          ${stat('Schulden', `${formatBn(e.debt)} (${formatPct(debtRatio(c), 0)})`, { tip: debtTip(c) })}
          ${stat('Zinssatz', formatPct(e.interestRate), { tip: debtTip(c) })}
        </div>`,
      )}
      ${section(
        'Steuern',
        `${slider({
          cmd: { type: 'setTaxRate' },
          value: pct(e.taxRate),
          min: TAX_LIMITS.min * 100,
          max: TAX_LIMITS.max * 100,
          label: 'Steuer- und Abgabenquote',
          display: `${pct(e.taxRate).toFixed(1)} % des BIP`,
          tip: '<b>Steuerquote</b><br>Höhere Steuern bringen mehr Einnahmen, senken aber Zustimmung und Wachstum. Über 45 % sinkt die Steuereffizienz (Ausweichverhalten).',
        })}
        <p class="muted small">Steuereffizienz: ${formatPct(e.lastTaxEfficiency, 0)} – abhängig von Stabilität, Infrastruktur und Verwaltung.</p>`,
      )}
      ${section(
        'Staatsausgaben',
        `${sliders}
        <table class="table">
          <tr><td>Einnahmen (Steuern + Rohstoffrenten)</td><td class="num good">+${formatBn(e.lastRevenue + e.lastResourceRent)}</td></tr>
          <tr><td>Ausgaben (${formatPct(totalSpendingShare(c))} des BIP)</td><td class="num bad">−${formatBn(e.lastExpenses - e.lastInterest)}</td></tr>
          <tr><td>Zinsen</td><td class="num bad">−${formatBn(e.lastInterest)}</td></tr>
          <tr class="sum"><td>Saldo pro Monat</td><td class="num ${signClass(e.lastBalance)}">${formatBn(e.lastBalance)}</td></tr>
        </table>
        <p class="muted small">Änderungen wirken ab dem nächsten Monatswechsel.</p>`,
      )}
      ${section(
        'Schulden tilgen',
        `<p class="muted small">Tilgung aus der Staatskasse senkt die Zinslast und den Risikoaufschlag.</p>
        <div class="btn-row">
          ${cmdButton(ui, `${formatBn(repayAmount)} tilgen`, { type: 'repayDebt', amount: repayAmount }, { tip: 'Die Hälfte der Staatskasse zur Tilgung verwenden.' })}
          ${cmdButton(ui, 'Maximal tilgen', { type: 'repayDebt', amount: Math.min(e.treasury, e.debt) }, { tip: 'Die gesamte Staatskasse zur Tilgung verwenden.' })}
        </div>`,
      )}
      ${section('Verlauf', `<div class="multiples">
          <figure><figcaption>Wachstum</figcaption><div class="chart" data-chart="growth"></div></figure>
          <figure><figcaption>Arbeitslosigkeit</figcaption><div class="chart" data-chart="unemployment"></div></figure>
          <figure><figcaption>Inflation</figcaption><div class="chart" data-chart="inflation"></div></figure>
          <figure><figcaption>Staatskasse</figcaption><div class="chart" data-chart="treasury"></div></figure>
        </div>`)}`;
  },
  charts(ui) {
    const h = ui.session.player.history;
    const endDay = ui.session.state.time.day;
    return {
      growth: { values: h.growth, endDay, format: (v) => formatPct(v), baseline: 0, label: 'Wachstum' },
      unemployment: { values: h.unemployment, endDay, format: (v) => formatPct(v), label: 'Arbeitslosigkeit' },
      inflation: { values: h.inflation, endDay, format: (v) => formatPct(v), baseline: 0, label: 'Inflation' },
      treasury: { values: h.treasury, endDay, format: formatBn, label: 'Staatskasse' },
    };
  },
};
