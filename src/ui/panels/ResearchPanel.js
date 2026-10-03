import { TECHNOLOGIES, TECH_BY_ID, TECH_CATEGORIES } from '../../data/technologies.js';
import { techCost, isResearched, canResearch } from '../../systems/technology.js';
import { STATS, formatModValue, isPositiveMod } from '../../systems/modifiers.js';
import { formatNumber, formatPct, esc } from '../../util/format.js';
import { section, meter, cmdButton } from '../widgets.js';

function effects(tech) {
  return tech.effects.map((e) => `<span class="${isPositiveMod(e.stat, e.value) ? 'good' : 'bad'}">${STATS[e.stat].label} ${formatModValue(e.stat, e.value)}</span>`).join(' · ');
}

export const ResearchPanel = {
  id: 'research',
  title: 'Forschung',
  render(ui) {
    const state = ui.session.state;
    const c = ui.session.player;
    const t = c.technology;
    const pts = t.pointsPerMonth;
    const cur = t.current ? TECH_BY_ID[t.current] : null;
    const curHtml = cur
      ? (() => {
          const cost = techCost(state, cur.id);
          const done = t.progress[cur.id] ?? 0;
          const months = pts > 0 ? Math.ceil((cost - done) / pts) : Infinity;
          return `<p><b>${esc(cur.name)}</b></p>${meter((done / cost) * 100, { tone: 'teal' })}<p class="muted small">${formatNumber(done)} / ${formatNumber(cost)} Punkte · noch ca. ${Number.isFinite(months) ? `${months} Monate` : '∞'}</p>
            <p class="small">${effects(cur)}</p>${cmdButton(ui, 'Projekt pausieren', { type: 'setResearch', techId: null }, { tip: 'Der bisherige Fortschritt bleibt erhalten.' })}`;
        })()
      : '<p class="muted">Kein aktives Projekt – wählen Sie unten eine Technologie.</p>';

    const cats = Object.entries(TECH_CATEGORIES)
      .map(([catId, cat]) => {
        const items = TECHNOLOGIES.filter((x) => x.category === catId)
          .sort((a, b) => a.tier - b.tier)
          .map((tech) => {
            const done = isResearched(c, tech.id);
            const avail = canResearch(c, tech.id);
            const active = t.current === tech.id;
            const progress = t.progress[tech.id] ?? 0;
            const cost = techCost(state, tech.id);
            const req = tech.requires.filter((r) => !isResearched(c, r)).map((r) => TECH_BY_ID[r].name);
            const status = done ? '<span class="tech-status good">✓ Erforscht</span>' : active ? '<span class="tech-status warn">● In Arbeit</span>' : '';
            const button = !done && !active && avail ? cmdButton(ui, progress > 0 ? 'Fortsetzen' : 'Erforschen', { type: 'setResearch', techId: tech.id }, { cls: 'btn-small btn-primary' }) : '';
            const diffusion = state.stats.techDiffusion?.[tech.id] ?? 0;
            return `<li class="tech ${done ? 'is-done' : avail ? 'is-available' : 'is-locked'}${active ? ' is-active' : ''}" data-tip="${esc(`<b>${tech.name}</b><br>${tech.description}<br><span class='muted'>${formatPct(diffusion, 0)} der Länder kennen diese Technologie (Kosten −${formatPct(diffusion * 0.5, 0)}).</span>`)}">
                <div class="tech-head"><b>${esc(tech.name)}</b><span class="muted small num">Stufe ${tech.tier} · ${formatNumber(cost)} P.</span></div>
                <div class="small">${effects(tech)}</div>
                ${req.length && !done ? `<div class="small muted">Benötigt: ${req.map(esc).join(', ')}</div>` : ''}
                ${progress > 0 && !done ? meter((progress / cost) * 100, { tone: 'teal' }) : ''}
                <div class="tech-foot">${status}${button}</div>
              </li>`;
          })
          .join('');
        return section(`${cat.icon} ${cat.name}`, `<ul class="tech-list">${items}</ul>`);
      })
      .join('');
    return `${section('Aktuelles Projekt', `${curHtml}<p class="muted small">Forschungspunkte: <b class="num">${formatNumber(pts, 1)}</b> pro Monat (abhängig von Forschungsbudget, Entwicklungsstand, Wirtschaftsgröße und Stabilität).</p>`)}${cats}`;
  },
};
