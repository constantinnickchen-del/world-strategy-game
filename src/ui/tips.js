/**
 * Rich tooltip contents that explain *why* a value is what it is.
 * Shared by the top bar and the panels.
 */
import { approvalFactors, stabilityFactors } from '../systems/politics.js';
import { potentialGrowth } from '../systems/economy.js';
import { gdpPerCapita, debtRatio, totalSpendingShare } from '../state/selectors.js';
import { formatBn, formatPct, formatUsd, formatSignedPct, esc } from '../util/format.js';
import { factorTable } from './widgets.js';

export function gdpTip(c) {
  const e = c.economy;
  return `<b>Bruttoinlandsprodukt</b><br>
    <table class="tip-table">
      <tr><td>BIP (real, Preise 2019)</td><td>${formatBn(e.gdp)}</td></tr>
      <tr><td>BIP pro Kopf</td><td>${formatUsd(gdpPerCapita(c))}</td></tr>
      <tr><td>Wachstum (annualisiert)</td><td>${formatSignedPct(e.growth)}</td></tr>
      <tr><td>Potenzialwachstum</td><td>${formatPct(potentialGrowth(c))}</td></tr>
    </table>
    <p class="tip-note">Wachstum hängt von Stabilität, Infrastruktur, Steuern, Inflation, Handel und Technologie ab.</p>`;
}

export function budgetTip(c) {
  const e = c.economy;
  const m = (v) => formatBn(v);
  return `<b>Staatshaushalt (letzter Monat)</b>
    <table class="tip-table">
      <tr><td>Steuereinnahmen</td><td class="good">+${m(e.lastRevenue)}</td></tr>
      <tr><td>Rohstoffrenten</td><td class="good">+${m(e.lastResourceRent)}</td></tr>
      <tr><td>Staatsausgaben (${formatPct(totalSpendingShare(c))} des BIP)</td><td class="bad">−${m(e.lastExpenses - e.lastInterest)}</td></tr>
      <tr><td>Zinsen (${formatPct(e.interestRate)})</td><td class="bad">−${m(e.lastInterest)}</td></tr>
      <tr class="tip-sum"><td>Saldo</td><td class="${e.lastBalance >= 0 ? 'good' : 'bad'}">${e.lastBalance >= 0 ? '+' : ''}${m(e.lastBalance)}</td></tr>
    </table>
    <p class="tip-note">Defizite werden über neue Schulden finanziert. Steuereffizienz: ${formatPct(e.lastTaxEfficiency, 0)}.</p>`;
}

export function debtTip(c) {
  const e = c.economy;
  return `<b>Staatsverschuldung</b>
    <table class="tip-table">
      <tr><td>Schulden</td><td>${formatBn(e.debt)}</td></tr>
      <tr><td>Schuldenquote</td><td>${formatPct(debtRatio(c), 0)}</td></tr>
      <tr><td>Toleranzgrenze der Märkte</td><td>${formatPct(e.debtTolerance, 0)}</td></tr>
      <tr><td>Zinssatz</td><td>${formatPct(e.interestRate)}</td></tr>
    </table>
    <p class="tip-note">Oberhalb der Toleranzgrenze steigen die Zinsen und das Wachstum leidet.</p>`;
}

export function inflationTip(c) {
  const e = c.economy;
  return `<b>Inflation</b>
    <table class="tip-table">
      <tr><td>Aktuell</td><td>${formatPct(e.inflation)}</td></tr>
      <tr><td>Inflationserwartung</td><td>${formatPct(e.inflationAnchor)}</td></tr>
      <tr><td>Rohstoffkostenindex</td><td>${e.costIndex.toFixed(2)}</td></tr>
      <tr><td>Rohstoffanteil am BIP</td><td>${formatPct(e.commodityShare)}</td></tr>
    </table>
    <p class="tip-note">Steigende Rohstoffpreise, Überhitzung, Versorgungsengpässe und gelddruckfinanzierte Defizite treiben die Inflation.</p>`;
}

export function approvalTip(c) {
  return `<b>Zustimmung zur Regierung: ${Math.round(c.politics.approval)}</b><p class="tip-note">Bewegt sich langsam auf den Zielwert zu:</p>${factorTable(approvalFactors(c))}`;
}

export function stabilityTip(c) {
  return `<b>Stabilität: ${Math.round(c.politics.stability)}</b><p class="tip-note">Bewegt sich langsam auf den Zielwert zu:</p>${factorTable(stabilityFactors(c))}`;
}

export function unemploymentTip(c) {
  const e = c.economy;
  return `<b>Arbeitslosigkeit: ${formatPct(e.unemployment)}</b><p class="tip-note">Strukturelle Rate: ${formatPct(e.naturalUnemployment)}. Wachstum über dem Potenzial senkt die Arbeitslosigkeit.</p>`;
}

export function countryTitle(c) {
  return esc(c.name);
}
