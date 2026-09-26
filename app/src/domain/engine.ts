import { bonusValueYen, goalStatus } from './bonus';
import { cmpYMD, daysBetween } from './date';
import { acceptedMethods, type MasterIndex } from './master';
import { pointPayFor } from './pointPay';
import type {
  Id, RateRule, RateSource, RecommendItem, RecommendResult, Route, Store, UserSettings, YMD,
} from './types';

const EPS = 1e-9;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const pct = (x: number) => `${+(x * 100).toFixed(2)}%`;
const yen = (x: number) => `${x.toLocaleString('ja-JP')}円`;

/** owned＝持っているカードだけ（既定）／all＝登録カード全体（持っていないカードは経路のある支払い方法をすべて使う） */
export type RecommendScope = 'owned' | 'all';
export interface RecommendQuery { storeId?: Id; categoryId?: Id; amountYen?: number; scope?: RecommendScope }

function ruleValid(r: RateRule, today: YMD): boolean {
  return (r.validFrom == null || cmpYMD(r.validFrom, today) <= 0) && (r.validTo == null || cmpYMD(today, r.validTo) <= 0);
}

/** 還元率の決定：店舗 → カテゴリ → 基本（詳細設計 4.2-3） */
export function resolveRate(
  mi: MasterIndex, route: Route, store: Store | undefined, categoryId: Id, today: YMD,
): { rate: number; source: RateSource; rule?: RateRule } {
  const rules = (mi.rulesByRoute.get(route.id) ?? []).filter((r) => ruleValid(r, today));
  const pick = (hits: RateRule[]) => hits.reduce((a, b) => (b.rate > a.rate ? b : a));
  if (store) {
    const hit = rules.filter((r) => r.target.storeId === store.id);
    if (hit.length) { const r = pick(hit); return { rate: r.rate, source: 'store', rule: r }; }
  }
  const hit = rules.filter((r) => r.target.categoryId === categoryId);
  if (hit.length) { const r = pick(hit); return { rate: r.rate, source: 'category', rule: r }; }
  return { rate: route.baseRate, source: 'base' };
}

/** 付与ポイント（円換算）（詳細設計 4.3） */
export function earnedYen(route: Route, rate: number, amountYen: number | undefined): { yen: number | null; approx: boolean } {
  if (amountYen == null) return { yen: null, approx: false };
  if (route.unitScope === 'monthlyTotal') return { yen: Math.floor(amountYen * rate), approx: true };
  const base = Math.floor(amountYen / route.unitYen) * route.unitYen;
  return { yen: Math.floor(base * rate + EPS), approx: false };
}

interface Cand {
  route: Route; rate: number; source: RateSource; rule?: RateRule;
  bonusRate: number; effectiveRate: number; prio: number;
  earned: { yen: number | null; approx: boolean }; bonusReason?: string;
}

