/**
 * Small HTML template helpers shared by all panels.
 *
 * Interactivity is declarative: elements carry data attributes that the
 * UIManager handles through event delegation:
 *   data-action="name" (+ data-* params)     -> ui.actions[name]
 *   data-cmd='{"type":...}'                  -> executes a game command
 *   data-slider='{"type":..., "category":..}' on <input type=range> -> command with value/100
 *   data-tip="html"                          -> tooltip
 * Command buttons are validated at render time, so a button is only enabled
 * when the command would succeed; otherwise the tooltip explains why.
 */
import { esc, flagEmoji } from '../util/format.js';

export function attr(obj) {
  return esc(JSON.stringify(obj));
}

export function flag(c) {
  return `<span class="flag" aria-hidden="true">${flagEmoji(c.iso2)}</span>`;
}

export function tipAttr(html) {
  return html ? ` data-tip="${esc(html)}"` : '';
}

export function cmdButton(ui, label, cmd, { cls = '', tip = '', confirm = '' } = {}) {
  const error = ui.session.validate(cmd);
  const t = error ? `<b>Nicht möglich:</b> ${esc(error)}${tip ? `<br>${tip}` : ''}` : tip;
  return `<button class="btn ${cls}" data-cmd="${attr(cmd)}"${confirm ? ` data-confirm="${esc(confirm)}"` : ''}${error ? ' disabled aria-disabled="true"' : ''}${tipAttr(t)}>${label}</button>`;
}

export function actionButton(label, action, data = {}, { cls = '', tip = '', disabled = false } = {}) {
  const ds = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return `<button class="btn ${cls}" data-action="${action}"${ds}${disabled ? ' disabled' : ''}${tipAttr(tip)}>${label}</button>`;
}

export function stat(label, value, { tip = '', cls = '' } = {}) {
  return `<div class="stat ${cls}"${tipAttr(tip)}><span class="stat-label">${label}</span><span class="stat-value num">${value}</span></div>`;
}

export function meter(value, { max = 100, tone = 'brass', label = '' } = {}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="meter meter-${tone}" role="meter" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="${max}"${label ? ` aria-label="${esc(label)}"` : ''}><span style="width:${pct.toFixed(1)}%"></span></div>`;
}

/** Opinion bar from -100 to +100 with a centre mark. */
export function opinionBar(opinion) {
  const v = Math.max(-100, Math.min(100, opinion));
  const left = v < 0 ? 50 + v / 2 : 50;
  const width = Math.abs(v) / 2;
  return `<div class="opinion-bar" role="meter" aria-valuenow="${Math.round(v)}" aria-valuemin="-100" aria-valuemax="100"><span class="${v < 0 ? 'neg' : 'pos'}" style="left:${left}%;width:${width}%"></span><i></i></div>`;
}

export function section(title, body, { extra = '' } = {}) {
  return `<section class="card"><header class="card-head"><h3>${title}</h3>${extra}</header>${body}</section>`;
}

export function slider({ cmd, value, min, max, step = 0.5, label, display, tip = '' }) {
  return `<label class="slider"${tipAttr(tip)}>
    <span class="slider-top"><span>${label}</span><output class="num">${display}</output></span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-slider="${attr(cmd)}">
  </label>`;
}

export function signClass(v) {
  return v > 0 ? 'good' : v < 0 ? 'bad' : '';
}

export function factorTable(factors, fmt = (v) => (v > 0 ? '+' : '') + v.toFixed(1)) {
  return `<table class="tip-table">${factors
    .filter((f) => Math.abs(f.value) >= 0.05)
    .map((f) => `<tr><td>${esc(f.label)}</td><td class="${f.label === 'Basis' || f.label === 'Regierungsform' ? '' : signClass(f.value)}">${fmt(f.value)}</td></tr>`)
    .join('')}</table>`;
}
