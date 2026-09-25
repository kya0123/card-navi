import type { MasterIndex } from '../domain/master';
import type { Id } from '../domain/types';

const SHORT: Record<string, string> = {
  card_physical: 'カード',
  smartphone_visa_touch: 'スマホのタッチ決済',
  applepay_quicpay: 'Apple Pay（QUICPay）',
  applepay_id: 'iD',
  online: 'ネット・アプリ注文',
  paypay: 'PayPay',
  mobile_suica_ride: 'モバイルSuica',
};

export const methodShort = (id: Id) => SHORT[id] ?? id;

export const pct = (x: number) => `${+(x * 100).toFixed(2)}%`;
export const yen = (x: number) => `${x.toLocaleString('ja-JP')}円`;

export function cardName(mi: MasterIndex, cardId: Id | null, routeId?: Id): string {
  if (cardId) return mi.cards.get(cardId)?.name ?? cardId;
  const r = routeId ? mi.routes.get(routeId) : undefined;
  if (r?.methodId === 'paypay') return 'PayPay残高';
  return r ? mi.methods.get(r.methodId)?.name ?? r.id : '';
}

export const pointName = (mi: MasterIndex, id: Id) => mi.points.get(id)?.name ?? id;