export function recommend(
  mi: MasterIndex, user: UserSettings, q: RecommendQuery, today: YMD, topN = 3,
): RecommendResult {
  const store = q.storeId ? mi.stores.get(q.storeId) : undefined;
  if (q.storeId && !store) throw new Error(`unknown store: ${q.storeId}`);
  const categoryId = store?.categoryId ?? q.categoryId;
  if (!categoryId || !mi.categories.has(categoryId)) throw new Error('storeId または categoryId が必要です');
  const accepted = acceptedMethods(mi, store, categoryId);

  const owned = new Map(user.ownedCards.map((c) => [c.cardId, c]));
  const goals = new Map(user.bonusGoals.map((g) => [g.bonusId, g]));
  const all = q.scope === 'all';
  const cardOrder = new Map(mi.raw.cards.map((c, i) => [c.id, i]));
  const cands: Cand[] = [];
  const warnings = new Set<string>();

  for (const route of mi.raw.routes) {
    if (!accepted.has(route.methodId)) continue;
    let prio: number;
    if (route.cardId === null) {
      if (!user.enabledNonCardRoutes.includes(route.id)) continue;
      prio = 99;
    } else {
      const c = owned.get(route.cardId);
      if (c) {
        if (!c.enabledMethods.includes(route.methodId)) continue;
        prio = c.priority;
      } else {
        // 持っていないカードは同率なら持っているカードの後ろ（マスタの定義順）
        if (!all) continue;
        prio = 1000 + (cardOrder.get(route.cardId) ?? 0);
      }
    }
    const { rate, source, rule } = resolveRate(mi, route, store, categoryId, today);

    let bonusRate = 0;
    let bonusReason: string | undefined;
    const bonus = route.cardId ? mi.bonusByCard.get(route.cardId) : undefined;
    // ボーナスは持っているカードだけ加算する（外したカードの目標が残っていても使わない）
    const goal = bonus && owned.has(bonus.cardId) ? goals.get(bonus.id) : undefined;
    if (bonus && goal?.target && route.countsTowardBonus && !bonus.excludedMethods.includes(route.methodId)) {
      const st = goalStatus(bonus, goal, owned.get(bonus.cardId), today);
      if (st.state === 'active') {
        bonusRate = bonusValueYen(bonus, goal, st.firstPeriod) / st.thresholdYen;
        bonusReason = `ボーナス：年間${yen(st.thresholdYen)}の利用で＋${pct(bonusRate)}相当（残り${yen(st.remainingYen)}・期限${st.deadline}）`;
      }
    }
    cands.push({
      route, rate: round6(rate), source, rule, bonusRate: round6(bonusRate),
      effectiveRate: round6(rate + bonusRate), prio, earned: earnedYen(route, rate, q.amountYen), bonusReason,
    });
  }

  cands.sort((a, b) =>
    b.effectiveRate - a.effectiveRate
    || Number(b.bonusRate > 0) - Number(a.bonusRate > 0)
    || a.prio - b.prio
    || (a.route.id < b.route.id ? -1 : a.route.id > b.route.id ? 1 : 0));

  // 1カード1枠（詳細設計 31.2.3）：いちばん高い実質還元率の経路をまとめ、同じカードの低い率は others に回す。
  // カード以外の経路は経路ごとに1枠
  const groups: (RecommendItem & { _c: Cand[] })[] = [];
  const index = new Map<string, RecommendItem & { _c: Cand[] }>();
  for (const c of cands) {
    const key = c.route.cardId ?? c.route.id;
    const g = index.get(key);
    if (g) {
      if (c.effectiveRate === g.effectiveRate) {
        g.routeIds.push(c.route.id);
        g.methodIds.push(c.route.methodId);
        g._c.push(c);
      } else {
        const o = g.others.find((x) => x.effectiveRate === c.effectiveRate);
        if (o) o.methodIds.push(c.route.methodId);
        else g.others.push({ methodIds: [c.route.methodId], effectiveRate: c.effectiveRate });
      }
      continue;
    }
    const item = {
      cardId: c.route.cardId, routeIds: [c.route.id], methodIds: [c.route.methodId],
      rate: c.rate, rateSource: c.source, bonusRate: c.bonusRate, effectiveRate: c.effectiveRate,
      earnedYen: c.earned.yen, earnedApprox: c.earned.approx, reasons: [] as string[], others: [], _c: [c],
    };
    index.set(key, item);
    groups.push(item);
  }

  const top: RecommendItem[] = groups.slice(0, topN).map(({ _c, ...item }) => {
    const c = _c[0];
    if (c.source === 'base') item.reasons.push(`通常のポイント率${pct(c.rate)}`);
    else item.reasons.push(`${store?.name ?? mi.categories.get(categoryId)?.name}で${pct(c.rate)}（${c.rule?.conditions ?? ''}）`);
    if (c.bonusReason) item.reasons.push(c.bonusReason);
    for (const x of _c) {
      if (x.route.needsReview || x.route.confidence === 'low')
        warnings.add(`「${routeLabel(mi, x.route)}」のポイント率は要確認です`);
      const checked = x.rule?.checkedAt ?? x.route.checkedAt;
      const days = daysBetween(checked, today);
      if (days > user.staleWarnDays) warnings.add(`ポイント率の確認日（${checked}）から${days}日経過しています`);
    }
    return item;
  });

  return {
    storeId: store?.id ?? null,
    categoryId,
    top,
    // ポイント払いは持っているカードの1位で判定する
    pointPay: all
      ? recommend(mi, user, { ...q, scope: 'owned', amountYen: undefined }, today, 1).pointPay
      : pointPayFor(mi, user, top[0], store, accepted),
    warnings: [...warnings],
  };
}

export function routeLabel(mi: MasterIndex, route: Route): string {
  const card = route.cardId ? mi.cards.get(route.cardId)?.name : null;
  const method = mi.methods.get(route.methodId)?.name ?? route.methodId;
  return card ? `${card}／${method}` : method;
}
