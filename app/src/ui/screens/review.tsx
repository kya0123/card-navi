import { h } from '../h';
import type { Ctx } from '../app';
import { methodsForCard } from '../../domain/master';
import { reviewItems, type ReviewItem } from '../../domain/review';
import { BANNER_MIN_STORES } from '../../domain/promo';
import {
  MAX_MONTHLY_SPEND, MIN_MONTHLY_SPEND, monthlySpendOf, MONTHLY_SPEND_STEP, ownedFeeReview, type NetResult, type OwnedFeeResult,
} from '../../domain/simulate';
import { cardName, pct, yen } from '../format';

const SHOW_STORES = 3;

/** S07 カードを見直す（詳細設計書（カード提案機能）7.3） */
export function ReviewScreen(ctx: Ctx): Node {
  const { mi, state, today } = ctx;
  const recent = state.recent.filter((id) => mi.stores.has(id));
  const enough = recent.length >= BANNER_MIN_STORES;
  const spend = monthlySpendOf(state.settings);
  const items = enough ? reviewItems(mi, ctx.aff, state.settings, recent, today) : [];
  const owned = enough ? ownedFeeReview(mi, state.settings, recent, today, spend) : [];
  const gain = items.filter((it) => it.net.netYen >= 0);
  const loss = items.filter((it) => it.net.netYen < 0);
  const setSpend = (v: number) => {
    const n = Math.min(Math.max(Math.round(v / MONTHLY_SPEND_STEP) * MONTHLY_SPEND_STEP, MIN_MONTHLY_SPEND), MAX_MONTHLY_SPEND);
    void ctx.update((x) => { x.reviewMonthlySpendYen = n; });
  };

  return (
    <section>
      <header class="screen-head"><h1>カードを見直す</h1></header>
      <p class="sub">最近使ったお店と月の利用額をもとに、年会費の元が取れるか・1枚追加するといくら得かを計算します。</p>
      <div class="panel" id="fee-spend-panel">
        <label class="field" for="fee-spend">
          <span>月のカード利用額</span>
        </label>
        <div class="fee-spend">
          <button class="btn btn-small btn-ghost" id="fee-spend-down" aria-label="1万円減らす" disabled={spend <= MIN_MONTHLY_SPEND}
            onClick={() => setSpend(spend - MONTHLY_SPEND_STEP)}>−</button>
          <input id="fee-spend" type="number" inputmode="numeric" min={String(MIN_MONTHLY_SPEND)} max={String(MAX_MONTHLY_SPEND)}
            step={String(MONTHLY_SPEND_STEP)} value={String(spend)}
            onChange={(e: Event) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (!Number.isFinite(v)) { ctx.toast('金額を入力してください'); return; }
              setSpend(v);
            }} />
          <span>円</span>
          <button class="btn btn-small btn-ghost" id="fee-spend-up" aria-label="1万円増やす" disabled={spend >= MAX_MONTHLY_SPEND}
            onClick={() => setSpend(spend + MONTHLY_SPEND_STEP)}>＋</button>
        </div>
        <p class="note">よく行くお店に均等に使う前提の目安です（1万〜100万円、1万円単位）。</p>
      </div>
      {owned.length > 0 && (
        <div id="fee-owned">
          <h2 class="review-group-head">持っているカードの年会費</h2>
          {owned.map((o) => OwnedFee(ctx, o))}
        </div>
      )}
      {gain.length > 0 && <h2 class="review-group-head" id="fee-gain-head">追加すると得なカード</h2>}
      {!enough && (
        <div class="panel" id="review-empty">
          <p>お店を{BANNER_MIN_STORES}件以上調べると表示されます（いま{recent.length}件）。</p>
          <button class="btn btn-ghost" onClick={() => ctx.go('home')}>お店を調べる</button>
        </div>
      )}
      {enough && items.length === 0 && (
        <div class="panel" id="review-none">
          <p>今の組み合わせで十分です。最近のお店では、カードを追加しても還元はほとんど変わりません。</p>
        </div>
      )}
      {gain.map((it, i) => ReviewCard(ctx, it, i))}
      {loss.length > 0 && (
        <div id="fee-loss">
          <h2 class="review-group-head">この使い方では年会費を回収できません</h2>
          {loss.map((it) => ReviewCard(ctx, it, 1))}
        </div>
      )}
      <div class="review-notes note">
        <p>※最近使ったお店をもとにした目安です。キャンペーン・入会特典は含みません。</p>
        <p>※年会費は通常の金額で計算しています（初年度無料・条件付き無料は含みません）。最新の条件は必ず公式サイトで確認してください。</p>
        <p>※年間の損得は、入力した月の利用額をよく行くお店に均等に使った場合の目安です。ボーナスは2年目以降の額で、そのカードに移る利用額で判定しています。</p>
        <p>※並び順は計算結果の順で、広告の有無や報酬額とは関係ありません。</p>
        <button type="button" class="link-btn" id="to-adpolicy" onClick={() => ctx.go('adpolicy')}>広告の方針</button>
      </div>
    </section>
  );
}

