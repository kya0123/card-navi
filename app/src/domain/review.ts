import { linkFor, type AffiliateMaster, type CardLink } from './affiliate';
import type { MasterIndex } from './master';
import { simulateAddCard, type SimResult } from './simulate';
import type { Id, UserSettings, YMD } from './types';

export interface ReviewItem extends SimResult { link: CardLink | null }

/** S07 の表示内容。並び順は simulateAddCard の結果のまま（リンクの有無・報酬で並べ替えない） */
export function reviewItems(
  mi: MasterIndex, aff: AffiliateMaster, user: UserSettings, recent: Id[], today: YMD,
): ReviewItem[] {
  return simulateAddCard(mi, user, recent, today).map((r) => ({ ...r, link: linkFor(mi, aff, r.cardId, today) }));
}
