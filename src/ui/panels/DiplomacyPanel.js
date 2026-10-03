import { getOpinion, treatiesOf, TREATIES } from '../../systems/diplomacy.js';
import { neighborCountryIds } from '../../state/worldIndex.js';
import { esc } from '../../util/format.js';
import { section, opinionBar, signClass } from '../widgets.js';
import { countryLink } from '../components/InfoPanel.js';

function row(state, me, id) {
  const o = getOpinion(state, me, id);
  return `<li class="rel-row">${countryLink(state, id)}<span class="rel-bar">${opinionBar(o)}</span><span class="num ${signClass(o)}">${o > 0 ? '+' : ''}${Math.round(o)}</span></li>`;
}

export const DiplomacyPanel = {
  id: 'diplomacy',
  title: 'Diplomatie',
  render(ui) {
    const state = ui.session.state;
    const me = state.playerId;
    const treaties = treatiesOf(state, me);
    const byType = (t) => [...new Set(treaties.filter((x) => x.treaty === t).map((x) => x.other))];
    const others = state.countryOrder.filter((id) => id !== me && !state.countries[id].eliminated);
    const sorted = [...others].sort((a, b) => getOpinion(state, me, b) - getOpinion(state, me, a));
    const list = (ids, empty) => (ids.length ? `<ul class="rel-list">${ids.map((id) => row(state, me, id)).join('')}</ul>` : `<p class="muted small">${empty}</p>`);
    const embargoesOut = treaties.filter((t) => t.treaty === 'embargo' && t.actor === me).map((t) => t.other);
    const embargoesIn = treaties.filter((t) => t.treaty === 'embargo' && t.actor !== me).map((t) => t.other);
    const options = [...others]
      .sort((a, b) => state.countries[a].name.localeCompare(state.countries[b].name, 'de'))
      .map((id) => `<option value="${id}">${esc(state.countries[id].name)}</option>`)
      .join('');
    return `
      ${section(
        'Land auswählen',
        `<label class="field"><span class="sr-only">Land</span><select data-action-change="selectCountry"><option value="">Land wählen …</option>${options}</select></label>
         <p class="muted small">Oder ein Land auf der Karte anklicken. Diplomatische Aktionen finden Sie im Länderpanel rechts.</p>`,
      )}
      ${section(`Bündnispartner (${byType('alliance').length})`, list(byType('alliance'), 'Keine Bündnisse.'))}
      ${section(`Handelsabkommen (${byType('trade').length})`, list(byType('trade'), 'Keine Handelsabkommen.'))}
      ${section(`Nichtangriffspakte (${byType('nonAggression').length})`, list(byType('nonAggression'), 'Keine Nichtangriffspakte.'))}
      ${section('Embargos', `<p class="small"><b>Von Ihnen verhängt:</b></p>${list(embargoesOut, 'Keine.')}<p class="small"><b>Gegen Sie:</b></p>${list(embargoesIn, 'Keine.')}`)}
      ${section('Nachbarn', list(neighborCountryIds(state, me), 'Keine Landgrenzen.'))}
      ${section('Beste Beziehungen', list(sorted.slice(0, 8), ''))}
      ${section('Schlechteste Beziehungen', list(sorted.slice(-8).reverse(), ''))}
      <p class="muted small">Verträge: ${Object.values(TREATIES).map((t) => t.name).join(', ')}. Meinungen nähern sich langsam ihrem Grundwert plus Vertragsboni an.</p>`;
  },
};
