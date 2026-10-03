/**
 * Event definitions.
 *
 * scope 'country': evaluated for each country (staggered over the month).
 * scope 'world':   evaluated once per month for the whole world.
 *
 * mtth       mean time to happen in months while the condition holds
 * cooldown   months before the same event can fire again for the same scope
 * condition  (country, state, ctx) => boolean   (world events receive (null, state, ctx))
 * target     optional (country, state, ctx) => countryId  – fills "{other}" and effect target 'other'
 * options    list of { label, effects, ai } – `ai` is the weight AI countries use to choose
 *
 * Effects are plain data (see src/systems/effects.js), so they can be stored in
 * saves, shown in tooltips and reused by decisions, policies or scripted content.
 */
import { gdpPerCapita, debtRatio } from '../state/selectors.js';
import { neighborCountryIds } from '../state/worldIndex.js';
import { getOpinion, hasTreaty } from '../systems/diplomacy.js';
import { warById, canJoinWarSide } from '../systems/war/queries.js';

export const EVENTS = [
  {
    id: 'resourceDiscovery',
    scope: 'country',
    title: 'Rohstofffund',
    text: 'Geologen haben in {country} ein bedeutendes Rohstoffvorkommen entdeckt. Wie soll es erschlossen werden?',
    mtth: 240,
    cooldown: 120,
    condition: (c) => c.economy.gdp > 5,
    options: [
      { label: 'Staatlich erschließen', effects: [{ type: 'treasury', gdpShare: -0.004 }, { type: 'capacity', resource: 'auto', factor: 0.12 }], ai: 2 },
      { label: 'Konzessionen an Konzerne vergeben', effects: [{ type: 'treasury', gdpShare: 0.002 }, { type: 'capacity', resource: 'auto', factor: 0.06 }, { type: 'approval', value: -2 }], ai: 1 },
    ],
  },
  {
    id: 'generalStrike',
    scope: 'country',
    title: 'Generalstreik',
    text: 'Steigende Preise und Arbeitslosigkeit treiben die Gewerkschaften in {country} auf die Straße. Das Land steht still.',
    mtth: 18,
    cooldown: 24,
    condition: (c) => c.economy.inflation > 0.07 || c.economy.unemployment > 0.1,
    options: [
      { label: 'Zugeständnisse machen (Lohnhilfen)', effects: [{ type: 'treasury', gdpShare: -0.005 }, { type: 'approval', value: 5 }, { type: 'modifier', stat: 'inflation', value: 0.01, months: 12, label: 'Lohnzugeständnisse' }], ai: 2 },
      { label: 'Hart bleiben', effects: [{ type: 'approval', value: -6 }, { type: 'stability', value: -5 }, { type: 'modifier', stat: 'growth', value: -0.008, months: 6, label: 'Streikfolgen' }], ai: 1 },
    ],
  },
  {
    id: 'corruptionScandal',
    scope: 'country',
    title: 'Korruptionsskandal',
    text: 'Journalisten decken ein Netzwerk aus Bestechung in der Regierung von {country} auf.',
    mtth: 60,
    cooldown: 36,
    condition: (c) => c.politics.stability < 75,
    options: [
      { label: 'Unabhängige Untersuchung einleiten', effects: [{ type: 'approval', value: -3 }, { type: 'stability', value: 3 }, { type: 'modifier', stat: 'taxEfficiency', value: 0.02, months: 36, label: 'Antikorruptionsreform' }], ai: 2 },
      { label: 'Die Affäre aussitzen', effects: [{ type: 'approval', value: -6 }, { type: 'modifier', stat: 'stability', value: -4, months: 24, label: 'Vertrauensverlust' }], ai: 1 },
    ],
  },
  {
    id: 'naturalDisaster',
    scope: 'country',
    title: 'Naturkatastrophe',
    text: 'Schwere Überschwemmungen und Stürme haben weite Teile von {country} verwüstet.',
    mtth: 90,
    cooldown: 24,
    condition: () => true,
    options: [
      { label: 'Umfassende Wiederaufbauhilfe', effects: [{ type: 'treasury', gdpShare: -0.008 }, { type: 'approval', value: 4 }, { type: 'infrastructure', value: -1 }], ai: 2 },
      { label: 'Minimale Nothilfe', effects: [{ type: 'treasury', gdpShare: -0.002 }, { type: 'approval', value: -7 }, { type: 'infrastructure', value: -3 }, { type: 'modifier', stat: 'growth', value: -0.006, months: 12, label: 'Katastrophenschäden' }], ai: 1 },
    ],
  },
  {
    id: 'researchBreakthrough',
    scope: 'country',
    title: 'Forschungsdurchbruch',
    text: 'Ein Forschungsteam in {country} meldet einen unerwarteten Durchbruch.',
    mtth: 48,
    cooldown: 24,
    condition: (c) => !!c.technology.current && c.budget.research >= 0.01,
    options: [
      { label: 'Ergebnisse sofort umsetzen', effects: [{ type: 'researchProgress', share: 0.35 }], ai: 1 },
      { label: 'Patente international lizenzieren', effects: [{ type: 'researchProgress', share: 0.15 }, { type: 'treasury', gdpShare: 0.001 }], ai: 1 },
    ],
  },
  {
    id: 'sovereignDebtCrisis',
    scope: 'country',
    title: 'Staatsschuldenkrise',
    text: 'Investoren zweifeln an der Zahlungsfähigkeit von {country}. Die Zinsen für Staatsanleihen schießen in die Höhe.',
    mtth: 8,
    cooldown: 36,
    condition: (c) => debtRatio(c) > c.economy.debtTolerance + 0.2 && c.economy.lastBalance < 0,
    options: [
      { label: 'Harter Sparkurs', effects: [{ type: 'approval', value: -10 }, { type: 'modifier', stat: 'interestRate', value: 0.01, months: 24, label: 'Risikoaufschlag' }, { type: 'budgetCut', share: 0.1 }], ai: 2 },
      { label: 'Zentralbank kauft Anleihen', effects: [{ type: 'modifier', stat: 'inflation', value: 0.05, months: 24, label: 'Geldschöpfung' }, { type: 'modifier', stat: 'interestRate', value: 0.02, months: 24, label: 'Risikoaufschlag' }], ai: 1 },
    ],
  },
  {
    id: 'investmentBoom',
    scope: 'country',
    title: 'Investitionsboom',
    text: 'Internationale Investoren entdecken {country}. Kapital strömt ins Land.',
    mtth: 36,
    cooldown: 48,
    condition: (c) => c.politics.stability > 65 && c.economy.growth > 0.025,
    options: [
      { label: 'Investoren mit Steueranreizen locken', effects: [{ type: 'modifier', stat: 'growth', value: 0.012, months: 18, label: 'Investitionsboom' }, { type: 'modifier', stat: 'taxEfficiency', value: -0.03, months: 18, label: 'Steueranreize' }], ai: 1 },
      { label: 'Boom ohne Eingriff laufen lassen', effects: [{ type: 'modifier', stat: 'growth', value: 0.007, months: 12, label: 'Investitionsboom' }], ai: 1 },
    ],
  },
  {
    id: 'massProtests',
    scope: 'country',
    title: 'Massenproteste',
    text: 'Hunderttausende demonstrieren in {country} gegen die Regierung.',
    mtth: 10,
    cooldown: 18,
    condition: (c) => c.politics.approval < 30,
    options: [
      { label: 'Reformen versprechen', effects: [{ type: 'approval', value: 6 }, { type: 'treasury', gdpShare: -0.003 }, { type: 'stability', value: -2 }], ai: 2 },
      { label: 'Proteste auflösen lassen', effects: [{ type: 'approval', value: -5 }, { type: 'stability', value: -8 }], ai: 1 },
    ],
  },
  {
    id: 'brainDrain',
    scope: 'country',
    title: 'Abwanderung von Fachkräften',
    text: 'Gut ausgebildete Menschen verlassen {country} wegen fehlender Perspektiven.',
    mtth: 30,
    cooldown: 36,
    condition: (c) => c.economy.unemployment > 0.08 && gdpPerCapita(c) < 20000,
    options: [
      { label: 'Rückkehrprogramm finanzieren', effects: [{ type: 'treasury', gdpShare: -0.003 }, { type: 'modifier', stat: 'researchSpeed', value: 0.05, months: 24, label: 'Rückkehrprogramm' }], ai: 1 },
      { label: 'Nichts unternehmen', effects: [{ type: 'modifier', stat: 'researchSpeed', value: -0.12, months: 36, label: 'Brain Drain' }, { type: 'modifier', stat: 'growth', value: -0.003, months: 36, label: 'Brain Drain' }], ai: 1 },
    ],
  },
  {
    id: 'recordHarvest',
    scope: 'country',
    title: 'Rekordernte',
    text: 'Ideales Wetter beschert {country} die beste Ernte seit Jahrzehnten.',
    mtth: 60,
    cooldown: 24,
    condition: (c) => c.resources.food.capacity > 3,
    options: [{ label: 'Hervorragend!', effects: [{ type: 'modifier', stat: 'output.food', value: 0.12, months: 12, label: 'Rekordernte' }, { type: 'approval', value: 2 }], ai: 1 }],
  },
  {
    id: 'cyberAttack',
    scope: 'country',
    title: 'Cyberangriff',
    text: 'Hacker legen Teile der staatlichen IT-Infrastruktur von {country} lahm.',
    mtth: 72,
    cooldown: 36,
    condition: (c) => gdpPerCapita(c) > 8000,
    options: [
      { label: 'In Cyberabwehr investieren', effects: [{ type: 'treasury', gdpShare: -0.002 }, { type: 'modifier', stat: 'stability', value: 2, months: 24, label: 'Cyberabwehrprogramm' }], ai: 2 },
      { label: 'Schaden begrenzen', effects: [{ type: 'stability', value: -3 }, { type: 'modifier', stat: 'taxEfficiency', value: -0.02, months: 12, label: 'IT-Ausfälle' }], ai: 1 },
    ],
  },
  {
    id: 'borderIncident',
    scope: 'country',
    title: 'Grenzzwischenfall',
    text: 'An der Grenze zwischen {country} und {other} kam es zu einem Schusswechsel zwischen Grenzposten.',
    mtth: 60,
    cooldown: 24,
    condition: (c, state) => neighborCountryIds(state, c.id).length > 0,
    target: (c, state, ctx) => {
      const candidates = neighborCountryIds(state, c.id).filter((id) => getOpinion(state, c.id, id) < 20);
      return candidates.length ? ctx.rng.pick(candidates) : null;
    },
    options: [
      { label: 'Diplomatisch deeskalieren', effects: [{ type: 'opinion', target: 'other', value: 5 }, { type: 'approval', value: -2 }], ai: 2 },
      { label: 'Scharf protestieren', effects: [{ type: 'opinion', target: 'other', value: -15 }, { type: 'approval', value: 3 }, { type: 'stability', value: 1 }], ai: 1 },
    ],
  },
  {
    id: 'tradeDelegation',
    scope: 'country',
    title: 'Handelsdelegation',
    text: 'Eine Wirtschaftsdelegation aus {other} schlägt ein umfassendes Handelsabkommen mit {country} vor.',
    mtth: 30,
    cooldown: 18,
    condition: () => true,
    target: (c, state, ctx) => {
      const candidates = state.countryOrder.filter(
        (id) => id !== c.id && !hasTreaty(state, c.id, id, 'trade') && getOpinion(state, c.id, id) > 25 && !state.countries[id].eliminated,
      );
      return candidates.length ? ctx.rng.weighted(candidates, (id) => Math.sqrt(state.countries[id].economy.gdp)) : null;
    },
    options: [
      { label: 'Abkommen unterzeichnen', effects: [{ type: 'treaty', target: 'other', treaty: 'trade' }, { type: 'opinion', target: 'other', value: 10 }], ai: 3 },
      { label: 'Höflich ablehnen', effects: [{ type: 'opinion', target: 'other', value: -5 }], ai: 1 },
    ],
  },
  {
    id: 'coupAttempt',
    scope: 'country',
    title: 'Putschversuch',
    text: 'Teile des Militärs von {country} haben sich gegen die Regierung erhoben!',
    mtth: 12,
    cooldown: 36,
    condition: (c) => c.politics.stability < 22,
    options: [
      { label: 'Loyale Truppen einsetzen', effects: [{ type: 'stability', value: 6 }, { type: 'approval', value: -6 }, { type: 'militaryEquipment', share: -0.1 }], ai: 2 },
      { label: 'Mit den Putschisten verhandeln', effects: [{ type: 'stability', value: 10 }, { type: 'governmentChange', ideology: 'military' }], ai: 1 },
    ],
  },
  // ----- Triggered events (fired by code, never randomly) -----
  {
    id: 'treatyProposal',
    scope: 'triggered',
    title: 'Diplomatischer Vorschlag',
    text: 'Die Regierung von {other} schlägt {country} ein {treaty} vor.',
    options: [
      { label: 'Vorschlag annehmen', effects: [{ type: 'treaty', target: 'other', treaty: '$treaty' }, { type: 'opinion', target: 'other', value: 5 }], ai: 1 },
      { label: 'Ablehnen', effects: [{ type: 'opinion', target: 'other', value: -6 }], ai: 1 },
    ],
  },
  // ----- War & crisis events (fired by the war system) -----
  {
    id: 'warCrisis',
    scope: 'triggered',
    crisis: true,
    title: '⚠ Internationale Krise',
    text: '{attacker} hat {defender} den Krieg erklärt. Die Welt blickt auf die Reaktion von {country}.',
    options: [
      { label: 'Neutral bleiben und die Lage analysieren', effects: [], ai: 3 },
      { label: 'Den Angriff öffentlich verurteilen', effects: [{ type: 'opinionWith', target: 'attacker', value: -15 }, { type: 'opinionWith', target: 'defender', value: 10 }], ai: 2 },
      { label: 'Wirtschaftssanktionen gegen den Angreifer', effects: [{ type: 'embargoTarget', target: 'attacker' }, { type: 'opinionWith', target: 'defender', value: 15 }], ai: 1 },
      { label: 'Truppen in Bereitschaft versetzen', effects: [{ type: 'mobilize', level: 1 }], ai: 1 },
      {
        label: 'An der Seite des Angegriffenen in den Krieg eintreten',
        effects: [{ type: 'joinWar', side: 'defenders' }, { type: 'mobilize', level: 1 }],
        ai: 0,
        available: (state, c, inst) => canJoinWarSide(state, c.id, warById(state, inst.data.warId), 'defenders'),
      },
    ],
  },
  {
    id: 'warAttackOnPlayer',
    scope: 'triggered',
    crisis: true,
    title: '⚠ Angriff auf {country}!',
    text: '{attacker} hat {country} den Krieg erklärt! Die Streitkräfte erwarten Ihre Befehle. Der Generalstab hat die Verteidigung bereits aufgenommen.',
    options: [
      { label: 'Generalmobilmachung – alle Reserven einberufen', effects: [{ type: 'mobilize', level: 2 }, { type: 'approval', value: 6 }], ai: 2 },
      { label: 'Teilmobilmachung anordnen', effects: [{ type: 'mobilize', level: 1 }, { type: 'approval', value: 4 }], ai: 1 },
      { label: 'Sofort einen Waffenstillstand anbieten', effects: [{ type: 'offerWhitePeace' }, { type: 'approval', value: -4 }], ai: 0 },
    ],
  },
  {
    id: 'warAllianceCall',
    scope: 'triggered',
    crisis: true,
    title: '⚠ Bündnisfall',
    text: '{attacker} hat Ihren Verbündeten {defender} angegriffen. {defender} beruft sich auf das Bündnis und bittet {country} um militärischen Beistand.',
    options: [
      {
        label: 'Bündnispflicht erfüllen – in den Krieg eintreten',
        effects: [{ type: 'joinWar', side: 'defenders' }, { type: 'mobilize', level: 1 }, { type: 'opinionWith', target: 'defender', value: 15 }],
        ai: 2,
        available: (state, c, inst) => canJoinWarSide(state, c.id, warById(state, inst.data.warId), 'defenders'),
      },
      { label: 'Neutral bleiben (das Bündnis zerbricht)', effects: [{ type: 'breakAlliance', target: 'defender' }], ai: 1 },
    ],
  },
  {
    id: 'warPeaceOffer',
    scope: 'triggered',
    crisis: true,
    title: 'Friedensangebot',
    text: '{other} bietet {country} Frieden an. Bedingungen: {terms}',
    options: [
      { label: 'Frieden annehmen', effects: [{ type: 'acceptPeace' }], ai: 1, available: (state, c, inst) => (warById(state, inst.data.warId) ? null : 'Der Krieg ist bereits beendet.') },
      { label: 'Ablehnen und weiterkämpfen', effects: [{ type: 'opinionWith', target: 'other', value: -5 }], ai: 1 },
    ],
  },
  {
    id: 'warTension',
    scope: 'triggered',
    crisis: true,
    title: '⚠ Hohe Spannungen',
    text: 'Die Beziehungen zu {other} haben sich stark verschlechtert. Militärische Aktivitäten an der Grenze nehmen zu – {other} bereitet möglicherweise einen Angriff vor.',
    options: [
      { label: 'Teilmobilmachung anordnen', effects: [{ type: 'mobilize', level: 1 }], ai: 1 },
      { label: 'Diplomatische Deeskalation (Kosten 0,1 % des BIP)', effects: [{ type: 'treasury', gdpShare: -0.001 }, { type: 'opinion', target: 'other', value: 15 }], ai: 1 },
      { label: 'Lage weiter beobachten', effects: [], ai: 1 },
    ],
  },
  // ----- World events -----
  {
    id: 'oilSupplyCut',
    scope: 'world',
    title: 'Förderkürzung der Ölstaaten',
    text: 'Die großen Ölexporteure haben eine drastische Förderkürzung beschlossen. Der Ölpreis steigt.',
    mtth: 60,
    cooldown: 36,
    condition: (c, state) => state.market.oil.price < state.market.oil.basePrice * 1.4,
    options: [{ label: 'Verstanden', effects: [{ type: 'modifierAll', filter: { producerOf: 'oil', minShare: 0.02 }, stat: 'output.oil', value: -0.15, months: 12, label: 'Förderkürzung' }], ai: 1 }],
  },
  {
    id: 'globalRecession',
    scope: 'world',
    title: 'Globale Rezession',
    text: 'Eine Finanzkrise erschüttert die Weltwirtschaft. Nachfrage und Investitionen brechen ein.',
    mtth: 120,
    cooldown: 96,
    condition: () => true,
    options: [{ label: 'Verstanden', effects: [{ type: 'modifierAll', stat: 'growth', value: -0.025, months: 12, label: 'Globale Rezession' }, { type: 'modifierAll', stat: 'unemployment', value: 0.015, months: 12, label: 'Globale Rezession' }], ai: 1 }],
  },
  {
    id: 'pandemic',
    scope: 'world',
    title: 'Pandemie',
    text: 'Ein neuartiges Virus breitet sich weltweit aus. Grenzen werden geschlossen, Lieferketten unterbrochen.',
    mtth: 240,
    cooldown: 180,
    condition: () => true,
    options: [{ label: 'Verstanden', effects: [{ type: 'modifierAll', stat: 'growth', value: -0.04, months: 9, label: 'Pandemie' }, { type: 'modifierAll', stat: 'popGrowth', value: -0.002, months: 12, label: 'Pandemie' }, { type: 'modifierAll', stat: 'stability', value: -4, months: 12, label: 'Pandemie' }], ai: 1 }],
  },
  {
    id: 'commodityBoom',
    scope: 'world',
    title: 'Rohstoffsuperzyklus',
    text: 'Die steigende Nachfrage aus Schwellenländern treibt die Preise für Metalle und kritische Mineralien in die Höhe.',
    mtth: 96,
    cooldown: 72,
    condition: () => true,
    options: [{ label: 'Verstanden', effects: [{ type: 'modifierAll', stat: 'demand.metals', value: 0.12, months: 24, label: 'Rohstoffsuperzyklus' }, { type: 'modifierAll', stat: 'demand.rareEarths', value: 0.15, months: 24, label: 'Rohstoffsuperzyklus' }], ai: 1 }],
  },
  {
    id: 'droughtYear',
    scope: 'world',
    title: 'Globale Dürre',
    text: 'Ein extremes Wetterphänomen führt weltweit zu Missernten. Lebensmittel werden teurer.',
    mtth: 84,
    cooldown: 48,
    condition: () => true,
    options: [{ label: 'Verstanden', effects: [{ type: 'modifierAll', filter: { producerOf: 'food', minShare: 0.005 }, stat: 'output.food', value: -0.12, months: 12, label: 'Dürre' }], ai: 1 }],
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
