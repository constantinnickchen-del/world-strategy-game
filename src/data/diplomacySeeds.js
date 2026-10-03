/**
 * Starting diplomatic situation for the modern scenarios.
 *
 * Blocs create treaties between all members. Opinion overrides set the
 * baseline opinion of specific pairs (symmetric). Everything else falls back
 * to the computed default (continent, government similarity, treaties).
 */

export const BLOCS = [
  {
    id: 'nato',
    name: 'NATO',
    treaties: ['alliance'],
    opinion: 35,
    members: [
      'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FRA', 'DEU', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA',
      'LTU', 'LUX', 'MNE', 'NLD', 'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'TUR', 'GBR', 'USA',
    ],
  },
  {
    id: 'eu',
    name: 'Europäische Union',
    treaties: ['trade', 'nonAggression'],
    opinion: 30,
    members: [
      'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA',
      'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE',
    ],
  },
  { id: 'efta', name: 'EFTA/EWR', treaties: ['trade'], opinion: 20, members: ['NOR', 'ISL', 'CHE', 'LIE'] },
  { id: 'usmca', name: 'USMCA', treaties: ['trade'], opinion: 20, members: ['USA', 'CAN', 'MEX'] },
  { id: 'csto', name: 'OVKS', treaties: ['alliance'], opinion: 30, members: ['RUS', 'BLR', 'ARM', 'KAZ', 'KGZ', 'TJK'] },
  { id: 'eaeu', name: 'Eurasische Wirtschaftsunion', treaties: ['trade'], opinion: 15, members: ['RUS', 'BLR', 'ARM', 'KAZ', 'KGZ'] },
  { id: 'mercosur', name: 'Mercosur', treaties: ['trade'], opinion: 15, members: ['ARG', 'BRA', 'PRY', 'URY'] },
  {
    id: 'asean',
    name: 'ASEAN',
    treaties: ['trade', 'nonAggression'],
    opinion: 15,
    members: ['BRN', 'KHM', 'IDN', 'LAO', 'MYS', 'MMR', 'PHL', 'SGP', 'THA', 'VNM'],
  },
  { id: 'gcc', name: 'Golf-Kooperationsrat', treaties: ['trade'], opinion: 20, members: ['SAU', 'ARE', 'KWT', 'QAT', 'BHR', 'OMN'] },
  { id: 'anzus', name: 'ANZUS', treaties: ['alliance'], opinion: 40, members: ['USA', 'AUS', 'NZL'] },
  { id: 'us-jpn', name: 'US-Japan-Sicherheitsvertrag', treaties: ['alliance'], opinion: 40, members: ['USA', 'JPN'] },
  { id: 'us-kor', name: 'US-Korea-Bündnis', treaties: ['alliance'], opinion: 40, members: ['USA', 'KOR'] },
  { id: 'chn-prk', name: 'Chinesisch-nordkoreanischer Vertrag', treaties: ['alliance'], opinion: 20, members: ['CHN', 'PRK'] },
  { id: 'eac', name: 'Ostafrikanische Gemeinschaft', treaties: ['trade'], opinion: 10, members: ['KEN', 'TZA', 'UGA', 'RWA', 'BDI', 'SDS'] },
  {
    id: 'ecowas',
    name: 'ECOWAS',
    treaties: ['trade'],
    opinion: 10,
    members: ['BEN', 'BFA', 'CPV', 'CIV', 'GMB', 'GHA', 'GIN', 'GNB', 'LBR', 'MLI', 'NER', 'NGA', 'SEN', 'SLE', 'TGO'],
  },
];

/** [a, b, opinion] – symmetric baseline opinion overrides. */
export const OPINION_OVERRIDES = [
  ['USA', 'GBR', 70], ['USA', 'CAN', 65], ['USA', 'ISR', 65], ['USA', 'JPN', 60], ['USA', 'KOR', 55],
  ['USA', 'AUS', 65], ['USA', 'TWN', 45], ['USA', 'SAU', 30], ['USA', 'RUS', -45], ['USA', 'CHN', -30],
  ['USA', 'IRN', -85], ['USA', 'PRK', -90], ['USA', 'CUB', -55], ['USA', 'VEN', -60], ['USA', 'SYR', -60],
  ['CHN', 'TWN', -60], ['CHN', 'JPN', -25], ['CHN', 'IND', -30], ['CHN', 'RUS', 45], ['CHN', 'PAK', 60],
  ['CHN', 'PRK', 40], ['CHN', 'VNM', -10], ['CHN', 'PHL', -15], ['CHN', 'KOR', -5],
  ['RUS', 'UKR', -70], ['RUS', 'GEO', -60], ['RUS', 'BLR', 60], ['RUS', 'SYR', 55], ['RUS', 'POL', -50],
  ['RUS', 'EST', -45], ['RUS', 'LVA', -45], ['RUS', 'LTU', -45], ['RUS', 'GBR', -40], ['RUS', 'IRN', 30],
  ['RUS', 'SRB', 45], ['RUS', 'IND', 40], ['RUS', 'KAZ', 40], ['RUS', 'ARM', 35],
  ['IND', 'PAK', -70], ['IND', 'USA', 35], ['IND', 'JPN', 35], ['ISR', 'IRN', -95], ['ISR', 'SYR', -80],
  ['ISR', 'PSX', -75], ['ISR', 'LBN', -60], ['ISR', 'EGY', 15], ['ISR', 'JOR', 10],
  ['SAU', 'IRN', -70], ['SAU', 'ARE', 65], ['SAU', 'QAT', -40], ['SAU', 'YEM', -60], ['ARE', 'QAT', -40],
  ['IRN', 'IRQ', 35], ['IRN', 'SYR', 60], ['KOR', 'PRK', -80], ['KOR', 'JPN', -10], ['JPN', 'PRK', -70],
  ['ARM', 'AZE', -80], ['TUR', 'ARM', -55], ['TUR', 'AZE', 70], ['TUR', 'GRC', -30], ['TUR', 'CYP', -55],
  ['TUR', 'SYR', -50], ['GRC', 'CYP', 70], ['SRB', 'KOS', -75], ['MAR', 'DZA', -45], ['MAR', 'SAH', -70],
  ['DZA', 'SAH', 40], ['VEN', 'COL', -45], ['ETH', 'ERI', -30], ['EGY', 'ETH', -30], ['SDN', 'SDS', -40],
  ['DEU', 'FRA', 70], ['FRA', 'GBR', 40], ['DEU', 'POL', 30], ['DEU', 'NLD', 60], ['DEU', 'AUT', 60],
  ['AUS', 'NZL', 75], ['CAN', 'GBR', 60], ['USA', 'MEX', 25], ['BRA', 'ARG', 25], ['PAK', 'AFG', -25],
  ['CHN', 'USA', -30], ['UKR', 'POL', 40], ['UKR', 'BLR', -10], ['QAT', 'TUR', 50],
];

/** [actor, target] – trade embargoes in force at scenario start. */
export const EMBARGOES = [
  ['USA', 'CUB'], ['USA', 'IRN'], ['USA', 'PRK'], ['USA', 'SYR'], ['USA', 'VEN'],
  ['KOR', 'PRK'], ['JPN', 'PRK'], ['ISR', 'IRN'], ['SAU', 'QAT'], ['ARE', 'QAT'],
];
