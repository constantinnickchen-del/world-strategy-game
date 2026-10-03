/**
 * International arms suppliers (fictional companies / state export agencies,
 * tied to real home countries). They offer standard catalogue items with
 * markups, lead times and limited delivery capacity.
 *
 * Export rules (checked in src/systems/military/procurement.js):
 *   minOpinion       minimum opinion of the home country towards the buyer
 *   denyAlliesOf     buyers allied with one of these countries are refused
 *   allyDiscount     price factor for allies of the home country
 * Embargoes and wars involving the home country always block deliveries.
 *
 * Catalogue entry: { kind: 'aircraft'|'ship'|'equipment', id, markup, lead (months until first delivery), rate (units per month) }
 */
const air = (id, markup, lead, rate) => ({ kind: 'aircraft', id, markup, lead, rate });
const ship = (id, markup, lead, rate) => ({ kind: 'ship', id, markup, lead, rate });
const eq = (id, markup, lead, rate) => ({ kind: 'equipment', id, markup, lead, rate });

export const SUPPLIERS = [
  {
    id: 'atlantic', name: 'Atlantic Aerospace', home: 'USA', minOpinion: 15, denyAlliesOf: ['RUS', 'CHN', 'IRN', 'PRK'], allyDiscount: 0.93,
    catalog: [air('af16', 1.25, 18, 6), air('af35', 1.35, 30, 4), air('ac17', 1.2, 24, 1), air('ak46', 1.2, 24, 1), air('aq9', 1.3, 12, 4)],
  },
  {
    id: 'liberty', name: 'Liberty Land Systems', home: 'USA', minOpinion: 10, denyAlliesOf: ['RUS', 'CHN', 'IRN', 'PRK'], allyDiscount: 0.93,
    catalog: [eq('armor', 1.3, 10, 60), eq('artillery', 1.25, 8, 40), eq('airDefense', 1.4, 18, 3), eq('radar', 1.3, 12, 4), eq('vehicles', 1.2, 4, 800), eq('precisionMunitions', 1.3, 6, 3000)],
  },
  {
    id: 'columbia', name: 'Columbia Naval Yards', home: 'USA', minOpinion: 40, denyAlliesOf: ['RUS', 'CHN', 'IRN', 'PRK'], allyDiscount: 0.95,
    catalog: [ship('destroyer', 1.3, 36, 0.15), ship('submarine', 1.35, 36, 0.1), ship('amphibious', 1.25, 30, 0.1)],
  },
  {
    id: 'ural', name: 'Ural-Export', home: 'RUS', minOpinion: 0, denyAlliesOf: ['USA'], allyDiscount: 0.9,
    catalog: [air('ra30', 1.15, 18, 5), air('ra57', 1.3, 30, 2), air('ra31', 1.15, 18, 2), air('ra76', 1.1, 18, 2), eq('armor', 1.15, 8, 70), eq('artillery', 1.1, 6, 50), eq('airDefense', 1.2, 14, 4), ship('corvette', 1.15, 20, 0.3), ship('submarine', 1.25, 36, 0.1)],
  },
  {
    id: 'huaxia', name: 'Huaxia Defence Export', home: 'CHN', minOpinion: -10, denyAlliesOf: ['USA'], allyDiscount: 0.92,
    catalog: [air('dr10', 1.1, 15, 6), air('dr20', 1.3, 30, 2), air('hx2', 1.1, 6, 15), eq('armor', 1.1, 8, 80), eq('vehicles', 1.05, 3, 1200), eq('artillery', 1.05, 6, 60), eq('ammunition', 1.05, 2, 60000), ship('frigate', 1.15, 26, 0.3), ship('corvette', 1.1, 16, 0.5), ship('patrol', 1.05, 6, 2)],
  },
  {
    id: 'eurodef', name: 'Eurodefence Consortium', home: 'FRA', partners: ['DEU', 'ITA', 'ESP'], minOpinion: 20, denyAlliesOf: ['RUS', 'CHN', 'IRN', 'PRK'], allyDiscount: 0.95,
    catalog: [air('ej2', 1.25, 24, 3), air('ea400', 1.2, 24, 1), eq('armor', 1.3, 12, 40), eq('airDefense', 1.35, 18, 3), eq('radar', 1.3, 12, 5), ship('frigate', 1.25, 30, 0.3), ship('submarine', 1.3, 36, 0.15)],
  },
  {
    id: 'nordic', name: 'Nordic Systems', home: 'SWE', minOpinion: 25, denyAlliesOf: ['RUS', 'CHN'], allyDiscount: 1,
    catalog: [air('gr39', 1.2, 20, 2), eq('artillery', 1.25, 10, 15), eq('radar', 1.25, 10, 4), ship('submarine', 1.3, 36, 0.08), ship('corvette', 1.2, 18, 0.2)],
  },
  {
    id: 'anatolia', name: 'Anatolian Defence Industries', home: 'TUR', minOpinion: 5, denyAlliesOf: [], allyDiscount: 0.95,
    catalog: [air('tb3', 1.15, 6, 20), eq('vehicles', 1.1, 4, 500), eq('armor', 1.15, 10, 20), ship('corvette', 1.15, 20, 0.3), ship('patrol', 1.1, 8, 1)],
  },
  {
    id: 'negev', name: 'Negev Dynamics', home: 'ISR', minOpinion: 10, denyAlliesOf: ['IRN', 'SYR'], allyDiscount: 0.95,
    catalog: [air('nx1', 1.2, 8, 6), eq('airDefense', 1.3, 14, 3), eq('radar', 1.25, 10, 6), eq('drones', 1.2, 6, 200), eq('precisionMunitions', 1.25, 6, 2500)],
  },
  {
    id: 'hanseo', name: 'Hanseo Heavy Industries', home: 'KOR', minOpinion: 10, denyAlliesOf: ['PRK', 'RUS', 'CHN'], allyDiscount: 0.95,
    catalog: [air('kf21', 1.2, 30, 2), eq('armor', 1.2, 10, 50), eq('artillery', 1.15, 8, 60), ship('frigate', 1.2, 28, 0.3), ship('destroyer', 1.25, 36, 0.1)],
  },
  {
    id: 'balkan', name: 'Balkan Munitions Trading', home: 'SRB', partners: ['BGR'], minOpinion: -30, denyAlliesOf: [], allyDiscount: 1,
    catalog: [eq('ammunition', 1.15, 2, 80000), eq('infantryEquipment', 1.1, 2, 60000), eq('spareParts', 1.2, 2, 3000), eq('vehicles', 1.15, 4, 300)],
  },
];

export const SUPPLIER_BY_ID = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s]));
