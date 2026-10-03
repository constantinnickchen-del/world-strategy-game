/**
 * War outlook for one side: who is winning, an estimated remaining duration
 * and a plain comparison of the forces. Read-only, derived from the state
 * (war score and its trend, strength of both sides, war exhaustion).
 */
import { otherSide } from './wars.js';
import { sideSummary } from '../military/quickOrders.js';
import { formatNumber } from '../../util/format.js';

const DECISIVE_SCORE = 60;
const PEACE_EXHAUSTION = 0.7;

/** Score change per 30 days over the recorded history (own perspective). */
function scoreTrend(war, sign) {
  const h = war.history ?? [];
  if (h.length < 3) return null;
  const [d0, s0] = h[Math.max(0, h.length - 9)];
  const [d1, s1] = h[h.length - 1];
  if (d1 <= d0) return null;
  return ((s1 - s0) * sign * 30) / (d1 - d0);
}

export function warOutlook(state, war, side) {
  const sign = side === 'attackers' ? 1 : -1;
  const score = war.score * sign;
  const ownIds = war[side];
  const enemyIds = war[otherSide(side)];
  const own = sideSummary(state, ownIds);
  const enemy = sideSummary(state, enemyIds);
  const ratio = own.power / Math.max(1, enemy.power);
  const ownExh = Math.max(...ownIds.map((id) => state.countries[id].military.exhaustion));
  const enemyExh = Math.max(...enemyIds.map((id) => state.countries[id].military.exhaustion));
  const trend = scoreTrend(war, sign);
  // a large war score (territory actually held) outweighs paper strength
  const strengthTerm = Math.max(-35, Math.min(35, (ratio - 1) * 30)) * (1 - Math.min(1, Math.abs(score) / 80));
  const value = score * 0.7 + strengthTerm + (enemyExh - ownExh) * 30 + (trend ?? 0) * 0.8;

  let verdict;
  let tone;
  if (value > 30) [verdict, tone] = ['Sie gewinnen den Krieg', 'good'];
  else if (value > 10) [verdict, tone] = ['Leichter Vorteil für Sie', 'good'];
  else if (value >= -10) [verdict, tone] = ['Die Lage ist ausgeglichen', 'warn'];
  else if (value >= -30) [verdict, tone] = ['Leichter Nachteil für Sie', 'bad'];
  else [verdict, tone] = ['Sie verlieren den Krieg', 'bad'];

  const reasons = [];
  if (Math.abs(score) >= 5) reasons.push(score > 0 ? `Sie halten mehr Gebiete und Schlachterfolge (Kriegspunkte ${Math.round(score)}).` : `Der Gegner ist im Vorteil bei Gebieten und Schlachten (Kriegspunkte ${Math.round(score)}).`);
  reasons.push(ratio >= 1.15 ? `Ihre Seite ist ${formatNumber(ratio, 1)}-mal so stark.` : ratio <= 0.87 ? `Der Gegner ist ${formatNumber(1 / ratio, 1)}-mal so stark.` : 'Beide Seiten sind etwa gleich stark.');
  if (trend !== null && Math.abs(trend) >= 1) reasons.push(trend > 0 ? 'Die Front entwickelt sich zu Ihren Gunsten.' : 'Die Front entwickelt sich zu Ihren Ungunsten.');
  if (enemyExh - ownExh > 0.15) reasons.push('Der Gegner ist kriegsmüder als Ihr Land.');
  else if (ownExh - enemyExh > 0.15) reasons.push('Ihr Land ist kriegsmüder als der Gegner.');

  // remaining duration: until one side is decisively ahead or exhausted
  const days = state.time.day - war.startDay;
  let months = null;
  if (days >= 20) {
    const candidates = [];
    if (trend !== null && Math.abs(trend) >= 0.5) {
      const left = trend > 0 ? DECISIVE_SCORE - score : DECISIVE_SCORE + score;
      if (left > 0) candidates.push(left / Math.abs(trend));
    }
    const maxExh = Math.max(ownExh, enemyExh);
    const monthsSoFar = days / 30.44;
    if (maxExh > 0.02) candidates.push(Math.max(0, PEACE_EXHAUSTION - maxExh) / (maxExh / monthsSoFar));
    if (Math.abs(score) >= DECISIVE_SCORE) candidates.push(1);
    if (candidates.length) months = Math.max(1, Math.min(60, Math.round(Math.min(...candidates))));
  }
  return { verdict, tone, value: Math.round(value), reasons, months, ratio, own, enemy, ownExh, enemyExh, score };
}
