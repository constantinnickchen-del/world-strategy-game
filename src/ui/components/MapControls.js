/**
 * Map overlay controls: map mode switcher, resource picker, legend, zoom.
 */
import { MAP_MODES, MAP_MODE_BY_ID } from '../../map/mapModes.js';
import { RESOURCES, RESOURCE_IDS } from '../../data/resources.js';
import { esc } from '../../util/format.js';

export class MapControls {
  constructor(el, ui) {
    this.el = el;
    this.ui = ui;
  }

  render() {
    const ui = this.ui;
    const state = ui.session.state;
    const hasPlayer = !!state?.playerId;
    const modes = MAP_MODES.filter((m) => !m.needsPlayer || hasPlayer);
    const mode = MAP_MODE_BY_ID[ui.mapMode];
    const legend = mode && state ? mode.legend(state, ui) : null;
    let legendHtml = '';
    if (legend?.type === 'gradient') {
      legendHtml = `<div class="legend-gradient" style="background:${legend.css}"></div><div class="legend-ends"><span>${esc(legend.min)}</span><span>${esc(legend.max)}</span></div>`;
    } else if (legend?.type === 'swatches') {
      legendHtml = `<ul class="legend-swatches">${legend.items.map(([col, label]) => `<li><i style="background:${col}"></i>${esc(label)}</li>`).join('')}</ul>`;
    } else if (legend?.type === 'text') {
      legendHtml = `<p class="legend-text">${esc(legend.text)}</p>`;
    }
    this.el.innerHTML = `
      <div class="map-modes" role="toolbar" aria-label="Kartenmodus">
        ${modes.map((m) => `<button class="mode-btn${m.id === ui.mapMode ? ' is-active' : ''}" data-action="setMapMode" data-mode="${m.id}" aria-pressed="${m.id === ui.mapMode}" data-tip="Kartenmodus: ${m.name}"><span aria-hidden="true">${m.icon}</span><span class="mode-label">${m.name}</span></button>`).join('')}
      </div>
      <div class="map-legend">
        <div class="legend-title">${esc(mode?.name ?? '')}</div>
        ${mode?.hasResourcePicker ? `<div class="resource-picker">${RESOURCE_IDS.map((r) => `<button class="res-btn${r === ui.mapResource ? ' is-active' : ''}" data-action="setMapResource" data-resource="${r}" data-tip="${RESOURCES[r].name}" aria-label="${RESOURCES[r].name}">${RESOURCES[r].icon}</button>`).join('')}</div>` : ''}
        ${legendHtml}
      </div>
      <div class="map-zoom" role="group" aria-label="Zoom">
        <button class="icon-btn" data-action="zoom" data-factor="1.5" aria-label="Hineinzoomen" data-tip="Hineinzoomen (Mausrad)">+</button>
        <button class="icon-btn" data-action="zoom" data-factor="0.667" aria-label="Herauszoomen" data-tip="Herauszoomen (Mausrad)">−</button>
        <button class="icon-btn" data-action="resetView" aria-label="Ganze Welt" data-tip="Ganze Welt anzeigen">◎</button>
        <button class="icon-btn${ui.settings.showLabels ? ' is-active' : ''}" data-action="toggleLabels" aria-label="Ländernamen ein/aus" aria-pressed="${ui.settings.showLabels}" data-tip="Ländernamen ein-/ausblenden">Aa</button>
        ${hasPlayer ? `<button class="icon-btn news-toggle" data-action="togglePanel" data-panel="news" aria-label="Nachrichten" data-tip="<b>Nachrichten</b> <span class='kbd'>O</span>"><span aria-hidden="true">📰</span><span class="nav-badge" data-news-badge hidden></span></button>` : ''}
      </div>`;
    this.update();
  }

  /** Active state of the news button and the dot for unread major news. */
  update() {
    const btn = this.el.querySelector('.news-toggle');
    if (!btn) return;
    const on = this.ui.activePanel === 'news';
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('[data-news-badge]').hidden = on || !this.ui.unreadNews;
  }
}
