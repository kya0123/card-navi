import { daysBetween } from './date';
import type { Id, YMD } from './types';

/** 提案の表示タイミング（詳細設計書（カード提案機能）4章・収益化設計書 8章） */

export type Interval = 7 | 14 | 30;

export interface PromoSlot {
  lastShownAt?: YMD;
  intervalDays: Interval;
  tappedSinceShown: boolean;
  dismissedUntil?: YMD;
  lastSignature?: string;
  pendingEarly?: 'rollover' | 'master';
}

export interface PromoState {
  firstLaunchAt: YMD;
  hint: Record<Id, PromoSlot>;
  hintLastShownAt?: YMD;
  hintLastStoreId?: Id;
  banner: PromoSlot;
  masterVersion?: string;
}

export const WARMUP_DAYS = 14;
export const DISMISS_DAYS = 60;
export const BANNER_MIN_STORES = 5;
export const BANNER_MIN_IMPROVED = 2;

export const newSlot = (): PromoSlot => ({ intervalDays: 7, tappedSinceShown: false });

export function newPromoState(today: YMD, masterVersion?: string): PromoState {
  return { firstLaunchAt: today, hint: {}, banner: newSlot(), masterVersion };
}

const NEXT: Record<Interval, Interval> = { 7: 14, 14: 30, 30: 30 };

function addDays(d: YMD, n: number): YMD {
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 表示してよいか（収益化設計書 8.4） */
export function canShow(slot: PromoSlot, sig: string, today: YMD): boolean {
  if (slot.dismissedUntil && today < slot.dismissedUntil) return false;
  if (!slot.lastShownAt) return true;
  const days = daysBetween(slot.lastShownAt, today);
  const changed = sig !== slot.lastSignature;
  if (slot.pendingEarly === 'rollover' && days >= 1) return true;
  if (slot.pendingEarly === 'master' && changed && days >= 1) return true;
  if (changed) return days >= 7;
  return days >= slot.intervalDays;
}

/** 今日すでに表示していて、タップも×もされていない（同じ日の再描画では出し続ける） */
export function isShowingToday(slot: PromoSlot, today: YMD): boolean {
  return slot.lastShownAt === today && !slot.tappedSinceShown && !(slot.dismissedUntil && today < slot.dismissedUntil);
}

export function markShown(slot: PromoSlot, sig: string, today: YMD): PromoSlot {
  const intervalDays = slot.lastShownAt && !slot.tappedSinceShown ? NEXT[slot.intervalDays] : slot.intervalDays;
  const next: PromoSlot = { ...slot, intervalDays, lastShownAt: today, lastSignature: sig, tappedSinceShown: false };
  delete next.pendingEarly;
  return next;
}

export function markTapped(slot: PromoSlot): PromoSlot {
  return { ...slot, tappedSinceShown: true, intervalDays: 7 };
}

export function markDismissed(slot: PromoSlot, today: YMD): PromoSlot {
  return { ...slot, dismissedUntil: addDays(today, DISMISS_DAYS), intervalDays: 30 };
}

export const warmedUp = (p: PromoState, today: YMD) => daysBetween(p.firstLaunchAt, today) >= WARMUP_DAYS;

/** 起動時の整理：最近のお店にないお店の記録を消し、早めに出すきっかけを立てる */
export function preparePromo(
  p: PromoState | undefined, today: YMD, masterVersion: string, recent: Id[], rolledOver: boolean,
): PromoState {
  const s: PromoState = p ? structuredClone(p) : newPromoState(today, masterVersion);
  const keep = new Set(recent);
  for (const id of Object.keys(s.hint)) if (!keep.has(id)) delete s.hint[id];
  if (rolledOver) s.banner.pendingEarly = 'rollover';
  else if (s.masterVersion && s.masterVersion !== masterVersion && s.banner.pendingEarly !== 'rollover') s.banner.pendingEarly = 'master';
  s.masterVersion = masterVersion;
  return s;
}
