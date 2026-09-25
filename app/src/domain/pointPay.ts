import type { MasterIndex } from './master';
import type { Id, RecommendItem, Store, UserSettings } from './types';

/** ポイント払い推奨（詳細設計 6章）。推奨しない場合は null */
export function pointPayFor(
  mi: MasterIndex, user: UserSettings, top: RecommendItem | undefined, store: Store | undefined, accepted: Set<Id>,
): Id[] | null {
  if (!top || top.rateSource !== 'base' || top.bonusRate !== 0) return null;

  const held = new Set<Id>();
  for (const c of user.ownedCards) {
    const p = mi.cards.get(c.cardId)?.pointId;
    if (p) held.add(p);
  }
  for (const rid of user.enabledNonCardRoutes) {
    const p = mi.routes.get(rid)?.pointId;
    if (p) held.add(p);
  }

  const usable = new Set<Id>(store?.usablePoints ?? []);
  for (const p of mi.raw.points) {
    if (p.usableScope === 'visaMerchants' && (accepted.has('smartphone_visa_touch') || accepted.has('online'))) usable.add(p.id);
    if (p.usableScope === 'paypayMerchants' && accepted.has('paypay')) usable.add(p.id);
  }
  // 表示順はマスタの定義順
  const result = mi.raw.points.map((p) => p.id).filter((id) => usable.has(id) && held.has(id));
  return result.length ? result : null;
}
