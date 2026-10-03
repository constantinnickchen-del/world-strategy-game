/** Navigation rail. Each entry opens a panel in the drawer. */
export const NAV_ITEMS = [
  { id: 'overview', icon: '⌂', label: 'Übersicht', key: 'Q' },
  { id: 'economy', icon: '💰', label: 'Wirtschaft', key: 'W' },
  { id: 'politics', icon: '🏛', label: 'Politik', key: 'E' },
  { id: 'diplomacy', icon: '🤝', label: 'Diplomatie', key: 'R' },
  { id: 'trade', icon: '⚖', label: 'Handel & Rohstoffe', key: 'T' },
  { id: 'research', icon: '🔬', label: 'Forschung', key: 'Z' },
  { id: 'military', icon: '🛡', label: 'Militär', key: 'U' },
  { id: 'wars', icon: '⚔', label: 'Kriege', key: 'K' },
  { id: 'world', icon: '🌍', label: 'Weltlage', key: 'I' },
  { id: 'news', icon: '📰', label: 'Nachrichten', key: 'O' },
];

export class Sidebar {
  constructor(el, ui) {
    this.el = el;
    this.ui = ui;
    el.innerHTML = `<ul class="nav-list">${NAV_ITEMS.map(
      (n) => `<li><button class="nav-btn" data-action="togglePanel" data-panel="${n.id}" aria-label="${n.label}" data-tip="<b>${n.label}</b> <span class='kbd'>${n.key}</span>"><span class="nav-icon" aria-hidden="true">${n.icon}</span><span class="nav-label">${n.label.split(' ')[0]}</span><span class="nav-badge" data-badge="${n.id}" hidden></span></button></li>`,
    ).join('')}</ul>`;
  }

  update() {
    const active = this.ui.activePanel;
    for (const b of this.el.querySelectorAll('.nav-btn')) {
      const on = b.dataset.panel === active;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const player = this.ui.session.player;
    const research = this.el.querySelector('[data-badge="research"]');
    if (research) research.hidden = !player || !!player.technology.current;
    const wars = this.el.querySelector('[data-badge="wars"]');
    if (wars) {
      const state = this.ui.session.state;
      const n = player ? state.wars.filter((w) => w.status === 'active' && (w.attackers.includes(player.id) || w.defenders.includes(player.id))).length : 0;
      wars.hidden = !n;
      wars.textContent = n ? String(n) : '';
      wars.classList.toggle('is-war', n > 0);
    }
  }
}
