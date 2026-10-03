/**
 * Government types. Systems read these parameters instead of hard-coding
 * behaviour per type, so new forms of government are pure data.
 */
export const GOVERNMENTS = {
  democracy: {
    name: 'Demokratie',
    electionYears: 4,
    approvalSensitivity: 1,
    stabilityBase: 62,
    reelectionThreshold: 47,
    canLoseElections: true,
  },
  hybrid: {
    name: 'Hybrides Regime',
    electionYears: 5,
    approvalSensitivity: 0.8,
    stabilityBase: 52,
    reelectionThreshold: 33,
    canLoseElections: true,
  },
  autocracy: {
    name: 'Autokratie',
    electionYears: 0,
    approvalSensitivity: 0.55,
    stabilityBase: 55,
    reelectionThreshold: 0,
    canLoseElections: false,
  },
  oneParty: {
    name: 'Einparteienstaat',
    electionYears: 0,
    approvalSensitivity: 0.5,
    stabilityBase: 60,
    reelectionThreshold: 0,
    canLoseElections: false,
  },
  monarchy: {
    name: 'Absolute Monarchie',
    electionYears: 0,
    approvalSensitivity: 0.5,
    stabilityBase: 62,
    reelectionThreshold: 0,
    canLoseElections: false,
  },
  theocracy: {
    name: 'Theokratie',
    electionYears: 0,
    approvalSensitivity: 0.55,
    stabilityBase: 50,
    reelectionThreshold: 0,
    canLoseElections: false,
  },
};

export const IDEOLOGIES = {
  conservative: { name: 'Konservativ', color: '#3b6fb6' },
  liberal: { name: 'Liberal', color: '#e0b31b' },
  socialDemocratic: { name: 'Sozialdemokratisch', color: '#d64541' },
  green: { name: 'Grün', color: '#3fa34d' },
  nationalist: { name: 'Nationalistisch', color: '#7a4b2a' },
  communist: { name: 'Kommunistisch', color: '#a00000' },
  religious: { name: 'Religiös-konservativ', color: '#2e7d5b' },
  military: { name: 'Militärregierung', color: '#556b2f' },
  technocratic: { name: 'Technokratisch', color: '#6c7a89' },
};

/** Which ideologies can follow each other after a lost election. */
export const IDEOLOGY_ROTATION = {
  conservative: ['socialDemocratic', 'liberal'],
  socialDemocratic: ['conservative', 'liberal', 'green'],
  liberal: ['conservative', 'socialDemocratic'],
  green: ['conservative', 'socialDemocratic'],
  nationalist: ['conservative', 'liberal'],
  religious: ['nationalist', 'conservative'],
  technocratic: ['conservative', 'socialDemocratic'],
  communist: ['socialDemocratic', 'nationalist'],
  military: ['nationalist', 'conservative'],
};
