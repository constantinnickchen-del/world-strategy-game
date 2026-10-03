/**
 * Strategic commodities traded on the world market.
 *
 * Units are abstract "units per year"; the world starts with 1000 units of
 * capacity per resource (distributed by `producers` shares, in percent).
 * `annualValueBn` calibrates the base price so that commodity trade has a
 * realistic weight relative to world GDP (constant 2019 USD).
 * `demand` defines how consumption is distributed: by GDP, by population, or a mix.
 */
export const RESOURCES = {
  oil: {
    name: 'Erdöl',
    icon: '🛢',
    color: '#c9a227',
    annualValueBn: 2000,
    elasticity: 0.3,
    demand: { gdp: 0.85, pop: 0.15 },
    producers: {
      USA: 16, SAU: 12, RUS: 11.5, CAN: 6, IRQ: 5, CHN: 4.3, ARE: 4.2, BRA: 3.5, IRN: 3.5, KWT: 3,
      KAZ: 2, NOR: 2, MEX: 2, NGA: 2, QAT: 1.8, DZA: 1.5, AGO: 1.4, LBY: 1.2, OMN: 1, GBR: 1,
      VEN: 1, COL: 0.8, IND: 0.8, IDN: 0.8, AZE: 0.7, MYS: 0.6, EGY: 0.6, ARG: 0.6, ECU: 0.5,
      AUS: 0.4, THA: 0.4, COG: 0.3, TKM: 0.3, GAB: 0.2, SDS: 0.2, GNQ: 0.2, VNM: 0.2, TCD: 0.15,
      BRN: 0.1, ROU: 0.1, DNK: 0.1, ITA: 0.1, PER: 0.1, TTO: 0.1, YEM: 0.1, SYR: 0.1, TUN: 0.05,
    },
  },
  gas: {
    name: 'Erdgas',
    icon: '🔥',
    color: '#5aa9e6',
    annualValueBn: 800,
    elasticity: 0.3,
    demand: { gdp: 0.8, pop: 0.2 },
    producers: {
      USA: 23, RUS: 17, IRN: 6, CHN: 5, CAN: 4.5, QAT: 4.4, AUS: 3.7, NOR: 3, SAU: 3, DZA: 2.2,
      TKM: 2, MYS: 1.8, EGY: 1.6, IDN: 1.6, ARE: 1.5, UZB: 1.3, NGA: 1.2, ARG: 1.1, GBR: 1, OMN: 1,
      AZE: 1, THA: 0.9, MEX: 0.8, PAK: 0.8, IND: 0.8, TTO: 0.8, KAZ: 0.7, BGD: 0.7, NLD: 0.6,
      UKR: 0.5, KWT: 0.4, LBY: 0.4, BOL: 0.4, MMR: 0.4, IRQ: 0.3, BRN: 0.3, PER: 0.3,
    },
  },
  coal: {
    name: 'Kohle',
    icon: '⛏',
    color: '#8d8d8d',
    annualValueBn: 500,
    elasticity: 0.35,
    demand: { gdp: 0.7, pop: 0.3 },
    producers: {
      CHN: 50, IND: 10, IDN: 7.5, USA: 7, AUS: 6.5, RUS: 5.5, ZAF: 3.2, DEU: 1.5, KAZ: 1.5, POL: 1.3,
      COL: 1, TUR: 1, VNM: 0.6, MNG: 0.6, CAN: 0.6, CZE: 0.5, UKR: 0.4, SRB: 0.3, BGR: 0.3, GRC: 0.2, MOZ: 0.2,
    },
  },
  metals: {
    name: 'Erze & Metalle',
    icon: '⚙',
    color: '#b5651d',
    annualValueBn: 900,
    elasticity: 0.35,
    demand: { gdp: 0.9, pop: 0.1 },
    producers: {
      AUS: 25, BRA: 12, CHN: 12, CHL: 6, IND: 5, RUS: 4, PER: 4, ZAF: 3, CAN: 3, USA: 3, COD: 3,
      UKR: 2, KAZ: 2, IDN: 2, GIN: 2, MEX: 1.5, ZMB: 1.5, SWE: 1, IRN: 1, PHL: 1, MRT: 0.5, VNM: 0.5,
      MNG: 0.5, TUR: 0.5, BOL: 0.5, PNG: 0.4, JAM: 0.3, NOR: 0.3,
    },
  },
  rareEarths: {
    name: 'Kritische Mineralien',
    icon: '💎',
    color: '#9b59b6',
    annualValueBn: 150,
    elasticity: 0.25,
    demand: { gdp: 1, pop: 0 },
    producers: {
      CHN: 55, AUS: 10, COD: 8, USA: 7, CHL: 5, MMR: 4, ARG: 2, RUS: 1.5, IND: 1, BRA: 1,
      MDG: 1, ZWE: 1, CAN: 1, VNM: 0.5, THA: 0.5,
    },
  },
  food: {
    name: 'Agrargüter',
    icon: '🌾',
    color: '#6ab04c',
    annualValueBn: 1500,
    elasticity: 0.45,
    demand: { gdp: 0.35, pop: 0.65 },
    // Listed producers cover ~88 %; the rest is spread over all countries by population (see scenario setup).
    baseShareByPopulation: 12,
    producers: {
      CHN: 18, USA: 10, IND: 9, BRA: 6.5, RUS: 3.6, ARG: 2.8, IDN: 2.6, UKR: 2.3, FRA: 2.3, CAN: 2,
      AUS: 1.5, TUR: 1.4, MEX: 1.4, PAK: 1.4, NGA: 1.4, DEU: 1.3, THA: 1.2, VNM: 1.2, BGD: 1.1,
      ESP: 1.1, ITA: 1, POL: 0.9, EGY: 0.8, IRN: 0.7, PHL: 0.7, JPN: 0.7, KAZ: 0.6, GBR: 0.6,
      ETH: 0.6, ROU: 0.5, MYS: 0.5, NZL: 0.5,
    },
  },
};

export const RESOURCE_IDS = Object.keys(RESOURCES);

export function basePrice(resourceId) {
  // bn USD per unit (world capacity = 1000 units)
  return RESOURCES[resourceId].annualValueBn / 1000;
}
