/**
 * Assistant: analyses the player's country and returns prioritised, concrete
 * tips ("what is wrong, why, what to do"). Pure function of the state – the
 * UI shows the result once a month. Every tip names the cause from the same
 * factor breakdowns the simulation uses, so advice and game rules agree.
 */
import { approvalFactors, stabilityFactors } from './politics.js';
import { debtRatio } from '../state/selectors.js';
import { getOpinion, hasTreaty, alliesOf } from './diplomacy.js';
import { neighborCountryIds } from '../state/worldIndex.js';
import { RESOURCES, RESOURCE_IDS } from '../data/resources.js';
import { warsOf, sideOf } from './war/wars.js';
import { warOutlook } from './war/outlook.js';
import { formatPct, formatBn } from '../util/format.js';
import { formatDateDE } from '../core/calendar.js';

const tip = (priority, tone, title, text, action = null) => ({ priority, tone, title, text, action });
const open = (panel, label) => ({ type: 'openPanel', panel, label });

/** Most negative factor of a breakdown (ignoring the base value). */
function worstFactor(factors) {
  return factors.filter((f) => f.label !== 'Basis' && f.label !== 'Regierungsform').sort((a, b) => a.value - b.value)[0];
}

function approvalAdvice(c, worst) {
  const e = c.economy;
  switch (worst?.label) {
    case 'Steuerlast (Änderung)':
      return { text: `Hauptgrund sind die Steuern (${formatPct(e.taxRate, 0)}). Senken Sie die Steuern um 1–2 Prozentpunkte.`, action: open('economy', 'Steuern anpassen') };
    case 'Sozialausgaben (Änderung)':
      return { text: 'Hauptgrund sind gekürzte Sozialausgaben. Erhöhen Sie den Posten „Soziales“ im Haushalt.', action: open('economy', 'Haushalt') };
    case 'Inflation':
      return { text: `Hauptgrund ist die Inflation (${formatPct(e.inflation)}). Ein ausgeglichener Haushalt und weniger Schulden bremsen sie.`, action: open('economy', 'Haushalt') };
    case 'Arbeitslosigkeit':
      return { text: `Hauptgrund ist die Arbeitslosigkeit (${formatPct(e.unemployment)}). Mehr Infrastruktur-Ausgaben schaffen Arbeit und Wachstum.`, action: open('economy', 'Haushalt') };
    case 'Wirtschaftswachstum':
      return { text: 'Hauptgrund ist die schwache Wirtschaft. Investieren Sie in Infrastruktur und Forschung, schließen Sie Handelsabkommen.', action: open('economy', 'Wirtschaft') };
    case 'Versorgungsengpässe':
      return { text: 'Hauptgrund sind fehlende Rohstoffe. Schließen Sie Handelsabkommen mit Förderländern.', action: open('trade', 'Handel') };
    case 'Krieg & Mobilmachung':
      return { text: 'Hauptgrund sind Krieg oder Mobilmachung. Beenden Sie die Mobilmachung oder streben Sie Frieden an.', action: open('wars', 'Kriege') };
    default:
      return { text: 'Verbessern Sie Wirtschaft und Sozialleistungen, vermeiden Sie Steuererhöhungen.', action: open('politics', 'Politik') };
  }
}

/**
 * @param {{detail?: boolean}} opts detail: more tips and explanations (easiest level)
 * @returns {{priority:number, tone:string, title:string, text:string, action:object|null}[]}
 */
