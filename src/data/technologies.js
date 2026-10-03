/**
 * Technology tree.
 *
 * Effects are permanent modifiers (see src/systems/modifiers.js for the list of
 * stats). Adding a technology is pure data – no system code has to change.
 * `tier` controls display order and initial availability in scenarios.
 */

export const TECH_CATEGORIES = {
  economy: { name: 'Wirtschaft', icon: '📈' },
  industry: { name: 'Industrie', icon: '🏭' },
  energy: { name: 'Energie', icon: '⚡' },
  agriculture: { name: 'Landwirtschaft', icon: '🌱' },
  society: { name: 'Gesellschaft', icon: '🎓' },
  infrastructure: { name: 'Infrastruktur', icon: '🛤' },
  military: { name: 'Militär', icon: '🛡' },
};

const T = (id, category, tier, name, cost, requires, effects, description) => ({
  id, category, tier, name, cost, requires, effects, description,
});

export const TECHNOLOGIES = [
  // Economy
  T('eGovernment', 'economy', 1, 'Digitale Verwaltung', 260, [], [{ stat: 'taxEfficiency', value: 0.03 }], 'Digitale Steuer- und Behördenprozesse erhöhen die Effizienz der Steuererhebung.'),
  T('fintech', 'economy', 2, 'Fintech & Kapitalmärkte', 520, ['eGovernment'], [{ stat: 'interestRate', value: -0.004 }, { stat: 'growth', value: 0.001 }], 'Moderne Finanzinfrastruktur senkt Finanzierungskosten.'),
  T('platformEconomy', 'economy', 3, 'Plattformökonomie', 900, ['fintech'], [{ stat: 'growth', value: 0.0015 }, { stat: 'tradeGain', value: 0.1 }], 'Digitale Märkte vernetzen Unternehmen weltweit.'),
  T('aiPlanning', 'economy', 4, 'KI-gestützte Wirtschaftssteuerung', 1500, ['platformEconomy', 'robotics'], [{ stat: 'growth', value: 0.002 }, { stat: 'taxEfficiency', value: 0.03 }], 'Künstliche Intelligenz optimiert Verwaltung und Wirtschaft.'),
  // Industry
  T('industry40', 'industry', 1, 'Industrie 4.0', 280, [], [{ stat: 'growth', value: 0.001 }], 'Vernetzte Produktion steigert die Produktivität.'),
  T('additiveManufacturing', 'industry', 2, 'Additive Fertigung', 560, ['industry40'], [{ stat: 'demand.metals', value: -0.06 }, { stat: 'growth', value: 0.0005 }], '3D-Druck senkt den Materialverbrauch.'),
  T('robotics', 'industry', 3, 'Fortgeschrittene Robotik', 950, ['additiveManufacturing'], [{ stat: 'growth', value: 0.002 }, { stat: 'unemployment', value: 0.004 }], 'Roboter erhöhen die Produktivität, verdrängen aber Arbeitsplätze.'),
  T('nanomaterials', 'industry', 4, 'Nanomaterialien', 1400, ['robotics'], [{ stat: 'demand.metals', value: -0.08 }, { stat: 'demand.rareEarths', value: -0.08 }, { stat: 'growth', value: 0.001 }], 'Neue Werkstoffe ersetzen knappe Rohstoffe.'),
  // Energy
  T('smartGrid', 'energy', 1, 'Intelligente Stromnetze', 250, [], [{ stat: 'demand.oil', value: -0.03 }, { stat: 'demand.gas', value: -0.04 }, { stat: 'demand.coal', value: -0.04 }], 'Effizientere Netze senken den Energieverbrauch.'),
  T('fracking', 'energy', 2, 'Unkonventionelle Förderung', 480, ['smartGrid'], [{ stat: 'output.oil', value: 0.1 }, { stat: 'output.gas', value: 0.12 }, { stat: 'stability', value: -1 }], 'Mehr Öl und Gas – aber umstritten in der Bevölkerung.'),
  T('renewables', 'energy', 2, 'Erneuerbare Großanlagen', 520, ['smartGrid'], [{ stat: 'demand.oil', value: -0.06 }, { stat: 'demand.coal', value: -0.12 }, { stat: 'demand.gas', value: -0.06 }, { stat: 'demand.rareEarths', value: 0.08 }], 'Wind und Sonne ersetzen fossile Energieträger.'),
  T('storage', 'energy', 3, 'Großspeichertechnik', 880, ['renewables'], [{ stat: 'demand.oil', value: -0.08 }, { stat: 'demand.gas', value: -0.08 }, { stat: 'demand.rareEarths', value: 0.06 }], 'Batteriespeicher machen erneuerbare Energie grundlastfähig.'),
  T('fusionPilot', 'energy', 4, 'Fusionsreaktor-Pilot', 1800, ['storage', 'nanomaterials'], [{ stat: 'demand.oil', value: -0.1 }, { stat: 'demand.gas', value: -0.12 }, { stat: 'demand.coal', value: -0.15 }, { stat: 'growth', value: 0.0015 }], 'Nahezu unbegrenzte saubere Energie.'),
  // Agriculture
  T('precisionFarming', 'agriculture', 1, 'Präzisionslandwirtschaft', 220, [], [{ stat: 'output.food', value: 0.08 }], 'Sensoren und Satelliten optimieren den Anbau.'),
  T('verticalFarming', 'agriculture', 2, 'Vertikale Landwirtschaft', 500, ['precisionFarming'], [{ stat: 'output.food', value: 0.08 }, { stat: 'approval', value: 1 }], 'Nahrungsmittelproduktion in der Stadt.'),
  T('geneEditing', 'agriculture', 3, 'Genom-editierte Pflanzen', 850, ['verticalFarming', 'genomics'], [{ stat: 'output.food', value: 0.15 }], 'Ertragreiche und widerstandsfähige Sorten.'),
  // Society
  T('telemedicine', 'society', 1, 'Telemedizin', 240, [], [{ stat: 'popGrowth', value: 0.0008 }, { stat: 'approval', value: 1.5 }], 'Bessere medizinische Versorgung auch auf dem Land.'),
  T('eLearning', 'society', 1, 'Digitale Bildung', 260, [], [{ stat: 'researchSpeed', value: 0.08 }], 'Bildungsplattformen beschleunigen die Forschung.'),
  T('genomics', 'society', 2, 'Genomik', 620, ['telemedicine'], [{ stat: 'popGrowth', value: 0.0008 }, { stat: 'approval', value: 2 }, { stat: 'researchSpeed', value: 0.05 }], 'Personalisierte Medizin verlängert das Leben.'),
  T('smartCities', 'society', 3, 'Smart Cities', 980, ['genomics', 'fiveG'], [{ stat: 'approval', value: 3 }, { stat: 'infrastructureGain', value: 0.1 }], 'Vernetzte Städte erhöhen die Lebensqualität.'),
  // Infrastructure
  T('fiveG', 'infrastructure', 1, '5G-Netze', 270, [], [{ stat: 'infrastructureGain', value: 0.1 }, { stat: 'growth', value: 0.0005 }], 'Schnelles mobiles Internet für Wirtschaft und Bürger.'),
  T('highSpeedRail', 'infrastructure', 2, 'Hochgeschwindigkeitsverkehr', 560, ['fiveG'], [{ stat: 'infrastructureGain', value: 0.12 }, { stat: 'tradeGain', value: 0.1 }], 'Schnelle Verbindungen zwischen Wirtschaftszentren.'),
  T('satelliteInternet', 'infrastructure', 3, 'Satelliteninternet', 900, ['highSpeedRail'], [{ stat: 'infrastructureGain', value: 0.1 }, { stat: 'taxEfficiency', value: 0.02 }], 'Flächendeckende Konnektivität.'),
  T('autonomousLogistics', 'infrastructure', 4, 'Autonome Logistik', 1450, ['satelliteInternet', 'robotics'], [{ stat: 'growth', value: 0.0015 }, { stat: 'tradeGain', value: 0.15 }], 'Selbstfahrende Lieferketten.'),
  // Military
  T('drones', 'military', 1, 'Militärdrohnen', 300, [], [{ stat: 'militaryPower', value: 0.1 }], 'Unbemannte Systeme für Aufklärung und Angriff.'),
  T('cyberDefense', 'military', 2, 'Cyberabwehr', 560, ['drones'], [{ stat: 'militaryPower', value: 0.05 }, { stat: 'stability', value: 2 }], 'Schutz kritischer Infrastruktur.'),
  T('hypersonics', 'military', 3, 'Hyperschallwaffen', 1000, ['cyberDefense'], [{ stat: 'militaryPower', value: 0.15 }], 'Nahezu nicht abfangbare Waffensysteme.'),
  T('aiWarfare', 'military', 4, 'KI-gestützte Kriegsführung', 1600, ['hypersonics', 'robotics'], [{ stat: 'militaryPower', value: 0.2 }], 'Autonome Systeme auf dem Gefechtsfeld.'),
];

export const TECH_BY_ID = Object.fromEntries(TECHNOLOGIES.map((t) => [t.id, t]));
