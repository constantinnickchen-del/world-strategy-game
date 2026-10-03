/**
 * Where national resource capacity is located (ISO 3166-2 province codes).
 * A region containing one of these provinces receives a large share of its
 * country's capacity for that resource, so conquering it really matters.
 * Countries without listed provinces spread capacity by area and terrain.
 */
export const RESOURCE_HOTSPOTS = {
  oil: [
    'US-TX', 'US-ND', 'US-NM', 'US-AK', 'US-OK', 'CA-AB', 'CA-SK', 'RU-KHM', 'RU-YAN', 'RU-TA', 'RU-BA', 'RU-ORE', 'RU-SAK',
    'SA-04', 'IQ-BA', 'IR-10', 'KW-AH', 'AE-AZ', 'QA-RA', 'NG-RI', 'NG-DE', 'NG-BY', 'VE-V', 'BR-RJ', 'MX-CAM', 'MX-TAB',
    'KZ-ATY', 'KZ-MAN', 'DZ-30', 'AO-CAB', 'CN-XJ', 'CN-HL', 'GB-ABE', 'NO-11', 'OM-ZU', 'AZ-ABS', 'MY-13', 'TT-SIP', 'EG-JS',
  ],
  gas: ['US-TX', 'US-PA', 'US-LA', 'US-WV', 'RU-YAN', 'RU-KHM', 'IR-06', 'QA-RA', 'CA-AB', 'CA-BC', 'DZ-33', 'TM-B', 'AU-WA', 'NO-11', 'NL-GR', 'MY-13', 'EG-JS', 'AZ-ABS'],
  coal: ['CN-SX', 'CN-NM', 'CN-GZ', 'IN-JH', 'IN-OR', 'IN-CT', 'US-WY', 'US-WV', 'AU-QLD', 'AU-NSW', 'RU-KEM', 'ZA-MP', 'ID-KI', 'ID-KT', 'KZ-KAR', 'PL-SL', 'DE-NW', 'CO-CES', 'UA-14', 'MN-063'],
  metals: ['AU-WA', 'BR-MG', 'BR-PA', 'CL-AN', 'CL-AT', 'ZA-NW', 'ZA-LP', 'CD-KA', 'ZM-08', 'RU-KRS', 'RU-BEL', 'RU-MUR', 'CA-BC', 'UA-12', 'IN-OR', 'IN-JH', 'KZ-KAR', 'ID-PA', 'MN-063', 'SE-BD'],
  rareEarths: ['CN-NM', 'CN-JX', 'AU-WA', 'CD-KA', 'CL-AN', 'US-CA', 'MM-11', 'BR-MG', 'RU-MUR', 'BO-P'],
};

/** How much more capacity a hotspot province attracts compared to an average region. */
export const HOTSPOT_WEIGHT = 12;

/** Terrain affinity of resources when no hotspot is known. */
export const TERRAIN_RESOURCE_AFFINITY = {
  oil: { desert: 2, arctic: 1.5, plains: 1, forest: 1, jungle: 0.8, mountains: 0.5, urban: 0.2 },
  gas: { desert: 1.6, arctic: 1.6, plains: 1, forest: 1, jungle: 0.8, mountains: 0.6, urban: 0.2 },
  coal: { plains: 1.3, forest: 1.2, mountains: 1.2, desert: 0.6, arctic: 0.8, jungle: 0.5, urban: 0.3 },
  metals: { mountains: 2, desert: 1.4, arctic: 1.2, forest: 1, plains: 0.8, jungle: 0.8, urban: 0.2 },
  rareEarths: { mountains: 1.8, desert: 1.4, plains: 0.8, forest: 0.9, jungle: 1, arctic: 1, urban: 0.2 },
};
