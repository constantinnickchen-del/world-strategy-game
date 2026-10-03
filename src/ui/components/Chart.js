/**
 * Lightweight SVG line chart for time series (single series per chart; use
 * several charts as small multiples instead of multi-colour overlays).
 *
 * Panels declare `<div class="chart" data-chart="key"></div>` and provide
 * `charts()` -> { key: { values, endDay, format, color?, baseline? } }.
 * The UIManager mounts them after rendering. Hovering shows a crosshair and
 * a tooltip with the month and value.
 */
import { addMonths, fromDayNumber, MONTH_SHORT_DE } from '../../core/calendar.js';
import { esc } from '../../util/format.js';

const W = 320;
const H = 110;
const PAD = { l: 44, r: 8, t: 8, b: 18 };

function niceTicks(min, max, count = 3) {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { lo, hi, ticks };
}

function monthLabel(day) {
  const d = fromDayNumber(day);
  return `${MONTH_SHORT_DE[d.month - 1]} ${d.year}`;
}

export function mountChart(el, spec) {
  const values = spec.values ?? [];
  if (values.length < 2) {
    el.innerHTML = '<p class="chart-empty muted">Noch keine Daten – die Verlaufskurve entsteht mit jedem Spielmonat.</p>';
    return;
  }
  const fmt = spec.format ?? ((v) => v.toFixed(1));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (spec.baseline !== undefined) {
    min = Math.min(min, spec.baseline);
    max = Math.max(max, spec.baseline);
  }
  const { lo, hi, ticks } = niceTicks(min, max);
  const x = (i) => PAD.l + (i / (values.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const color = spec.color ?? 'var(--brass)';
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  // The last value belongs to the current month: monthly samples are taken on the 1st.
  const firstDay = addMonths(spec.endDay, -(values.length - 1));
  const dayOf = (i) => addMonths(firstDay, i);
  const grid = ticks
    .map((t) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" class="chart-grid"/><text x="${PAD.l - 6}" y="${y(t) + 3}" class="chart-axis" text-anchor="end">${esc(fmt(t))}</text>`)
    .join('');
  const base = spec.baseline !== undefined ? `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(spec.baseline)}" y2="${y(spec.baseline)}" class="chart-base"/>` : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(spec.label ?? 'Verlauf')}">
      ${grid}${base}
      <polygon points="${x(0)},${y(lo)} ${pts} ${x(values.length - 1)},${y(lo)}" class="chart-area" style="fill:${color}"/>
      <polyline points="${pts}" class="chart-line" style="stroke:${color}"/>
      <text x="${PAD.l}" y="${H - 4}" class="chart-axis">${monthLabel(dayOf(0))}</text>
      <text x="${W - PAD.r}" y="${H - 4}" class="chart-axis" text-anchor="end">${monthLabel(dayOf(values.length - 1))}</text>
      <g class="chart-hover" visibility="hidden"><line class="chart-cross" y1="${PAD.t}" y2="${H - PAD.b}"/><circle r="4" class="chart-dot" style="stroke:${color}"/></g>
      <rect x="${PAD.l}" y="0" width="${W - PAD.l - PAD.r}" height="${H}" fill="transparent" class="chart-hit"/>
    </svg><div class="chart-tip" hidden></div>`;
  const svg = el.querySelector('svg');
  const hover = el.querySelector('.chart-hover');
  const tip = el.querySelector('.chart-tip');
  const hit = el.querySelector('.chart-hit');
  const show = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(((sx - PAD.l) / (W - PAD.l - PAD.r)) * (values.length - 1))));
    const cx = x(i);
    const cy = y(values[i]);
    hover.setAttribute('visibility', 'visible');
    hover.querySelector('line').setAttribute('x1', cx);
    hover.querySelector('line').setAttribute('x2', cx);
    hover.querySelector('circle').setAttribute('cx', cx);
    hover.querySelector('circle').setAttribute('cy', cy);
    tip.hidden = false;
    tip.innerHTML = `<span class="muted">${monthLabel(dayOf(i))}</span> <b class="num">${esc(fmt(values[i]))}</b>`;
    const left = (cx / W) * rect.width;
    tip.style.left = `${Math.min(rect.width - tip.offsetWidth, Math.max(0, left - tip.offsetWidth / 2))}px`;
  };
  hit.addEventListener('pointermove', (ev) => show(ev.clientX));
  hit.addEventListener('pointerdown', (ev) => show(ev.clientX));
  hit.addEventListener('pointerleave', () => {
    hover.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
}

export function mountCharts(root, specs) {
  if (!specs) return;
  for (const el of root.querySelectorAll('[data-chart]')) {
    const spec = specs[el.dataset.chart];
    if (spec) mountChart(el, spec);
  }
}
