import { gdpPerCapita, worldGdp, liveCountries } from '../../state/selectors.js';
import { formatBn, formatPopulation, formatSignedPct, formatUsd, formatNumber, esc } from '../../util/format.js';
import { section, flag } from '../widgets.js';

export const WORLD_METRICS = {
  gdp: { name: 'BIP', value: (c) => c.economy.gdp, fmt: formatBn },
  gdppc: { name: 'BIP/Kopf', value: gdpPerCapita, fmt: formatUsd },
  population: { name: 'Bevölkerung', value: (c) => c.population, fmt: formatPopulation },
  growth: { name: 'Wachstum', value: (c) => c.economy.growth, fmt: (v) => formatSignedPct(v) },
  military: { name: 'Militär', value: (c) => c.military.power, fmt: (v) => formatNumber(v) },
  stability: { name: 'Stabilität', value: (c) => c.politics.stability, fmt: (v) => formatNumber(v) },
};

export const WorldPanel = {
  id: 'world',
  title: 'Weltlage',
  render(ui) {
    const state = ui.session.state;
    const metric = WORLD_METRICS[ui.worldSort] ?? WORLD_METRICS.gdp;
    const sorted = liveCountries(state).sort((a, b) => metric.value(b) - metric.value(a));
    const playerIdx = sorted.findIndex((c) => c.id === state.playerId);
    const shown = sorted.slice(0, 25);
    const rowHtml = (c, i) => `<tr class="${c.id === state.playerId ? 'is-player' : ''}">
        <td class="num muted">${i + 1}</td>
        <td><button class="link" data-action="selectCountry" data-id="${c.id}">${flag(c)} ${esc(c.name)}</button></td>
        <td class="num">${metric.fmt(metric.value(c))}</td>
      </tr>`;
    const rows = shown.map(rowHtml).join('') + (playerIdx >= 25 ? `<tr class="gap"><td colspan="3">…</td></tr>${rowHtml(sorted[playerIdx], playerIdx)}` : '');
    const worldNews = state.news.filter((n) => n.category === 'world').slice(-5).reverse();
    return `
      ${section('Weltwirtschaft', `<p>Welt-BIP: <b class="num">${formatBn(worldGdp(state))}</b> · ${sorted.length} Staaten</p><div class="chart" data-chart="worldGdp"></div>`)}
      ${section(
        'Rangliste',
        `<div class="seg" role="group" aria-label="Sortierung">${Object.entries(WORLD_METRICS)
          .map(([id, m]) => `<button class="seg-btn${id === ui.worldSort ? ' is-active' : ''}" data-action="setWorldSort" data-sort="${id}" aria-pressed="${id === ui.worldSort}">${m.name}</button>`)
          .join('')}</div>
         <table class="table rank-table"><tbody>${rows}</tbody></table>`,
      )}
      ${section('Globale Ereignisse', worldNews.length ? `<ul class="list">${worldNews.map((n) => `<li class="small">${esc(n.text)}</li>`).join('')}</ul>` : '<p class="muted small">Bisher keine globalen Ereignisse.</p>')}`;
  },
  charts(ui) {
    const state = ui.session.state;
    return { worldGdp: { values: state.stats.worldGdpHistory, endDay: state.time.day, format: formatBn, label: 'Welt-BIP' } };
  },
};
