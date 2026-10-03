/**
 * International arms procurement.
 *
 * Suppliers (data/military/suppliers.js) publish offers. Whether a country may
 * buy depends on diplomacy: opinion of the supplier's home country, alliances
 * with its rivals, embargoes and wars. Contracts are paid 15 % on signing (from
 * the treasury) and the rest per delivery (from the defence budget). If the
 * supplier's government later refuses (sanctions, war), deliveries stop.
 * Payments flow to the supplier's home country – arms exports matter.
 *
 * Contract: { id, supplier, kind, item, quantity, delivered, unitPrice, firstDelivery,
 *             rate, acc, status: 'active'|'suspended'|'completed', signedDay }
 */
import { SUPPLIERS, SUPPLIER_BY_ID } from '../../data/military/suppliers.js';
import { getOpinion, hasEmbargo, alliesOf, hasTreaty } from '../diplomacy.js';
import { areEnemies } from '../war/wars.js';
import { itemDef, deliverItem, MAX_ORDER_QUANTITY } from './production.js';
import { addNews } from '../news.js';
import { formatBn } from '../../util/format.js';

export const DOWN_PAYMENT = 0.15;
const MONTH = 30.44;

/** Why a supplier refuses to sell to a buyer (null = allowed). */
export function supplierRefusal(state, supplier, buyerId) {
  const home = state.countries[supplier.home];
  if (!home || home.eliminated) return 'Lieferant existiert nicht mehr.';
  if (buyerId === supplier.home || (supplier.partners ?? []).includes(buyerId)) return null;
  if (hasEmbargo(state, supplier.home, buyerId) || hasEmbargo(state, buyerId, supplier.home)) return `Embargo zwischen ${home.name} und Ihnen.`;
  if (areEnemies(state, supplier.home, buyerId)) return `${home.name} befindet sich im Krieg mit Ihnen.`;
  const allies = alliesOf(state, buyerId);
  const denied = supplier.denyAlliesOf.find((x) => x === buyerId || allies.includes(x));
  if (denied) return `${home.name} liefert nicht an ${denied === buyerId ? 'Sie' : `Verbündete von ${state.countries[denied]?.name ?? denied}`}.`;
  const op = getOpinion(state, supplier.home, buyerId);
  if (op < supplier.minOpinion) return `Beziehung zu ${home.name} zu schlecht (${Math.round(op)}, benötigt ${supplier.minOpinion}).`;
  return null;
}

function activeContractsOf(state, supplierId) {
  let n = 0;
  for (const id of state.countryOrder) for (const ct of state.countries[id].military.contracts) if (ct.supplier === supplierId && ct.status === 'active') n++;
  return n;
}

/** All offers for a buyer, including refusal reasons (for the UI and AI). */
export function procurementOffers(state, buyerId) {
  const out = [];
  for (const s of SUPPLIERS) {
    const refusal = supplierRefusal(state, s, buyerId);
    const backlog = activeContractsOf(state, s.id);
    const ally = hasTreaty(state, s.home, buyerId, 'alliance');
    for (const entry of s.catalog) {
      const def = itemDef(entry.kind, entry.id);
      if (!def) continue;
      const price = def.cost * entry.markup * (ally ? s.allyDiscount : 1) * (1 + Math.min(0.5, backlog * 0.03));
      out.push({
        supplier: s.id,
        supplierName: s.name,
        home: s.home,
        kind: entry.kind,
        item: entry.id,
        name: def.name,
        unitPrice: price,
        leadMonths: Math.round(entry.lead + Math.max(0, backlog - 4) * 1.5),
        rate: entry.rate,
        maxQuantity: MAX_ORDER_QUANTITY,
        refusal,
      });
    }
  }
  return out;
}

export function findOffer(state, buyerId, supplierId, kind, item) {
  return procurementOffers(state, buyerId).find((o) => o.supplier === supplierId && o.kind === kind && o.item === item) ?? null;
}

export function signContract(state, c, offer, quantity) {
  const total = offer.unitPrice * quantity;
  const down = total * DOWN_PAYMENT;
  c.economy.treasury -= down;
  if (c.economy.treasury < 0) {
    c.economy.debt += -c.economy.treasury;
    c.economy.treasury = 0;
  }
  payHome(state, offer.home, down);
  state.world.seq = (state.world.seq ?? 0) + 1;
  const ct = {
    id: `K${state.world.seq}`,
    supplier: offer.supplier,
    kind: offer.kind,
    item: offer.item,
    quantity,
    delivered: 0,
    unitPrice: offer.unitPrice,
    firstDelivery: state.time.day + Math.round(offer.leadMonths * MONTH),
    rate: offer.rate,
    acc: 0,
    status: 'active',
    signedDay: state.time.day,
  };
  c.military.contracts.push(ct);
  return ct;
}

/** Arms export revenue: part goes to the state, all of it counts as exports. */
function payHome(state, homeId, amount) {
  const home = state.countries[homeId];
  if (!home || home.eliminated) return;
  home.economy.treasury += amount * 0.3;
  home.military.armsExports = (home.military.armsExports ?? 0) + amount;
}

export function stepProcurement(state, c, wallet) {
  const m = c.military;
  let spent = 0;
  for (const ct of m.contracts) {
    if (ct.status === 'completed') continue;
    const supplier = SUPPLIER_BY_ID[ct.supplier];
    const refusal = supplierRefusal(state, supplier, c.id);
    if (refusal) {
      if (ct.status !== 'suspended' && c.id === state.playerId) {
        addNews(state, { category: 'diplomacy', countryId: c.id, importance: 2, text: `Lieferstopp: ${supplier.name} setzt den Vertrag über ${itemDef(ct.kind, ct.item).name} aus. ${refusal}` });
      }
      ct.status = 'suspended';
      continue;
    }
    ct.status = 'active';
    if (state.time.day < ct.firstDelivery) continue;
    ct.acc += ct.rate;
    let n = Math.min(Math.floor(ct.acc + 1e-9), ct.quantity - ct.delivered);
    if (n <= 0) continue;
    const perUnit = ct.unitPrice * (1 - DOWN_PAYMENT);
    const affordable = Math.floor(wallet.left / perUnit + 1e-9);
    n = Math.min(n, affordable);
    if (n <= 0) continue;
    const pay = wallet.take('procurement', n * perUnit);
    spent += pay;
    payHome(state, supplier.home, pay);
    ct.acc -= n;
    ct.delivered += n;
    deliverItem(state, c, ct.kind, ct.item, n);
    if (ct.delivered >= ct.quantity) {
      ct.status = 'completed';
      if (c.id === state.playerId) {
        addNews(state, { category: 'economy', countryId: c.id, importance: 2, text: `Beschaffung abgeschlossen: ${ct.quantity} × ${itemDef(ct.kind, ct.item).name} von ${supplier.name} (${formatBn(ct.quantity * ct.unitPrice)}).` });
      }
    }
  }
  m.contracts = m.contracts.filter((ct) => ct.status !== 'completed' || state.time.day - ct.firstDelivery < 365);
  return spent;
}