function ReviewCard(ctx: Ctx, it: ReviewItem, index: number): Node {
  const { mi } = ctx;
  const card = mi.cards.get(it.cardId)!;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const row = (d: ReviewItem['improved'][number]) => (
    <li class="delta">
      <span class="delta-store">{mi.stores.get(d.storeId)?.name}</span>
      <span class="delta-rate">{pct(d.beforeRate)} → <strong>{pct(d.afterRate)}</strong></span>
    </li>
  );
  const rest = it.improved.slice(SHOW_STORES);
  return (
    <article class="panel review-card" id={`review-${it.cardId}`}>
      <div class="review-head">
        <div>
          <h2>{cardName(mi, it.cardId)}</h2>
          <p class="muted">年会費 {card.annualFee ? yen(card.annualFee) : '無料'}</p>
        </div>
        {it.link?.pr && <span class="pr">PR</span>}
      </div>
      <p class="review-lead">よく行くお店 {it.totalStores}件中<strong>{it.improved.length}件</strong>で還元アップ</p>
      <ul class="deltas">{it.improved.slice(0, SHOW_STORES).map(row)}</ul>
      {rest.length > 0 && (
        <details class="more-stores">
          <summary>ほか{rest.length}件</summary>
          <ul class="deltas">{rest.map(row)}</ul>
        </details>
      )}
      <ul class="facts">
        <li class="fee-net">{NetLine(it.net)}</li>
        <li>1万円ごとに <strong>＋{yen(it.per10kYen)}</strong>（上のお店の平均）</li>
        {it.breakEvenMonthlyYen != null
          ? <li>月<strong>{yen(it.breakEvenMonthlyYen)}</strong>以上の利用で年会費を回収</li>
          : <li>年会費無料：持つだけで損はありません</li>}
        {it.bonusNote && <li>{it.bonusNote}</li>}
      </ul>
      {it.link && (offline
        ? <span class="btn btn-disabled" aria-disabled="true">オフラインのため開けません</span>
        : <a class={`btn${index === 0 ? '' : ' btn-ghost'}`} href={it.link.url} target="_blank" rel="noopener noreferrer sponsored">公式サイトで詳しく見る</a>)}
      <button type="button" class="link-btn" onClick={() => {
        void ctx.update((s) => {
          if (s.ownedCards.some((c) => c.cardId === it.cardId)) return;
          s.ownedCards.push({ cardId: it.cardId, enabledMethods: methodsForCard(mi, it.cardId), priority: s.ownedCards.length + 1 });
        }, { render: false });
        ctx.toast(`${card.name}を保有カードに追加しました`);
      }}>このカードを持っている（保有カードに追加）</button>
    </article>
  );
}

const signed = (n: number) => `${n >= 0 ? '＋' : '−'}${yen(Math.abs(n))}`;

/** 「年間 ＋23,300円（還元＋28,800円／ボーナス＋0円／年会費−5,500円）」 */
function NetLine(n: NetResult): string {
  return `年間 ${signed(n.netYen)}（還元＋${yen(n.gainYen)}／ボーナス＋${yen(n.bonusYen)}／年会費−${yen(n.feeYen)}）`;
}

function OwnedFee(ctx: Ctx, o: OwnedFeeResult): Node {
  const { mi } = ctx;
  const card = mi.cards.get(o.cardId)!;
  const ok = o.net.netYen >= 0;
  return (
    <article class="panel review-card" id={`fee-owned-${o.cardId}`}>
      <div class="review-head">
        <div>
          <h2>{cardName(mi, o.cardId)}</h2>
          <p class="muted">年会費 {yen(card.annualFee)}</p>
        </div>
      </div>
      {o.bestStores.length === 0
        ? <p class="review-lead">よく行くお店では、ほかのカードと同じか低い率です。</p>
        : <p class="review-lead">よく行くお店 {o.totalStores}件中<strong>{o.bestStores.length}件</strong>で1位</p>}
      <ul class="facts">
        <li>年間の上乗せ 約{yen(o.net.gainYen)}＋ボーナス{yen(o.net.bonusYen)}{o.bonusAchieved ? '（今期達成済み）' : ''}</li>
      </ul>
      <p class={`fee-verdict ${ok ? 'fee-ok' : 'fee-ng'}`} data-ok={ok ? '1' : '0'}>
        {ok
          ? `年会費を回収できています（年${signed(o.net.netYen)}）`
          : `この使い方では年会費を回収できません（年${signed(o.net.netYen)}）${o.net.breakEvenMonthlyYen != null ? `。月${yen(o.net.breakEvenMonthlyYen)}以上で回収` : ''}`}
      </p>
    </article>
  );
}
