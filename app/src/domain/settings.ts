import { isValidYM, isValidYMD } from './date';
import { methodsForCard, type MasterIndex } from './master';
import type { BonusGoal, OwnedCard, UserSettings, YMD } from './types';
import { sanitizeNearby } from './nearby';
import { monthlySpendOf } from './simulate';
import { isThemeId } from './theme';
import { CUSTOM_METHODS, sanitizeCustomCards, withCustomCards } from './custom';

export const APP_ID = 'card-advisor';
export const DEFAULT_STALE_DAYS = 180;

/** 初回起動時の既定値（詳細設計 8.1） */
export function defaultSettings(mi: MasterIndex): UserSettings {
  return {
    schemaVersion: 1,
    // 新規利用者は保有カードなし。カード一覧から選ぶ（詳細設計 20.7）
    ownedCards: [],
    enabledNonCardRoutes: mi.raw.routes.filter((r) => r.cardId === null).map((r) => r.id),
    bonusGoals: mi.raw.bonuses.map((b) => ({ bonusId: b.id, target: false })),
    staleWarnDays: DEFAULT_STALE_DAYS,
  };
}

/**
 * マスタとの整合をとる：消えたカード・手段・経路・ボーナスを除き、新しいボーナスは追加する。
 * 取り除いた件数を返す。
 */
export function reconcile(mi: MasterIndex, s: UserSettings): { settings: UserSettings; dropped: number } {
  let dropped = 0;
  // その他のカード（詳細設計 32.8）：不正なものを外し、持っているカードとして扱えるように取り込む
  const customCards = sanitizeCustomCards(mi, s.customCards);
  if (Array.isArray(s.customCards)) dropped += s.customCards.length - customCards.length;
  const mx = withCustomCards(mi, customCards);
  const ownedCards: OwnedCard[] = [];
  for (const c of s.ownedCards) {
    if (!mx.cards.has(c.cardId) || ownedCards.some((x) => x.cardId === c.cardId)) { dropped++; continue; }
    // 支払い方法の選択は廃止し、経路のある支払い方法はすべて使える前提にする（詳細設計 31.2.7）
    const card: OwnedCard = { ...c, enabledMethods: methodsForCard(mx, c.cardId) };
    if (!(c.joinYm && isValidYM(c.joinYm))) delete card.joinYm;
    ownedCards.push(card);
  }
  // その他のカードは常に持っているカード。抜けていれば末尾に加える
  for (const c of customCards) {
    if (ownedCards.some((x) => x.cardId === c.id)) continue;
    const priority = ownedCards.reduce((m, x) => Math.max(m, x.priority), 0) + 1;
    ownedCards.push({ cardId: c.id, enabledMethods: [...CUSTOM_METHODS], priority });
  }
  const enabledNonCardRoutes = s.enabledNonCardRoutes.filter((r) => mi.routes.get(r)?.cardId === null);
  dropped += s.enabledNonCardRoutes.length - enabledNonCardRoutes.length;
  const goals: BonusGoal[] = [];
  for (const g of s.bonusGoals) {
    if (!mi.bonuses.has(g.bonusId)) { dropped++; continue; }
    const goal: BonusGoal = { ...g };
    if (!(g.deadlineOverride && isValidYMD(g.deadlineOverride))) delete goal.deadlineOverride;
    goals.push(goal);
  }
  for (const b of mi.raw.bonuses) if (!goals.some((g) => g.bonusId === b.id)) goals.push({ bonusId: b.id, target: false });
  const settings: UserSettings = {
    schemaVersion: 1, ownedCards, enabledNonCardRoutes, bonusGoals: goals, staleWarnDays: clampStale(s.staleWarnDays),
  };
  if (s.lastExportAt && isValidYMD(s.lastExportAt)) settings.lastExportAt = s.lastExportAt;
  if (typeof s.showCardSuggestions === 'boolean') settings.showCardSuggestions = s.showCardSuggestions;
  if (s.reviewMonthlySpendYen !== undefined && monthlySpendOf(s) === s.reviewMonthlySpendYen) settings.reviewMonthlySpendYen = s.reviewMonthlySpendYen;
  if (isThemeId(s.theme)) settings.theme = s.theme;
  Object.assign(settings, sanitizeNearby(s));
  if (customCards.length) settings.customCards = customCards;
  return { settings, dropped };
}

function clampStale(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : DEFAULT_STALE_DAYS;
  return Math.min(Math.max(v, 30), 365);
}

// ---- エクスポート/インポート（詳細設計 8.2） ----
export interface BackupFile { app: typeof APP_ID; exportedAt: YMD; settings: UserSettings }

export function makeBackup(s: UserSettings, today: YMD): BackupFile {
  return { app: APP_ID, exportedAt: today, settings: s };
}

export function parseBackup(
  mi: MasterIndex, text: string,
): { ok: true; settings: UserSettings; dropped: number } | { ok: false; error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'JSONとして読み込めません' }; }
  const d = data as Partial<BackupFile>;
  if (!d || d.app !== APP_ID) return { ok: false, error: 'このアプリのバックアップファイルではありません' };
  const s = d.settings as UserSettings | undefined;
  if (!s || s.schemaVersion !== 1) return { ok: false, error: '対応していない形式のバージョンです' };
  if (!Array.isArray(s.ownedCards) || !Array.isArray(s.enabledNonCardRoutes) || !Array.isArray(s.bonusGoals))
    return { ok: false, error: '設定の形式が正しくありません' };
  for (const c of s.ownedCards) {
    if (typeof c?.cardId !== 'string' || !Array.isArray(c.enabledMethods) || typeof c.priority !== 'number')
      return { ok: false, error: '持っているカードの形式が正しくありません' };
  }
  for (const g of s.bonusGoals) {
    if (typeof g?.bonusId !== 'string' || typeof g.target !== 'boolean')
      return { ok: false, error: 'ボーナス目標の形式が正しくありません' };
  }
  const r = reconcile(mi, s);
  return { ok: true, settings: r.settings, dropped: r.dropped };
}
