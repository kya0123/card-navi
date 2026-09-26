import { recommend } from './engine';
import { methodsForCard, type MasterIndex } from './master';
import type { Id, UserSettings, YMD } from './types';

/** カード提案機能（詳細設計書（カード提案機能）3章）。金額は使わず、最近使ったお店をもとに比べる */

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const CANDIDATE_PRIORITY = 999;
/** ①ヒントを出す最小の差（3ポイント） */
export const HINT_MIN_DELTA = 0.03;
/** ②③で「上がる」とみなす最小の差（2ポイント） */
export const SIM_MIN_DELTA = 0.02;

export interface StoreDelta { storeId: Id; beforeRate: number; afterRate: number }

/** 見直すタブの月のカード利用額（分冊10.2） */
export const DEFAULT_MONTHLY_SPEND = 50_000;
export const MIN_MONTHLY_SPEND = 10_000;
export const MAX_MONTHLY_SPEND = 1_000_000;
export const MONTHLY_SPEND_STEP = 10_000;

/** 設定値を範囲内の1万円単位に正す。範囲外・非整数は既定値 */
export function monthlySpendOf(s: UserSettings): number {
  const v = s.reviewMonthlySpendYen;
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_MONTHLY_SPEND && v <= MAX_MONTHLY_SPEND
    && v % MONTHLY_SPEND_STEP === 0 ? v : DEFAULT_MONTHLY_SPEND;
}

/** 年間の損得（分冊10.3） */
export interface NetResult {
  gainYen: number;
  bonusYen: number;
  feeYen: number;
  netYen: number;
  /** 回収ライン（月のカード利用額）。年会費0円は null、上がるお店がなければ null */
  breakEvenMonthlyYen: number | null;
  movedAnnualYen: number;
}

/**
 * share＝上がるお店の割合、avgDelta＝率の差の平均。bonusAchieved が true ならボーナスは移る額によらず加算する
 */
export function annualNet(
  mi: MasterIndex, cardId: Id, share: number, avgDelta: number, monthlySpendYen: number, bonusAchieved = false,
): NetResult {
  const card = mi.cards.get(cardId)!;
  const bonus = mi.bonusByCard.get(cardId);
  const feeYen = card.annualFee;
  const movedAnnualYen = Math.floor(round6(monthlySpendYen * 12 * share));
  const gainYen = Math.floor(round6(movedAnnualYen * avgDelta));
  const bonusYen = bonus && (bonusAchieved || movedAnnualYen >= bonus.thresholdYen) ? bonus.valueYen : 0;
  const perYen = round6(12 * share * avgDelta);
  return {
    gainYen, bonusYen, feeYen, netYen: gainYen + bonusYen - feeYen, movedAnnualYen,
    breakEvenMonthlyYen: feeYen > 0 && perYen > 0 ? Math.ceil(round6(feeYen / perYen / 100)) * 100 : null,
  };
}

export interface SimResult {
  cardId: Id;
  totalStores: number;
  improved: StoreDelta[];
  per10kYen: number;
  /** 回収ライン（月のカード利用額。分冊10.3）。年会費0円は null */
  breakEvenMonthlyYen: number | null;
  annualFeeYen: number;
  bonusNote: string | null;
  net: NetResult;
}

/** ボーナス加算なしで比べるための設定 */
function neutral(user: UserSettings): UserSettings {
  return { ...user, bonusGoals: [] };
}

function withCandidate(mi: MasterIndex, user: UserSettings, cardId: Id): UserSettings {
  return {
    ...user,
    ownedCards: [...user.ownedCards, { cardId, enabledMethods: methodsForCard(mi, cardId), priority: CANDIDATE_PRIORITY }],
  };
}

function topAt(mi: MasterIndex, user: UserSettings, storeId: Id, today: YMD) {
  return recommend(mi, user, { storeId }, today, 1).top[0];
}

export function unownedCards(mi: MasterIndex, user: UserSettings): Id[] {
  const owned = new Set(user.ownedCards.map((c) => c.cardId));
  return mi.raw.cards.map((c) => c.id).filter((id) => !owned.has(id));
}

