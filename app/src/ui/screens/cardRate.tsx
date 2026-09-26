import { h } from '../h';
import type { Ctx } from '../app';
import { pct, pointName, yen } from '../format';
import { routeRows } from './info';

/** S11 カードのポイント率（詳細設計 31.2.8）。カードタブ・おすすめの「詳しい条件」から開く */
export function CardRateScreen(ctx: Ctx): Node {
  const { mi, state } = ctx;
  const card = state.rateCardId ? mi.cards.get(state.rateCardId) : undefined;
  const back = () => ctx.go(state.rateBack);
  if (!card) {
    return (
      <section>
        <header class="screen-head"><button type="button" class="back" onClick={back}>‹ 戻る</button></header>
        <p class="empty">カードが見つかりません。</p>
      </section>
    );
  }
  const RouteRow = routeRows(ctx);
  const bonus = mi.bonusByCard.get(card.id);
  const owned = state.settings.ownedCards.some((c) => c.cardId === card.id);
  return (
    <section>
      <header class="screen-head">
        <button type="button" class="back" id="rate-back" onClick={back}>‹ 戻る</button>
        <h1>{card.name}</h1>
      </header>
      <p class="sub">
        年会費 {card.annualFee ? yen(card.annualFee) : '無料'}{card.annualFeeNote ? `（${card.annualFeeNote}）` : ''}・{pointName(mi, card.pointId)}
        {owned ? '・持っているカード' : ''}
      </p>
      <div class="panel" id="rate-routes">
        <h2>支払い方法ごとのポイント率</h2>
        <ul class="info-list">{mi.raw.routes.filter((r) => r.cardId === card.id).map(RouteRow)}</ul>
      </div>
      {bonus && (
        <div class="panel" id="rate-bonus">
          <h2>年間ボーナス</h2>
          <p>{bonus.description}</p>
          <p class="note">おすすめでは、狙っている間は＋{pct(bonus.valueYen / bonus.thresholdYen)}として計算します（年会費は考えません）。{bonus.periodNote}</p>
          {bonus.oneTimeValueYen ? <p class="note">{bonus.oneTimeNote ?? '初回特典'}は、カード診断の年会費の計算に含めます。</p> : null}
        </div>
      )}
      <p class="note">版 {mi.raw.masterVersion}・確認日 {mi.raw.checkedAt}。キャンペーンと月間上限は含みません。</p>
    </section>
  );
}
