/**
 * Aircraft models. Strategic values only.
 *
 *   role        fighter | interceptor | bomber | transport | recon | tanker | drone
 *   gen         technology generation (for display and AI preference)
 *   origin      'national' = can be built by any country with an aircraft factory
 *               (if it knows `requiresTech`); otherwise the supplier that builds it
 *               (its home country can also produce it domestically)
 *   airAttack / groundAttack   combat values per aircraft
 *   speed km/h, range km, payload t, cost bn, pp production points,
 *   maintenance bn per aircraft and year, reliability 0..1, serviceLife years
 */
const A = (id, name, role, gen, origin, stats) => ({ id, name, role, gen, origin, requiresTech: null, ...stats });

export const AIRCRAFT = [
  // ---- National designs (any country with an aircraft factory) ----
  A('jaegerMk1', 'Jäger Mk I', 'fighter', 4, 'national', { speed: 2100, range: 1500, payload: 5, airAttack: 50, groundAttack: 15, cost: 0.04, pp: 35, maintenance: 0.004, reliability: 0.82, serviceLife: 35 }),
  { ...A('jaegerMk2', 'Jäger Mk II', 'fighter', 4.5, 'national', { speed: 2200, range: 1800, payload: 7, airAttack: 70, groundAttack: 22, cost: 0.065, pp: 50, maintenance: 0.005, reliability: 0.86, serviceLife: 35 }), requiresTech: 'advancedAvionics' },
  { ...A('advancedFighter', 'Advanced Fighter', 'fighter', 5, 'national', { speed: 1960, range: 2200, payload: 8, airAttack: 100, groundAttack: 30, cost: 0.1, pp: 80, maintenance: 0.008, reliability: 0.88, serviceLife: 40 }), requiresTech: 'stealthAirframes' },
  A('abfangjaegerAJ1', 'Abfangjäger AJ-1', 'interceptor', 4, 'national', { speed: 2500, range: 1200, payload: 3, airAttack: 62, groundAttack: 0, cost: 0.045, pp: 38, maintenance: 0.004, reliability: 0.84, serviceLife: 35 }),
  A('bomberB1', 'Mittlerer Bomber B-1', 'bomber', 4, 'national', { speed: 1000, range: 4500, payload: 15, airAttack: 0, groundAttack: 75, cost: 0.15, pp: 120, maintenance: 0.012, reliability: 0.8, serviceLife: 45 }),
  A('transportT1', 'Transportflugzeug T-1', 'transport', 4, 'national', { speed: 800, range: 4500, payload: 30, airAttack: 0, groundAttack: 0, cost: 0.07, pp: 55, maintenance: 0.004, reliability: 0.9, serviceLife: 45 }),
  A('reconR1', 'Aufklärer R-1', 'recon', 4, 'national', { speed: 900, range: 3500, payload: 2, airAttack: 0, groundAttack: 0, cost: 0.05, pp: 40, maintenance: 0.004, reliability: 0.88, serviceLife: 40 }),
  A('tankerK1', 'Tankflugzeug K-1', 'tanker', 4, 'national', { speed: 850, range: 6000, payload: 90, airAttack: 0, groundAttack: 0, cost: 0.12, pp: 80, maintenance: 0.006, reliability: 0.9, serviceLife: 45 }),
  { ...A('droneD1', 'Kampfdrohne D-1', 'drone', 4, 'national', { speed: 300, range: 1500, payload: 1, airAttack: 0, groundAttack: 10, cost: 0.006, pp: 5, maintenance: 0.0006, reliability: 0.85, serviceLife: 15 }), requiresTech: 'drones' },
  { ...A('droneD2', 'Schwarmdrohne D-2', 'drone', 5, 'national', { speed: 250, range: 800, payload: 0.5, airAttack: 2, groundAttack: 16, cost: 0.004, pp: 3, maintenance: 0.0004, reliability: 0.8, serviceLife: 10 }), requiresTech: 'aiWarfare' },
  // ---- Export models of the arms suppliers (see suppliers.js) ----
  A('af16', 'AF-16 Falke', 'fighter', 4, 'atlantic', { speed: 2100, range: 1700, payload: 7, airAttack: 58, groundAttack: 20, cost: 0.045, pp: 38, maintenance: 0.004, reliability: 0.9, serviceLife: 40 }),
  A('af35', 'AF-35 Schatten', 'fighter', 5, 'atlantic', { speed: 1930, range: 2200, payload: 8, airAttack: 105, groundAttack: 35, cost: 0.09, pp: 75, maintenance: 0.007, reliability: 0.86, serviceLife: 40 }),
  A('ab52', 'AB-52 Atlas', 'bomber', 4, 'atlantic', { speed: 1000, range: 14000, payload: 30, airAttack: 0, groundAttack: 110, cost: 0.25, pp: 200, maintenance: 0.02, reliability: 0.82, serviceLife: 60 }),
  A('ac17', 'AC-17 Lastträger', 'transport', 4, 'atlantic', { speed: 830, range: 8000, payload: 75, airAttack: 0, groundAttack: 0, cost: 0.2, pp: 140, maintenance: 0.008, reliability: 0.92, serviceLife: 45 }),
  A('ak46', 'AK-46 Pegasus', 'tanker', 4, 'atlantic', { speed: 900, range: 11000, payload: 95, airAttack: 0, groundAttack: 0, cost: 0.17, pp: 110, maintenance: 0.007, reliability: 0.9, serviceLife: 45 }),
  A('aq9', 'AQ-9 Späher', 'drone', 4.5, 'atlantic', { speed: 400, range: 1800, payload: 1.7, airAttack: 0, groundAttack: 14, cost: 0.016, pp: 12, maintenance: 0.0015, reliability: 0.88, serviceLife: 20 }),
  A('ra30', 'Ra-30 Bär', 'fighter', 4.5, 'ural', { speed: 2120, range: 3000, payload: 8, airAttack: 66, groundAttack: 24, cost: 0.045, pp: 40, maintenance: 0.005, reliability: 0.8, serviceLife: 35 }),
  A('ra57', 'Ra-57 Phantom', 'fighter', 5, 'ural', { speed: 2100, range: 3500, payload: 10, airAttack: 90, groundAttack: 30, cost: 0.07, pp: 60, maintenance: 0.007, reliability: 0.78, serviceLife: 35 }),
  A('ra31', 'Ra-31 Wolf', 'interceptor', 4, 'ural', { speed: 3000, range: 1450, payload: 3, airAttack: 64, groundAttack: 0, cost: 0.04, pp: 35, maintenance: 0.005, reliability: 0.78, serviceLife: 40 }),
  A('ra95', 'Ra-95 Steppenadler', 'bomber', 4, 'ural', { speed: 900, range: 12000, payload: 15, airAttack: 0, groundAttack: 90, cost: 0.12, pp: 110, maintenance: 0.012, reliability: 0.78, serviceLife: 55 }),
  A('ra76', 'Ra-76 Kamel', 'transport', 4, 'ural', { speed: 800, range: 4400, payload: 45, airAttack: 0, groundAttack: 0, cost: 0.06, pp: 50, maintenance: 0.005, reliability: 0.82, serviceLife: 45 }),
  A('dr10', 'Dr-10 Drache', 'fighter', 4, 'huaxia', { speed: 2200, range: 1800, payload: 6, airAttack: 55, groundAttack: 18, cost: 0.035, pp: 32, maintenance: 0.004, reliability: 0.82, serviceLife: 35 }),
  A('dr20', 'Dr-20 Nebel', 'fighter', 5, 'huaxia', { speed: 2100, range: 2000, payload: 7, airAttack: 90, groundAttack: 28, cost: 0.075, pp: 62, maintenance: 0.007, reliability: 0.8, serviceLife: 35 }),
  A('hx2', 'HX-2 Flügel', 'drone', 4, 'huaxia', { speed: 280, range: 1500, payload: 0.5, airAttack: 0, groundAttack: 9, cost: 0.002, pp: 2, maintenance: 0.0003, reliability: 0.8, serviceLife: 15 }),
  A('ej2', 'EJ-2 Orkan', 'fighter', 4.5, 'eurodef', { speed: 2400, range: 1400, payload: 7.5, airAttack: 74, groundAttack: 24, cost: 0.09, pp: 70, maintenance: 0.007, reliability: 0.88, serviceLife: 40 }),
  A('ea400', 'EA-400 Kondor', 'transport', 4.5, 'eurodef', { speed: 780, range: 6400, payload: 37, airAttack: 0, groundAttack: 0, cost: 0.15, pp: 100, maintenance: 0.007, reliability: 0.88, serviceLife: 45 }),
  A('gr39', 'Gr-39 Greif', 'fighter', 4.5, 'nordic', { speed: 2200, range: 1500, payload: 5, airAttack: 64, groundAttack: 20, cost: 0.06, pp: 45, maintenance: 0.003, reliability: 0.92, serviceLife: 35 }),
  A('tb3', 'TB-3 Sperber', 'drone', 4, 'anatolia', { speed: 220, range: 300, payload: 0.15, airAttack: 0, groundAttack: 8, cost: 0.003, pp: 3, maintenance: 0.0003, reliability: 0.85, serviceLife: 15 }),
  A('nx1', 'NX-1 Wächter', 'recon', 4.5, 'negev', { speed: 200, range: 1000, payload: 0.5, airAttack: 0, groundAttack: 2, cost: 0.01, pp: 8, maintenance: 0.0008, reliability: 0.9, serviceLife: 20 }),
  A('kf21', 'KF-21 Habicht', 'fighter', 4.5, 'hanseo', { speed: 2200, range: 2900, payload: 7.7, airAttack: 66, groundAttack: 22, cost: 0.055, pp: 45, maintenance: 0.005, reliability: 0.88, serviceLife: 40 }),
];

export const AIRCRAFT_BY_ID = Object.fromEntries(AIRCRAFT.map((a) => [a.id, a]));

export const AIRCRAFT_ROLES = {
  fighter: { name: 'Jagdflugzeuge' },
  interceptor: { name: 'Abfangjäger' },
  bomber: { name: 'Bomber' },
  transport: { name: 'Transportflugzeuge' },
  recon: { name: 'Aufklärungsflugzeuge' },
  tanker: { name: 'Tankflugzeuge' },
  drone: { name: 'Drohnen' },
};
