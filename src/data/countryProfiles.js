/**
 * Hand-curated country parameters for the modern scenarios.
 *
 * Everything here is optional: countries without an entry get defaults derived
 * from their World Bank income group (see src/state/scenarioSetup.js).
 * Values are rough real-world approximations around 2019 and are meant as
 * game balance inputs, not as authoritative statistics.
 *
 * Fields:
 *   gov          government type id (src/data/governments.js)
 *   ideology     ruling ideology id
 *   tax          general government revenue, share of GDP
 *   debt         public debt, share of GDP
 *   mil          military spending, share of GDP
 *   infl         starting inflation (annual)
 *   unemp        starting unemployment
 *   stab         starting stability 0..100
 *   popGrowth    annual population growth
 *   deficit      starting budget deficit target (share of GDP) used for calibration
 *   debtTolerance debt/GDP above which markets demand a risk premium
 *   baseRate     baseline nominal interest rate on public debt
 *   rent         share of commodity export value captured by the state
 *   name         display name override
 */

const DEMOCRACIES = [
  'USA', 'CAN', 'MEX', 'BRA', 'ARG', 'CHL', 'URY', 'COL', 'PER', 'ECU', 'PRY', 'CRI', 'PAN', 'DOM', 'JAM', 'TTO',
  'GBR', 'IRL', 'FRA', 'DEU', 'NLD', 'BEL', 'LUX', 'CHE', 'AUT', 'ITA', 'ESP', 'PRT', 'GRC', 'MLT', 'CYP',
  'DNK', 'NOR', 'SWE', 'FIN', 'ISL', 'EST', 'LVA', 'LTU', 'POL', 'CZE', 'SVK', 'SVN', 'HRV', 'ROU', 'BGR',
  'HUN', 'MNE', 'MKD', 'ALB', 'SRB', 'BIH', 'KOS', 'MDA', 'UKR', 'GEO', 'ARM', 'ISR', 'IND', 'IDN', 'JPN',
  'KOR', 'TWN', 'MNG', 'PHL', 'MYS', 'LKA', 'NPL', 'BTN', 'AUS', 'NZL', 'ZAF', 'BWA', 'NAM', 'GHA', 'SEN',
  'CPV', 'MUS', 'TUN', 'KEN', 'MWI', 'ZMB', 'LSO', 'LBR', 'SLE', 'BEN', 'GUY', 'SUR', 'BLZ', 'BHS', 'BRB',
  'TLS', 'PNG', 'FJI', 'VUT', 'SLB', 'WSM', 'TON', 'KIR', 'FSM', 'MHL', 'PLW', 'SYC', 'STP', 'GTM', 'SLV',
  'HND', 'BOL', 'DMA', 'GRD', 'LCA', 'VCT', 'KNA', 'ATG', 'AND', 'LIE', 'SMR', 'MDV', 'NGA',
];
const HYBRID = [
  'TUR', 'PAK', 'BGD', 'SGP', 'THA', 'MAR', 'KGZ', 'LBN', 'IRQ', 'TZA', 'UGA', 'MDG', 'MOZ', 'CIV', 'GMB',
  'NER', 'BFA', 'MLI', 'GIN', 'GNB', 'TGO', 'HTI', 'NIC', 'VEN', 'DZA', 'ETH', 'COM', 'PSX', 'KHM', 'MMR',
  'AGO', 'ZWE', 'COD', 'COG', 'CMR', 'GAB', 'RWA', 'DJI', 'MRT', 'SOM', 'LBY', 'SDN', 'SDS', 'CAF', 'BDI',
  'TCD', 'GNQ', 'BLR', 'RUS', 'KAZ', 'UZB', 'AZE', 'TJK', 'EGY', 'SAH',
];
const ONE_PARTY = ['CHN', 'VNM', 'LAO', 'CUB', 'PRK', 'ERI', 'TKM'];
const MONARCHIES = ['SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'BRN', 'SWZ', 'JOR'];
const THEOCRACIES = ['IRN', 'AFG'];

export const GOV_TYPE_LISTS = { democracy: DEMOCRACIES, hybrid: HYBRID, oneParty: ONE_PARTY, monarchy: MONARCHIES, theocracy: THEOCRACIES };

export const COUNTRY_PROFILES = {
  USA: { ideology: 'conservative', tax: 0.30, debt: 1.07, mil: 0.034, infl: 0.018, unemp: 0.037, stab: 68, popGrowth: 0.005, deficit: 0.055, debtTolerance: 1.4, baseRate: 0.02 },
  CHN: { ideology: 'communist', tax: 0.25, debt: 0.55, mil: 0.017, infl: 0.029, unemp: 0.052, stab: 74, popGrowth: 0.003, deficit: 0.04, debtTolerance: 1.0, baseRate: 0.03 },
  JPN: { ideology: 'conservative', tax: 0.34, debt: 2.37, mil: 0.009, infl: 0.005, unemp: 0.024, stab: 80, popGrowth: -0.003, deficit: 0.03, debtTolerance: 2.6, baseRate: 0.004 },
  DEU: { ideology: 'conservative', tax: 0.39, debt: 0.60, mil: 0.013, infl: 0.014, unemp: 0.032, stab: 80, popGrowth: 0.002, deficit: -0.01, debtTolerance: 1.0, baseRate: 0.005 },
  IND: { ideology: 'nationalist', tax: 0.20, debt: 0.72, mil: 0.024, infl: 0.048, unemp: 0.058, stab: 58, popGrowth: 0.010, deficit: 0.07, debtTolerance: 0.8 },
  GBR: { ideology: 'conservative', tax: 0.37, debt: 0.85, mil: 0.021, infl: 0.018, unemp: 0.038, stab: 70, popGrowth: 0.006, deficit: 0.022, debtTolerance: 1.1, baseRate: 0.012 },
  FRA: { ideology: 'liberal', tax: 0.46, debt: 0.98, mil: 0.019, infl: 0.013, unemp: 0.084, stab: 66, popGrowth: 0.002, deficit: 0.03, debtTolerance: 1.1, baseRate: 0.008 },
  ITA: { ideology: 'liberal', tax: 0.42, debt: 1.35, mil: 0.014, infl: 0.006, unemp: 0.10, stab: 60, popGrowth: -0.002, deficit: 0.016, debtTolerance: 1.3, baseRate: 0.018 },
  BRA: { ideology: 'nationalist', tax: 0.32, debt: 0.88, mil: 0.014, infl: 0.037, unemp: 0.119, stab: 52, popGrowth: 0.007, deficit: 0.06 },
  CAN: { ideology: 'liberal', tax: 0.37, debt: 0.88, mil: 0.013, infl: 0.019, unemp: 0.057, stab: 80, popGrowth: 0.014, deficit: 0.005, debtTolerance: 1.1, baseRate: 0.015 },
  RUS: { gov: 'autocracy', ideology: 'nationalist', tax: 0.33, debt: 0.14, mil: 0.039, infl: 0.045, unemp: 0.046, stab: 60, popGrowth: -0.001, deficit: -0.02, rent: 0.45 },
  KOR: { ideology: 'liberal', tax: 0.24, debt: 0.42, mil: 0.027, infl: 0.004, unemp: 0.038, stab: 72, popGrowth: 0.001, deficit: 0.01, baseRate: 0.015 },
  ESP: { ideology: 'socialDemocratic', tax: 0.39, debt: 0.95, mil: 0.012, infl: 0.008, unemp: 0.141, stab: 62, popGrowth: 0.005, deficit: 0.028, debtTolerance: 1.1, baseRate: 0.01 },
  AUS: { ideology: 'conservative', tax: 0.35, debt: 0.47, mil: 0.019, infl: 0.016, unemp: 0.052, stab: 80, popGrowth: 0.014, deficit: 0.01, baseRate: 0.015 },
  MEX: { ideology: 'socialDemocratic', tax: 0.23, debt: 0.53, mil: 0.005, infl: 0.036, unemp: 0.035, stab: 48, popGrowth: 0.011, deficit: 0.023 },
  IDN: { ideology: 'nationalist', tax: 0.14, debt: 0.30, mil: 0.007, infl: 0.028, unemp: 0.053, stab: 60, popGrowth: 0.011, deficit: 0.022 },
  NLD: { ideology: 'liberal', tax: 0.43, debt: 0.48, mil: 0.013, infl: 0.026, unemp: 0.034, stab: 80, deficit: -0.017, baseRate: 0.005 },
  SAU: { ideology: 'religious', tax: 0.31, debt: 0.23, mil: 0.08, infl: -0.02, unemp: 0.06, stab: 64, popGrowth: 0.017, deficit: 0.045, rent: 0.75 },
  TUR: { ideology: 'nationalist', tax: 0.31, debt: 0.32, mil: 0.027, infl: 0.152, unemp: 0.137, stab: 50, popGrowth: 0.013, deficit: 0.03 },
  CHE: { ideology: 'conservative', tax: 0.33, debt: 0.40, mil: 0.007, infl: 0.004, unemp: 0.044, stab: 88, popGrowth: 0.007, deficit: -0.013, baseRate: 0.002 },
  POL: { ideology: 'nationalist', tax: 0.41, debt: 0.46, mil: 0.02, infl: 0.022, unemp: 0.033, stab: 66, popGrowth: -0.001, deficit: 0.007 },
  SWE: { ideology: 'socialDemocratic', tax: 0.48, debt: 0.35, mil: 0.011, infl: 0.017, unemp: 0.068, stab: 82, popGrowth: 0.010, deficit: -0.005, baseRate: 0.005 },
  BEL: { ideology: 'liberal', tax: 0.51, debt: 0.98, mil: 0.009, infl: 0.012, unemp: 0.054, stab: 70, deficit: 0.019, debtTolerance: 1.1, baseRate: 0.008 },
  ARG: { ideology: 'socialDemocratic', tax: 0.33, debt: 0.89, mil: 0.007, infl: 0.48, unemp: 0.098, stab: 42, popGrowth: 0.009, deficit: 0.04, debtTolerance: 0.5, baseRate: 0.05 },
  NOR: { ideology: 'conservative', tax: 0.57, debt: 0.40, mil: 0.017, infl: 0.022, unemp: 0.037, stab: 88, popGrowth: 0.007, deficit: -0.06, rent: 0.6 },
  AUT: { ideology: 'conservative', tax: 0.49, debt: 0.70, mil: 0.007, infl: 0.015, unemp: 0.045, stab: 80, deficit: -0.006, baseRate: 0.006 },
  IRN: { gov: 'theocracy', ideology: 'religious', tax: 0.13, debt: 0.47, mil: 0.023, infl: 0.35, unemp: 0.13, stab: 45, popGrowth: 0.013, deficit: 0.05, rent: 0.5 },
  ARE: { ideology: 'technocratic', tax: 0.30, debt: 0.27, mil: 0.056, infl: -0.019, unemp: 0.025, stab: 78, popGrowth: 0.014, deficit: 0.008, rent: 0.6 },
  NGA: { ideology: 'conservative', tax: 0.075, debt: 0.29, mil: 0.005, infl: 0.114, unemp: 0.081, stab: 36, popGrowth: 0.026, deficit: 0.045, rent: 0.5 },
  ISR: { ideology: 'nationalist', tax: 0.36, debt: 0.60, mil: 0.053, infl: 0.008, unemp: 0.038, stab: 62, popGrowth: 0.019, deficit: 0.039 },
  ZAF: { ideology: 'socialDemocratic', tax: 0.30, debt: 0.62, mil: 0.01, infl: 0.041, unemp: 0.29, stab: 48, popGrowth: 0.013, deficit: 0.063 },
  IRL: { ideology: 'conservative', tax: 0.24, debt: 0.57, mil: 0.003, infl: 0.009, unemp: 0.05, stab: 80, popGrowth: 0.012, deficit: -0.004 },
  DNK: { ideology: 'socialDemocratic', tax: 0.53, debt: 0.33, mil: 0.013, infl: 0.008, unemp: 0.05, stab: 86, popGrowth: 0.004, deficit: -0.037, baseRate: 0.002 },
  SGP: { ideology: 'technocratic', tax: 0.17, debt: 1.29, mil: 0.032, infl: 0.006, unemp: 0.023, stab: 88, popGrowth: 0.012, deficit: -0.03, debtTolerance: 2.0, baseRate: 0.015 },
  MYS: { ideology: 'nationalist', tax: 0.20, debt: 0.57, mil: 0.01, infl: 0.007, unemp: 0.033, stab: 64, popGrowth: 0.013, deficit: 0.034 },
  PHL: { ideology: 'nationalist', tax: 0.20, debt: 0.37, mil: 0.01, infl: 0.025, unemp: 0.051, stab: 52, popGrowth: 0.014, deficit: 0.034 },
  PAK: { ideology: 'nationalist', tax: 0.13, debt: 0.86, mil: 0.04, infl: 0.10, unemp: 0.045, stab: 40, popGrowth: 0.02, deficit: 0.09, debtTolerance: 0.6 },
  EGY: { gov: 'autocracy', ideology: 'military', tax: 0.19, debt: 0.84, mil: 0.012, infl: 0.09, unemp: 0.086, stab: 50, popGrowth: 0.02, deficit: 0.08, debtTolerance: 0.8 },
  VNM: { ideology: 'communist', tax: 0.19, debt: 0.46, mil: 0.023, infl: 0.028, unemp: 0.02, stab: 72, popGrowth: 0.009, deficit: 0.033 },
  BGD: { ideology: 'nationalist', tax: 0.09, debt: 0.34, mil: 0.013, infl: 0.056, unemp: 0.042, stab: 48, popGrowth: 0.010, deficit: 0.05 },
  CHL: { ideology: 'conservative', tax: 0.24, debt: 0.28, mil: 0.018, infl: 0.026, unemp: 0.072, stab: 60, popGrowth: 0.011, deficit: 0.029 },
  COL: { ideology: 'conservative', tax: 0.26, debt: 0.52, mil: 0.032, infl: 0.035, unemp: 0.105, stab: 46, popGrowth: 0.014, deficit: 0.025 },
  FIN: { ideology: 'socialDemocratic', tax: 0.52, debt: 0.59, mil: 0.015, infl: 0.011, unemp: 0.067, stab: 86, popGrowth: 0.001, deficit: 0.01, baseRate: 0.005 },
  GRC: { ideology: 'conservative', tax: 0.48, debt: 1.80, mil: 0.026, infl: 0.005, unemp: 0.173, stab: 52, popGrowth: -0.004, deficit: -0.01, debtTolerance: 1.9, baseRate: 0.015 },
  PRT: { ideology: 'socialDemocratic', tax: 0.43, debt: 1.17, mil: 0.016, infl: 0.003, unemp: 0.065, stab: 72, popGrowth: -0.002, deficit: -0.001, debtTolerance: 1.2, baseRate: 0.01 },
  CZE: { ideology: 'liberal', tax: 0.41, debt: 0.31, mil: 0.012, infl: 0.028, unemp: 0.02, stab: 74, deficit: -0.003 },
  ROU: { ideology: 'liberal', tax: 0.31, debt: 0.36, mil: 0.019, infl: 0.038, unemp: 0.039, stab: 58, popGrowth: -0.006, deficit: 0.046 },
  NZL: { ideology: 'socialDemocratic', tax: 0.38, debt: 0.32, mil: 0.015, infl: 0.016, unemp: 0.041, stab: 86, popGrowth: 0.016, deficit: -0.003 },
  PER: { ideology: 'liberal', tax: 0.20, debt: 0.27, mil: 0.012, infl: 0.021, unemp: 0.066, stab: 46, popGrowth: 0.016, deficit: 0.016 },
  IRQ: { ideology: 'religious', tax: 0.38, debt: 0.45, mil: 0.035, infl: -0.002, unemp: 0.13, stab: 32, popGrowth: 0.023, deficit: 0.02, rent: 0.85 },
  QAT: { ideology: 'religious', tax: 0.33, debt: 0.62, mil: 0.035, infl: -0.007, unemp: 0.01, stab: 82, popGrowth: 0.02, deficit: -0.01, rent: 0.8 },
  KWT: { ideology: 'religious', tax: 0.48, debt: 0.12, mil: 0.056, infl: 0.011, unemp: 0.02, stab: 76, popGrowth: 0.02, deficit: 0.04, rent: 0.85 },
  KAZ: { ideology: 'nationalist', tax: 0.18, debt: 0.20, mil: 0.01, infl: 0.053, unemp: 0.048, stab: 62, popGrowth: 0.013, deficit: 0.019, rent: 0.5 },
  DZA: { ideology: 'military', tax: 0.29, debt: 0.46, mil: 0.06, infl: 0.02, unemp: 0.115, stab: 46, popGrowth: 0.019, deficit: 0.09, rent: 0.7 },
  UKR: { ideology: 'liberal', tax: 0.39, debt: 0.50, mil: 0.034, infl: 0.079, unemp: 0.085, stab: 44, popGrowth: -0.005, deficit: 0.02 },
  VEN: { gov: 'autocracy', ideology: 'socialDemocratic', tax: 0.10, debt: 1.5, mil: 0.01, infl: 0.9, unemp: 0.30, stab: 20, popGrowth: -0.02, deficit: 0.1, debtTolerance: 0.3, baseRate: 0.06, rent: 0.8 },
  CUB: { tax: 0.45, debt: 0.5, mil: 0.03, infl: 0.05, unemp: 0.02, stab: 55 },
  PRK: { tax: 0.5, debt: 0.3, mil: 0.24, infl: 0.05, unemp: 0.03, stab: 60, popGrowth: 0.004, deficit: 0.03 },
  SYR: { gov: 'autocracy', ideology: 'nationalist', mil: 0.06, infl: 0.2, unemp: 0.4, stab: 15, popGrowth: 0.02 },
  YEM: { gov: 'hybrid', ideology: 'religious', mil: 0.04, infl: 0.2, unemp: 0.27, stab: 10, popGrowth: 0.024 },
  AFG: { mil: 0.012, infl: 0.023, unemp: 0.11, stab: 15, popGrowth: 0.023 },
  LBY: { ideology: 'military', infl: 0.05, unemp: 0.18, stab: 15, rent: 0.9 },
  SOM: { stab: 15, unemp: 0.14 },
  SDS: { stab: 12, infl: 0.5, rent: 0.8 },
  SDN: { stab: 28, infl: 0.5 },
  MLI: { stab: 30 },
  CAF: { stab: 18 },
  COD: { stab: 28 },
  HTI: { stab: 25, infl: 0.17 },
  LBN: { stab: 35, debt: 1.7, debtTolerance: 1.0, infl: 0.03 },
  ZWE: { stab: 34, infl: 0.6, debtTolerance: 0.4 },
  MMR: { stab: 38 },
  TWN: { name: 'Taiwan', ideology: 'liberal', tax: 0.13, debt: 0.33, mil: 0.019, infl: 0.005, unemp: 0.037, stab: 76, popGrowth: 0.001, deficit: 0.002 },
  THA: { gov: 'hybrid', ideology: 'military', tax: 0.21, debt: 0.41, mil: 0.014, infl: 0.007, unemp: 0.01, stab: 54, popGrowth: 0.003, deficit: 0.008 },
  HUN: { ideology: 'nationalist', tax: 0.44, debt: 0.65, mil: 0.012, infl: 0.034, unemp: 0.034, stab: 68, popGrowth: -0.002, deficit: 0.021 },
  SRB: { ideology: 'nationalist', mil: 0.02, stab: 60 },
  BLR: { gov: 'autocracy', ideology: 'nationalist', tax: 0.38, mil: 0.012, stab: 55 },
  OMN: { ideology: 'religious', mil: 0.088, rent: 0.8, stab: 70 },
  BHR: { ideology: 'religious', mil: 0.04, rent: 0.6, debt: 1.0, debtTolerance: 1.0, stab: 60 },
  AGO: { rent: 0.7, stab: 44 },
  AZE: { rent: 0.6, mil: 0.04 },
  TKM: { rent: 0.7 },
  BRN: { rent: 0.8 },
  GNQ: { rent: 0.7 },
  ECU: { rent: 0.35 },
  ARM: { mil: 0.049, stab: 54 },
  JOR: { mil: 0.047, stab: 60 },
  MAR: { ideology: 'conservative', mil: 0.031, stab: 60 },
  EST: { mil: 0.021, stab: 78 },
  LVA: { mil: 0.02, stab: 74 },
  LTU: { mil: 0.02, stab: 74 },
};
