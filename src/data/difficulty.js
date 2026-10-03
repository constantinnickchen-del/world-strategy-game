/**
 * Difficulty levels. They only affect the player's country (modifiers on
 * approval, stability, growth, tax efficiency, research, military) and how
 * eagerly AI countries choose the player as a war target.
 *   assistant        default of the monthly assistant for this level
 *   warTargetScore   added to the AI's war evaluation against the player (null = never attacks)
 */
export const DIFFICULTIES = {
  veryEasy: {
    name: 'Kinderleicht',
    description: 'Großzügige Boni, KI-Staaten greifen Sie nie an. Ideal zum Kennenlernen.',
    assistant: true,
    warTargetScore: null,
    mods: { approval: 12, stability: 12, growth: 0.012, taxEfficiency: 0.06, researchSpeed: 0.3, militaryPower: 0.25, unemployment: -0.01 },
  },
  easy: {
    name: 'Leicht',
    description: 'Spürbare Boni für Wirtschaft und Zustimmung, KI-Staaten sind Ihnen gegenüber zurückhaltend.',
    assistant: true,
    warTargetScore: -40,
    mods: { approval: 6, stability: 6, growth: 0.006, taxEfficiency: 0.03, researchSpeed: 0.15, militaryPower: 0.1 },
  },
  normal: {
    name: 'Mittel',
    description: 'Ausgewogen – alle Staaten spielen nach denselben Regeln.',
    assistant: true,
    warTargetScore: 0,
    mods: {},
  },
  hard: {
    name: 'Schwer',
    description: 'Unzufriedenere Bevölkerung, schwächere Wirtschaft, aggressivere Nachbarn.',
    assistant: false,
    warTargetScore: 15,
    mods: { approval: -5, stability: -5, growth: -0.004, taxEfficiency: -0.03, militaryPower: -0.05 },
  },
  veryHard: {
    name: 'Sehr schwer',
    description: 'Für Profis: deutliche Nachteile in allen Bereichen, Nachbarn suchen den Konflikt.',
    assistant: false,
    warTargetScore: 30,
    mods: { approval: -10, stability: -10, growth: -0.008, taxEfficiency: -0.06, researchSpeed: -0.15, militaryPower: -0.12, interestRate: 0.005 },
  },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
export const DEFAULT_DIFFICULTY = 'normal';