/** 未保有カードを1枚追加した場合に、最近のお店で還元がどれだけ上がるか */
export function simulateAddCard(
  mi: MasterIndex, user: UserSettings, recent: Id[], today: YMD, opt: { minDelta?: number; monthlySpendYen?: number } = {},
): SimResult[] {
  const minDelta = opt.minDelta ?? SIM_MIN_DELTA;
  const spend = opt.monthlySpendYen ?? monthlySpendOf(user);
  const base = neutral(user);
  const stores = [...new Set(recent)].filter((id) => mi.stores.has(id));
  const before = new Map(stores.map((id) => [id, topAt(mi, base, id, today)?.rate ?? 0]));
  const results: SimResult[] = [];

  for (const cardId of unownedCards(mi, user)) {
    const u = withCandidate(mi, base, cardId);
    const improved: StoreDelta[] = [];
    stores.forEach((storeId) => {
      const beforeRate = before.get(storeId)!;
      const top = topAt(mi, u, storeId, today);
      if (!top || top.cardId !== cardId) return;
      if (round6(top.rate - beforeRate) >= round6(minDelta)) improved.push({ storeId, beforeRate, afterRate: top.rate });
    });
    if (!improved.length) continue;
    // 差の大きい順、同じ差なら最近使った順（stores の並び）
    const order = new Map(stores.map((id, i) => [id, i]));
    improved.sort((a, b) => (b.afterRate - b.beforeRate) - (a.afterRate - a.beforeRate)
      || order.get(a.storeId)! - order.get(b.storeId)!);
    const avg = improved.reduce((s, d) => s + (d.afterRate - d.beforeRate), 0) / improved.length;
    const card = mi.cards.get(cardId)!;
    const bonus = mi.bonusByCard.get(cardId);
    const net = annualNet(mi, cardId, improved.length / stores.length, round6(avg), spend);
    results.push({
      cardId,
      totalStores: stores.length,
      improved,
      per10kYen: Math.floor(round6(avg) * 10000 + 1e-9),
      breakEvenMonthlyYen: net.breakEvenMonthlyYen,
      annualFeeYen: card.annualFee,
      net,
      bonusNote: bonus
        ? `年${bonus.thresholdYen.toLocaleString('ja-JP')}円の利用で${bonus.valueYen.toLocaleString('ja-JP')}円相当のポイント`
        : null,
    });
  }

  // 並び：年間の損得 → 上がるお店の数 → 1万円あたり → カードID（アフィリエイトは使わない）
  results.sort((a, b) => b.net.netYen - a.net.netYen
    || b.improved.length - a.improved.length
    || b.per10kYen - a.per10kYen
    || (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
  return results;
}

export interface OwnedFeeResult {
  cardId: Id;
  totalStores: number;
  /** そのカードが1位で、外すと率が下がるお店（beforeRate＝外した場合、afterRate＝持っている場合） */
  bestStores: StoreDelta[];
  net: NetResult;
  /** 今期達成済みのボーナスがある */
  bonusAchieved: boolean;
}

/** 持っているカード（年会費1円以上）が年会費を回収できているか（分冊10.3） */
export function ownedFeeReview(
  mi: MasterIndex, user: UserSettings, recent: Id[], today: YMD, monthlySpendYen = monthlySpendOf(user),
): OwnedFeeResult[] {
  const base = neutral(user);
  const stores = [...new Set(recent)].filter((id) => mi.stores.has(id));
  const withRate = new Map(stores.map((id) => [id, topAt(mi, base, id, today)]));
  const out: OwnedFeeResult[] = [];
  for (const oc of user.ownedCards) {
    const card = mi.cards.get(oc.cardId);
    if (!card || card.annualFee <= 0) continue;
    const without: UserSettings = { ...base, ownedCards: base.ownedCards.filter((c) => c.cardId !== oc.cardId) };
    const bestStores: StoreDelta[] = [];
    for (const storeId of stores) {
      const top = withRate.get(storeId);
      if (!top || top.cardId !== oc.cardId) continue;
      const other = topAt(mi, without, storeId, today)?.rate ?? 0;
      if (round6(top.rate - other) > 0) bestStores.push({ storeId, beforeRate: other, afterRate: top.rate });
    }
    const bonus = mi.bonusByCard.get(oc.cardId);
    const goal = bonus ? user.bonusGoals.find((g) => g.bonusId === bonus.id) : undefined;
    const bonusAchieved = !!goal?.achieved;
    const share = stores.length ? bestStores.length / stores.length : 0;
    const avg = bestStores.length
      ? round6(bestStores.reduce((t, d) => t + (d.afterRate - d.beforeRate), 0) / bestStores.length) : 0;
    bestStores.sort((a, b) => (b.afterRate - b.beforeRate) - (a.afterRate - a.beforeRate));
    out.push({
      cardId: oc.cardId, totalStores: stores.length, bestStores, bonusAchieved,
      net: annualNet(mi, oc.cardId, share, avg, monthlySpendYen, bonusAchieved),
    });
  }
  out.sort((a, b) => a.net.netYen - b.net.netYen || (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
  return out;
}

export interface HintCandidate { cardId: Id; beforeRate: number; afterRate: number; methodIds: Id[] }

/** ①：表示中のお店で最も率が上がる未保有カード。差が3ポイント未満なら null */
export function bestUnownedAt(mi: MasterIndex, user: UserSettings, storeId: Id, today: YMD): HintCandidate | null {
  if (!mi.stores.has(storeId)) return null;
  const base = neutral(user);
  const beforeRate = topAt(mi, base, storeId, today)?.rate ?? 0;
  let best: HintCandidate | null = null;
  // 同率なら年会費の安いカード → ランクの低いカード → カードID（分冊 12.2）
  const tier = { general: 0, gold: 1, platinum: 2 } as const;
  const key = (id: Id) => { const c = mi.cards.get(id)!; return [c.annualFee, tier[c.tier]] as const; };
  const order = unownedCards(mi, user).sort((a, b) => {
    const [fa, ta] = key(a), [fb, tb] = key(b);
    return fa - fb || ta - tb || (a < b ? -1 : a > b ? 1 : 0);
  });
  for (const cardId of order) {
    const top = topAt(mi, withCandidate(mi, base, cardId), storeId, today);
    if (!top || top.cardId !== cardId) continue;
    if (round6(top.rate - beforeRate) < HINT_MIN_DELTA) continue;
    if (!best || top.rate > best.afterRate + 1e-9) best = { cardId, beforeRate, afterRate: top.rate, methodIds: top.methodIds };
  }
  return best;
}
