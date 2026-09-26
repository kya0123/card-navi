import { indexMaster, type MasterIndex } from './master';
import type { Card, CustomCard, Id, Route, Series, UserSettings } from './types';

/** その他のカード（一覧にないカード。詳細設計 32.8） */

export const CUSTOM_SERIES_ID = 'custom';
export const CUSTOM_MAX = 5;
/** 基本のポイント率の範囲（0.1〜3.0%、0.1%刻み） */
export const CUSTOM_RATE_MIN = 0.001;
export const CUSTOM_RATE_MAX = 0.03;
/** 経路を作る支払い方法：カード・スマホのタッチ決済・ネット */
export const CUSTOM_METHODS: readonly Id[] = ['card_physical', 'smartphone_visa_touch', 'online'];
const ID_RE = /^custom_[1-9][0-9]*$/;
const NAME_MAX = 30;

export const isCustomCardId = (id: Id) => ID_RE.test(id);

/** 0.1%刻みに丸める。範囲外は null */
export function normalizeCustomRate(rate: unknown): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  const r = Math.round(rate * 1000) / 1000;
  return r >= CUSTOM_RATE_MIN - 1e-9 && r <= CUSTOM_RATE_MAX + 1e-9 ? r : null;
}

export function customCardName(c: CustomCard, index: number): string {
  return c.name.trim() || `その他のカード${index + 1}`;
}

/** ポイントIDがマスタにない・率が範囲外・IDが不正か重複しているものを外す。最大5枚 */
export function sanitizeCustomCards(mi: MasterIndex, list: unknown): CustomCard[] {
  if (!Array.isArray(list)) return [];
  const base = mi.base ?? mi;
  const out: CustomCard[] = [];
  const seen = new Set<Id>();
  for (const x of list as Partial<CustomCard>[]) {
    if (out.length >= CUSTOM_MAX) break;
    if (!x || typeof x.id !== 'string' || !ID_RE.test(x.id) || seen.has(x.id)) continue;
    if (typeof x.pointId !== 'string' || !base.points.has(x.pointId)) continue;
    const rate = normalizeCustomRate(x.baseRate);
    if (rate === null) continue;
    seen.add(x.id);
    out.push({ id: x.id, name: typeof x.name === 'string' ? x.name.trim().slice(0, NAME_MAX) : '', pointId: x.pointId, baseRate: rate });
  }
  return out;
}

const cache = new WeakMap<MasterIndex, { list: readonly CustomCard[]; mi: MasterIndex }>();

/**
 * その他のカードを、持っているカードとして使えるようにマスタの索引に取り込む。
 * 特約とボーナスはなし。付与単位がわからないので月間合計（率で評価し、金額は概算）として扱う。
 */
export function withCustomCards(mi: MasterIndex, list: readonly CustomCard[] | undefined): MasterIndex {
  const base = mi.base ?? mi;
  if (!list || list.length === 0) return base;
  if (mi.custom === list) return mi;
  const hit = cache.get(base);
  if (hit && hit.list === list) return hit.mi;
  const m = base.raw;
  const series: Series = { id: CUSTOM_SERIES_ID, name: 'その他のカード', kana: 'そのたのかーど', aliases: [] };
  const cards: Card[] = list.map((c, i) => ({
    id: c.id, name: customCardName(c, i), brand: '', pointId: c.pointId, annualFee: 0,
    shortName: customCardName(c, i), kana: '', issuer: '', segments: [], highlight: '一覧にないカード（登録した基本のポイント率で比べます）',
    aliases: [], company: '', companyKana: '', series: CUSTOM_SERIES_ID, tier: 'general', userDefined: true,
  }));
  const routes: Route[] = list.flatMap((c) => {
    const yen = base.points.get(c.pointId)?.yenPerPoint ?? 1;
    return CUSTOM_METHODS.map((methodId): Route => ({
      id: `${c.id}_${methodId}`, cardId: c.id, methodId, pointId: c.pointId,
      baseRate: c.baseRate, unitYen: 100, pointsPerUnit: (c.baseRate * 100) / yen,
      unitScope: 'monthlyTotal', rounding: 'floor', countsTowardBonus: false,
      sourceUrl: '', checkedAt: m.checkedAt, confidence: 'high', note: '利用者が登録した基本のポイント率', userDefined: true,
    }));
  });
  const next: MasterIndex = {
    ...indexMaster({ ...m, series: [...m.series, series], cards: [...m.cards, ...cards], routes: [...m.routes, ...routes] }),
    base, custom: list,
  };
  cache.set(base, { list, mi: next });
  return next;
}

/** 追加して持っているカードの末尾に入れる。上限に達していれば何もしない */
export function addCustomCard(mi: MasterIndex, s: UserSettings, input: { name: string; pointId: Id; baseRate: number }): UserSettings {
  const list = s.customCards ?? [];
  const rate = normalizeCustomRate(input.baseRate);
  if (list.length >= CUSTOM_MAX || rate === null || !(mi.base ?? mi).points.has(input.pointId)) return s;
  const n = list.reduce((max, c) => Math.max(max, Number(c.id.slice('custom_'.length)) || 0), 0) + 1;
  const card: CustomCard = { id: `custom_${n}`, name: input.name.trim().slice(0, NAME_MAX), pointId: input.pointId, baseRate: rate };
  const priority = s.ownedCards.reduce((m, c) => Math.max(m, c.priority), 0) + 1;
  return {
    ...s,
    customCards: [...list, card],
    ownedCards: [...s.ownedCards, { cardId: card.id, enabledMethods: [...CUSTOM_METHODS], priority }],
  };
}

/** 削除して、持っているカードからも外す（優先順位を振り直す） */
export function removeCustomCard(s: UserSettings, id: Id): UserSettings {
  const customCards = (s.customCards ?? []).filter((c) => c.id !== id);
  const ownedCards = s.ownedCards.filter((c) => c.cardId !== id)
    .sort((a, b) => a.priority - b.priority)
    .map((c, i) => ({ ...c, priority: i + 1 }));
  const next: UserSettings = { ...s, ownedCards };
  if (customCards.length) next.customCards = customCards; else delete next.customCards;
  return next;
}
