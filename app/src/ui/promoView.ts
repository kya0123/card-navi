import type { Ctx } from './app';
import { linkFor } from '../domain/affiliate';
import {
  BANNER_MIN_IMPROVED, BANNER_MIN_STORES, canShow, isShowingToday, markDismissed, markShown, markTapped, newSlot, warmedUp,
} from '../domain/promo';
import { bestUnownedAt, simulateAddCard, type HintCandidate, type SimResult } from '../domain/simulate';
import type { Id } from '../domain/types';

/** ①③の表示判定（詳細設計書（カード提案機能）4.3）。表示すると決めたときに表示記録を保存する */

const suggestionsOn = (ctx: Ctx) => ctx.state.settings.showCardSuggestions !== false;

export interface HintView extends HintCandidate { storeId: Id; pr: boolean }

export function decideHint(ctx: Ctx, storeId: Id): HintView | null {
  const { state, mi, today } = ctx;
  const p = state.promo;
  if (!suggestionsOn(ctx) || !warmedUp(p, today)) return null;
  const cand = bestUnownedAt(mi, state.settings, storeId, today);
  if (!cand) return null;
  const view = { ...cand, storeId, pr: !!linkFor(mi, ctx.aff, cand.cardId, today)?.pr };
  const sig = `${cand.cardId}|${cand.afterRate}`;
  const slot = p.hint[storeId] ?? newSlot();
  if (isShowingToday(slot, today) && slot.lastSignature === sig) return view;
  if (p.banner.lastShownAt === today) return null;                       // 同じ日に③を出していたら出さない
  if (p.hintLastShownAt === today && p.hintLastStoreId !== storeId) return null; // 1日1回まで
  if (!canShow(slot, sig, today)) return null;
  p.hint[storeId] = markShown(slot, sig, today);
  p.hintLastShownAt = today;
  p.hintLastStoreId = storeId;
  ctx.savePromo();
  return view;
}

export function tapHint(ctx: Ctx, h: HintView): void {
  const p = ctx.state.promo;
  p.hint[h.storeId] = markTapped(p.hint[h.storeId] ?? newSlot());
  ctx.savePromo();
  ctx.openReview(h.cardId);
}

export function dismissHint(ctx: Ctx, storeId: Id): void {
  const p = ctx.state.promo;
  p.hint[storeId] = markDismissed(p.hint[storeId] ?? newSlot(), ctx.today);
  ctx.savePromo();
  ctx.render();
}

export interface BannerView { results: SimResult[]; pr: boolean }

export function decideBanner(ctx: Ctx): BannerView | null {
  const { state, mi, today } = ctx;
  const p = state.promo;
  if (!suggestionsOn(ctx) || !warmedUp(p, today)) return null;
  if (state.query.trim() || state.selection) return null;
  if (state.recent.length < BANNER_MIN_STORES) return null;
  const results = simulateAddCard(mi, state.settings, state.recent, today);
  // 分冊10.5：年間の損得がプラスのカードがあるときだけ出す
  if (!results.length || results[0].improved.length < BANNER_MIN_IMPROVED || results[0].net.netYen <= 0) return null;
  const top = results.slice(0, 3);
  const view = { results, pr: top.some((r) => linkFor(mi, ctx.aff, r.cardId, today)?.pr) };
  const sig = top.map((r) => `${r.cardId}:${r.improved.length}`).join(',');
  if (isShowingToday(p.banner, today)) return view;
  if (p.hintLastShownAt === today) return null;                           // 同じ日に①を出していたら出さない
  if (!canShow(p.banner, sig, today)) return null;
  p.banner = markShown(p.banner, sig, today);
  ctx.savePromo();
  return view;
}

export function tapBanner(ctx: Ctx): void {
  ctx.state.promo.banner = markTapped(ctx.state.promo.banner);
  ctx.savePromo();
  ctx.openReview();
}

export function dismissBanner(ctx: Ctx): void {
  ctx.state.promo.banner = markDismissed(ctx.state.promo.banner, ctx.today);
  ctx.savePromo();
  ctx.render();
}