export function assistantTips(state, c, { detail = false } = {}) {
  const e = c.economy;
  const p = c.politics;
  const tips = [];

  // --- people and politics
  if (p.approval < 45) {
    const adv = approvalAdvice(c, worstFactor(approvalFactors(c)));
    tips.push(tip(p.approval < 30 ? 95 : 70, p.approval < 30 ? 'bad' : 'warn', `Die Bevölkerung ist unzufrieden (Zustimmung ${Math.round(p.approval)})`, adv.text, adv.action));
  }
  if (p.stability < 40) {
    const worst = worstFactor(stabilityFactors(c));
    tips.push(tip(p.stability < 25 ? 90 : 65, 'bad', `Das Land ist instabil (Stabilität ${Math.round(p.stability)})`, `Größter Einfluss: ${worst?.label ?? 'Zustimmung'}. Bei sehr niedriger Stabilität drohen Putschversuche. Steigern Sie zuerst die Zustimmung.`, open('politics', 'Politik')));
  }
  if (p.nextElection && p.nextElection - state.time.day < 240 && p.approval < 50) {
    tips.push(tip(75, 'warn', `Wahl am ${formatDateDE(p.nextElection)}`, `Mit ${Math.round(p.approval)} % Zustimmung könnte Ihre Regierung abgewählt werden. Jetzt ist ein guter Moment für Entlastungen (Steuern, Soziales).`, open('politics', 'Politik')));
  }

  // --- money
  const deficit = (-e.lastBalance * 12) / e.gdp;
  if (e.treasury < e.gdp * 0.005 && e.lastBalance < 0) {
    tips.push(tip(85, 'bad', 'Die Staatskasse ist fast leer', `Noch ${formatBn(e.treasury)} bei einem Defizit von ${formatBn(-e.lastBalance)} pro Monat. Fehlbeträge werden über neue Schulden gedeckt – erhöhen Sie Steuern leicht oder kürzen Sie Ausgaben.`, open('economy', 'Haushalt')));
  } else if (deficit > 0.04) {
    tips.push(tip(60, 'warn', `Hohes Haushaltsdefizit (${formatPct(deficit)} des BIP)`, 'Die Schulden wachsen schnell. Kürzen Sie die größten Ausgabenposten etwas oder erhöhen Sie die Steuern um 1 Prozentpunkt.', open('economy', 'Haushalt')));
  }
  if (debtRatio(c) > e.debtTolerance) {
    tips.push(tip(70, 'bad', `Schulden zu hoch (${formatPct(debtRatio(c), 0)} des BIP)`, `Die Märkte verlangen höhere Zinsen ab ${formatPct(e.debtTolerance, 0)}. Ohne Gegensteuern droht ein Staatsbankrott.`, open('economy', 'Haushalt')));
  } else if (e.treasury > e.gdp * 0.06 && e.debt > e.gdp * 0.2) {
    tips.push(tip(25, 'info', 'Viel Geld in der Kasse', `Mit ${formatBn(e.treasury)} können Sie Schulden tilgen und so Zinsen sparen – oder gezielt investieren.`, open('economy', 'Tilgen')));
  }

  // --- economy
  if (e.growth < 0) {
    tips.push(tip(60, 'warn', `Rezession (${formatPct(e.growth)} Wachstum)`, 'Mehr Infrastruktur- und Forschungsausgaben, Handelsabkommen und das Beseitigen von Rohstoffmangel bringen die Wirtschaft wieder in Schwung.', open('economy', 'Wirtschaft')));
  }
  if (e.inflation > 0.07) {
    tips.push(tip(55, 'warn', `Hohe Inflation (${formatPct(e.inflation)})`, 'Ein kleineres Defizit senkt die Inflation. Rohstoffpreise (Öl, Nahrung) treiben sie zusätzlich.', open('economy', 'Wirtschaft')));
  }
  // shortages: which resource and who could deliver
  let worstShortage = null;
  for (const rid of RESOURCE_IDS) {
    const r = c.resources[rid];
    if (r.consumption > 0 && r.shortage / r.consumption > 0.1 && (!worstShortage || r.shortage / r.consumption > worstShortage.share)) worstShortage = { rid, share: r.shortage / r.consumption };
  }
  if (worstShortage) {
    const producer = state.countryOrder
      .map((id) => state.countries[id])
      .filter((x) => x.id !== c.id && !x.eliminated && x.resources[worstShortage.rid].production > x.resources[worstShortage.rid].consumption && !hasTreaty(state, c.id, x.id, 'trade') && getOpinion(state, c.id, x.id) > -20)
      .sort((a, b) => b.resources[worstShortage.rid].production - a.resources[worstShortage.rid].production)[0];
    tips.push(tip(50, 'warn', `Mangel an ${RESOURCES[worstShortage.rid].name} (${formatPct(worstShortage.share, 0)} fehlen)`, producer ? `Ein Handelsabkommen mit ${producer.name} (großer Exporteur) würde helfen. Klicken Sie das Land auf der Karte an.` : 'Handelsabkommen mit Förderländern würden helfen.', open('trade', 'Handel')));
  }

  // --- research
  if (!c.technology.current) tips.push(tip(55, 'warn', 'Keine Forschung aktiv', 'Forschungspunkte verfallen ungenutzt. Wählen Sie eine Technologie – Wirtschaftstechnologien bringen dauerhaft mehr Wachstum.', open('research', 'Forschung wählen')));

  // --- security
  const wars = warsOf(state, c.id);
  for (const w of wars) {
    const o = warOutlook(state, w, sideOf(w, c.id));
    if (o.tone === 'bad') tips.push(tip(92, 'bad', `${w.name}: ${o.verdict}`, `${o.reasons[0] ?? ''} Bestellen Sie Verstärkung (Militär → Aufrüsten), stellen Sie den Generalstab auf „Verteidigen“ oder bieten Sie einen weißen Frieden an.`, open('wars', 'Kriegsübersicht')));
    else if (o.tone === 'good' && Math.abs(o.score) > 40) tips.push(tip(45, 'good', `${w.name}: ${o.verdict}`, 'Ein guter Zeitpunkt für einen Friedensvertrag mit Forderungen (besetzte Gebiete, Reparationen) – bevor die Kriegsmüdigkeit steigt.', open('wars', 'Frieden verhandeln')));
  }
  if (!wars.length) {
    const allies = new Set(alliesOf(state, c.id));
    const threats = neighborCountryIds(state, c.id)
      .map((id) => state.countries[id])
      .filter((n) => !allies.has(n.id) && getOpinion(state, c.id, n.id) < -30 && n.military.power > c.military.power * 1.5);
    const planning = state.countryOrder.find((id) => state.countries[id].ai?.warPlan?.target === c.id);
    if (planning) {
      tips.push(tip(88, 'bad', `${state.countries[planning].name} bereitet möglicherweise einen Angriff vor`, 'Rüsten Sie auf (Militär → Aufrüsten), suchen Sie Verbündete oder verbessern Sie die Beziehungen.', open('military', 'Aufrüsten')));
    } else if (threats.length) {
      const t = threats.sort((a, b) => b.military.power - a.military.power)[0];
      tips.push(tip(40, 'warn', `Starker, feindseliger Nachbar: ${t.name}`, `${t.name} ist ${(t.military.power / Math.max(1, c.military.power)).toFixed(1).replace('.', ',')}-mal so stark wie Sie. Ein Bündnis oder bessere Beziehungen schützen am günstigsten.`, open('diplomacy', 'Diplomatie')));
    }
  }
  if ((c.military.spending?.funding ?? 1) < 0.95) {
    tips.push(tip(50, 'warn', 'Militärbudget reicht nicht für den Unterhalt', 'Die Einsatzbereitschaft sinkt. Erhöhen Sie das Verteidigungsbudget leicht oder lösen Sie Verbände auf.', open('military', 'Militär')));
  }

  // --- good news / next steps
  if (!tips.length || detail) {
    if (p.approval >= 55 && e.growth > 0.015 && deficit < 0.03) tips.push(tip(10, 'good', 'Ihr Land ist auf gutem Kurs', 'Nutzen Sie die ruhige Lage: Handelsabkommen schließen, in Forschung investieren und Beziehungen zu Nachbarn verbessern.', open('diplomacy', 'Diplomatie')));
    else if (!tips.length) tips.push(tip(10, 'good', 'Keine dringenden Probleme', 'Behalten Sie Zustimmung, Haushalt und Nachbarn im Blick. Der Assistent meldet sich, wenn etwas wichtig wird.'));
  }
  if (detail && c.trade.partners.length < 3) {
    tips.push(tip(15, 'info', 'Tipp: Handel bringt Wohlstand', 'Jedes Handelsabkommen erhöht die Handelsgewinne. Klicken Sie ein Land an und wählen Sie „Handelsabkommen vorschlagen“.', open('diplomacy', 'Diplomatie')));
  }
  return tips.sort((a, b) => b.priority - a.priority);
}
