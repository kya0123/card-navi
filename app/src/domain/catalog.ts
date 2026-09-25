import { methodsForCard, type MasterIndex } from './master';
import { normalize } from './search';
import type { Card, CardSegment, Id, UserSettings } from './types';

/** カード一覧と保有カードの選択（詳細設計 20.4・24章） */

export type SegmentFilter = 'all' | CardSegment | 'owned';

export interface CatalogEntry {
  card: Card;
  owned: boolean;
  /** そのカードの経路のうち最大の基本還元率 */
  baseRate: number;
  /** 特約を含めた最大還元率（ボーナスは含めない） */
  maxRate: number;
  hasBonus: boolean;
}

const jaCollator = new Intl.Collator('ja');
const enCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const isLatin = (s: string) => /^[A-Za-z]/.test(s);

/** 英字で始まる名称を先にアルファベット順、その後に日本語をよみのあいうえお順（詳細設計 24.5） */
function compareNames(a: { name: string; kana: string }, b: { name: string; kana: string }): number {
  const la = isLatin(a.name), lb = isLatin(b.name);
  if (la !== lb) return la ? -1 : 1;
  return la ? enCollator.compare(a.name, b.name) : jaCollator.compare(a.kana, b.kana);
}

/** カード会社順 → 会社内はカード名順 */
export function compareCards(a: Card, b: Card): number {
  return compareNames({ name: a.company, kana: a.companyKana }, { name: b.company, kana: b.companyKana })
    || compareNames(a, b);
}

function rates(mi: MasterIndex, cardId: Id): { base: number; max: number } {
  let base = 0, max = 0;
  for (const r of mi.raw.routes) {
    if (r.cardId !== cardId) continue;
    base = Math.max(base, r.baseRate);
    max = Math.max(max, r.baseRate, ...(mi.rulesByRoute.get(r.id) ?? []).map((x) => x.rate));
  }
  return { base, max };
}

export function cardCatalog(mi: MasterIndex, user: UserSettings, filter: SegmentFilter, query = ''): CatalogEntry[] {
  const owned = new Set(user.ownedCards.map((c) => c.cardId));
  const q = normalize(query);
  return [...mi.raw.cards].sort(compareCards)
    .filter((c) => filter === 'all' || (filter === 'owned' ? owned.has(c.id) : c.segments.includes(filter)))
    .filter((c) => !q || [c.name, c.kana, c.shortName, c.issuer, ...c.aliases].some((x) => normalize(x).includes(q)))
    .map((card) => {
      const { base, max } = rates(mi, card.id);
      return { card, owned: owned.has(card.id), baseRate: base, maxRate: max, hasBonus: mi.bonusByCard.has(card.id) };
    });
}

export function segmentCounts(mi: MasterIndex, user: UserSettings): Record<SegmentFilter, number> {
  const owned = new Set(user.ownedCards.map((c) => c.cardId));
  return {
    all: mi.raw.cards.length,
    popular: mi.raw.cards.filter((c) => c.segments.includes('popular')).length,
    enthusiast: mi.raw.cards.filter((c) => c.segments.includes('enthusiast')).length,
    owned: mi.raw.cards.filter((c) => owned.has(c.id)).length,
  };
}

/** 末尾（優先順位最下位）に追加。経路のある支払い方法はすべて有効。既に保有していれば何もしない */
export function addOwnedCard(mi: MasterIndex, s: UserSettings, cardId: Id): UserSettings {
  if (!mi.cards.has(cardId)) throw new Error(`unknown card: ${cardId}`);
  if (s.ownedCards.some((c) => c.cardId === cardId)) return s;
  const priority = s.ownedCards.reduce((m, c) => Math.max(m, c.priority), 0) + 1;
  return { ...s, ownedCards: [...s.ownedCards, { cardId, enabledMethods: methodsForCard(mi, cardId), priority }] };
}

/** 外して優先順位を振り直す（入会年月も消える。ボーナス目標は残す） */
export function removeOwnedCard(s: UserSettings, cardId: Id): UserSettings {
  const ownedCards = s.ownedCards.filter((c) => c.cardId !== cardId)
    .sort((a, b) => a.priority - b.priority)
    .map((c, i) => ({ ...c, priority: i + 1 }));
  return { ...s, ownedCards };
}
