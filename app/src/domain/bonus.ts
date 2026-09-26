import { addMonths, cmpYMD, lastDayOfMonth, parseYM, parseYMD, ymd } from './date';
import type { MasterIndex } from './master';
import type { Bonus, BonusGoal, OwnedCard, YM, YMD } from './types';

/** 入会月基準で today を含むボーナス期間を返す（詳細設計 5.1） */
export function bonusPeriod(joinYm: YM, offset: number, today: YMD): { start: YMD; end: YMD } {
  const j = parseYM(joinYm);
  let s = addMonths(j.y, j.m, offset);
  for (;;) {
    const n = addMonths(s.y, s.m, 12);
    if (cmpYMD(ymd(n.y, n.m, 1), today) <= 0) s = n;
    else break;
  }
  const e = addMonths(s.y, s.m, 11);
  return { start: ymd(s.y, s.m, 1), end: lastDayOfMonth(e.y, e.m) };
}

export interface Period { start: YMD; end: YMD; first: boolean }

/** 日付に1日加減する */
function shiftDay(d: YMD, n: number): YMD {
  const { y, m, d: dd } = parseYMD(d);
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * ボーナスの種類に応じて today を含む集計期間を返す（詳細設計 5.1）。
 * - fixed：毎年 fixedStartMonthDay から翌年の前日まで（入会年月は不要）
 * - joinMonth＋firstPeriodMonths：入会月から firstPeriodMonths か月は初年度、その後は startOffsetMonths 基準の12か月
 * - joinMonth：入会年月がなければ null
 */
export function periodFor(bonus: Bonus, joinYm: YM | undefined, today: YMD): Period | null {
  if (bonus.periodType === 'fixed') {
    const [mm, dd] = (bonus.fixedStartMonthDay ?? '01-01').split('-').map(Number);
    const t = parseYMD(today);
    let start = ymd(t.y, mm, dd);
    if (cmpYMD(today, start) < 0) start = ymd(t.y - 1, mm, dd);
    const s = parseYMD(start);
    return { start, end: shiftDay(ymd(s.y + 1, mm, dd), -1), first: false };
  }
  if (!joinYm) return null;
  if (bonus.firstPeriodMonths) {
    const j = parseYM(joinYm);
    const e = addMonths(j.y, j.m, bonus.firstPeriodMonths - 1);
    const firstEnd = lastDayOfMonth(e.y, e.m);
    if (cmpYMD(today, firstEnd) <= 0) return { start: ymd(j.y, j.m, 1), end: firstEnd, first: true };
  }
  const p = bonusPeriod(joinYm, bonus.startOffsetMonths, today);
  return { ...p, first: false };
}

export type GoalState = 'active' | 'achieved' | 'expired' | 'unset';

export interface GoalStatus {
  state: GoalState;
  start: YMD | null;
  deadline: YMD | null;
  thresholdYen: number;
  progressYen: number;
  remainingYen: number;
  monthsLeft: number;
  requiredMonthlyYen: number;
  progressRatio: number;
  /** 入会初年度の期間（特典額が異なる場合がある） */
  firstPeriod: boolean;
}

/** ボーナス目標の状態（詳細設計 5.2）。入会年月も手動期限もない場合は unset */
export function goalStatus(bonus: Bonus, goal: BonusGoal, card: OwnedCard | undefined, today: YMD): GoalStatus {
  const thresholdYen = goal.thresholdYen ?? bonus.thresholdYen;
  const progressYen = Math.max(goal.progressYen ?? 0, 0);
  let start: YMD | null = null;
  let deadline: YMD | null = null;
  let firstPeriod = false;
  if (goal.deadlineOverride) {
    deadline = goal.deadlineOverride;
  } else {
    const p = periodFor(bonus, card?.joinYm, today);
    if (p) {
      start = p.start;
      deadline = p.end;
      firstPeriod = p.first;
    }
  }
  const remainingYen = Math.max(thresholdYen - progressYen, 0);
  let state: GoalState;
  if (goal.achieved || progressYen >= thresholdYen) state = 'achieved';
  else if (!deadline) state = 'unset';
  else if (cmpYMD(today, deadline) > 0) state = 'expired';
  else state = 'active';

  let monthsLeft = 0;
  if (deadline) {
    const d = parseYMD(deadline), t = parseYMD(today);
    monthsLeft = Math.max((d.y - t.y) * 12 + (d.m - t.m) + 1, 0);
  }
  const requiredMonthlyYen = state === 'active' && monthsLeft > 0 ? Math.ceil(remainingYen / monthsLeft) : 0;
  const progressRatio = thresholdYen > 0 ? Math.min(progressYen / thresholdYen, 1) : 0;
  return { state, start, deadline, thresholdYen, progressYen, remainingYen, monthsLeft, requiredMonthlyYen, progressRatio, firstPeriod };
}

/** ボーナス価値（円）。入会初年度の期間は firstPeriodValueYen を使う。初回特典は未達成の場合のみ加算 */
export function bonusValueYen(bonus: Bonus, _goal: BonusGoal, firstPeriod = false): number {
  // おすすめではボーナスポイントだけを上乗せする。年会費無料になる初回特典（oneTimeValueYen）は含めない（詳細設計 31.2.4）
  return firstPeriod && bonus.firstPeriodValueYen != null ? bonus.firstPeriodValueYen : bonus.valueYen;
}

export interface RolloverNotice { bonusId: string; cardName: string }

/**
 * 期間の自動繰り越し（詳細設計 5.4）。
 * 手動期限でない目標について、保存済みの periodEnd を過ぎていれば前期実績に退避してリセットする。
 * 新しい goals 配列と通知対象を返す（入力は変更しない）。
 */
export function rolloverGoals(
  mi: MasterIndex, goals: BonusGoal[], cards: OwnedCard[], today: YMD,
): { goals: BonusGoal[]; notices: RolloverNotice[]; changed: boolean } {
  const notices: RolloverNotice[] = [];
  let changed = false;
  const next = goals.map((g) => {
    const bonus = mi.bonuses.get(g.bonusId);
    const card = cards.find((c) => c.cardId === bonus?.cardId);
    if (!bonus || !card || g.deadlineOverride) return g;
    const p = periodFor(bonus, card?.joinYm, today);
    if (!p) return g;
    const { end } = p;
    if (!g.periodEnd) {
      changed = true;
      return { ...g, periodEnd: end };
    }
    if (cmpYMD(today, g.periodEnd) > 0) {
      changed = true;
      notices.push({ bonusId: g.bonusId, cardName: mi.cards.get(bonus.cardId)?.name ?? bonus.cardId });
      return {
        ...g,
        prevPeriod: { deadline: g.periodEnd, progressYen: g.progressYen ?? 0, achieved: !!g.achieved },
        progressYen: 0,
        achieved: false,
        periodEnd: end,
        updatedAt: today,
      };
    }
    if (g.periodEnd !== end) {
      // 入会年月の変更などで期限が変わった場合は追従する
      changed = true;
      return { ...g, periodEnd: end };
    }
    return g;
  });
  return { goals: next, notices, changed };
}
