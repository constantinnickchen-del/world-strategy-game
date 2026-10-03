/**
 * Scenario definitions. A scenario is a start date plus data sources and
 * overrides. New scenarios (historic start dates, fictional worlds) can be
 * added here without touching the setup code.
 */
export const SCENARIOS = {
  modern2020: {
    id: 'modern2020',
    name: 'Die Welt im Jahr 2020',
    description:
      'Die Welt zu Beginn des Jahrzehnts: Großmächte ringen um Einfluss, Rohstoffmärkte sind angespannt und die Weltwirtschaft steht vor großen Umbrüchen.',
    startDate: '2020-01-01',
    // Optional per-country overrides layered over countryProfiles.js
    overrides: {},
  },
};

export const DEFAULT_SCENARIO = 'modern2020';
