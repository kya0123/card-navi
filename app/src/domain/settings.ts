import { isValidYM, isValidYMD } from './date';
import { methodsForCard, type MasterIndex } from './master';
import type { BonusGoal, OwnedCard, UserSettings, YMD } from './types';
import { sanitizeNearby } from './nearby';
import { monthlySpendOf } from './simulate';
import { isThemeId } from './theme';

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
  const ownedCards: OwnedCard[] = [];
  for (const c of s.ownedCards) {
    if (!mi.cards.has(c.cardId)) { dropped++; continue; }
    const valid = new Set(methodsForCard(mi, c.cardId));
    const enabledMethods = c.enabledMethods.filter((m) => valid.has(m));
    dropped += c.enabledMethods.length - enabledMethods.length;
    const card: OwnedCard = { ...c, enabledMethods };
    if (!(c.joinYm && isValidYM(c.joinYm))) delete card.joinYm;
    ownedCards.push(card);
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
