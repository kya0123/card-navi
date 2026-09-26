import { h } from '../h';
import { foldProps } from '../fold';
import type { Ctx } from '../app';
import { methodsForCard } from '../../domain/master';
import { reviewItems, type ReviewItem } from '../../domain/review';
import { BANNER_MIN_STORES } from '../../domain/promo';
import {
  MAX_MONTHLY_SPEND, MIN_MONTHLY_SPEND, monthlySpendOf, MONTHLY_SPEND_STEP, ownedFeeReview, type NetResult, type OwnedFeeResult,
} from '../../domain/simulate';
import { cardName, pct, yen } from '../format';
import { goalStatus, type GoalState } from '../../domain/bonus';
import { isValidYMD } from '../../domain/date';
import type { Bonus, BonusGoal, Id } from '../../domain/types';

const SHOW_STORES = 3;
/** 利用額の入力欄を開いているか（A案：普段は1行だけ出す） */
let spendOpen = false;
/** 表示中の切り替え。null は既定（詳細設計 31.2.1） */
let diagView: 'owned' | 'suggest' | null = null;
/** ①ヒント・③バナーから開くときは［おすすめカード］を表示する */
export function showSuggestView(): void { diagView = 'suggest'; }

const STATE_LABEL: Record<GoalState, string> = {
  active: '狙っている', achieved: '今期は達成済み', expired: '期限切れ', unset: '入会年月が未設定',
};
const intOrUndef = (v: string) => {
  const n = Number(v.replace(/[,，]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : Math.floor(n);
};

/** S07 カード診断（詳細設計 31.2.1・分冊10〜11章）：［持っているカード｜おすすめカード］ */
export function ReviewScreen(ctx: Ctx): Node {
  const { mi, state, today } = ctx;
  const recent = state.recent.filter((id) => mi.stores.has(id));
  const enough = recent.length >= BANNER_MIN_STORES;
  const spend = monthlySpendOf(state.settings);
  const items = enough ? reviewItems(mi, ctx.aff, state.settings, recent, today) : [];
  const ownedFee = enough ? ownedFeeReview(mi, state.settings, recent, today, spend) : [];
  // 持っているカードのうち、年会費か年間ボーナスがあるもの（優先順）
  const ownedCards = [...state.settings.ownedCards].sort((a, b) => a.priority - b.priority)
    .filter((c) => (mi.cards.get(c.cardId)?.annualFee ?? 0) > 0 || mi.bonusByCard.has(c.cardId));
  const view = diagView ?? (ownedCards.length > 0 ? 'owned' : 'suggest');
  const gain = items.filter((it) => it.net.netYen >= 0);
  const loss = items.filter((it) => it.net.netYen < 0);
  const setSpend = (v: number) => {
    const n = Math.min(Math.max(Math.round(v / MONTHLY_SPEND_STEP) * MONTHLY_SPEND_STEP, MIN_MONTHLY_SPEND), MAX_MONTHLY_SPEND);
    void ctx.update((x) => { x.reviewMonthlySpendYen = n; });
  };
  const showSpend = view === 'owned' ? ownedCards.length > 0 : items.length > 0;
  const seg = (id: 'owned' | 'suggest', label: string) => (
    <button type="button" role="tab" id={`diag-${id}`} class={`seg${view === id ? ' active' : ''}`} aria-selected={view === id ? 'true' : 'false'}
      onClick={() => { diagView = id; ctx.render(); }}>{label}</button>
  );

  return (
    <section>
      <header class="screen-head"><h1>カード診断</h1></header>
      <div class="segs" role="tablist" aria-label="診断するカード">
        {seg('owned', '持っているカード')}
        {seg('suggest', 'おすすめカード')}
      </div>
      {/* 利用額は共通の1つの値。普段は1行（A案） */}
      {showSpend && !spendOpen && (
        <p class="spend-line" id="fee-spend-line">
          月{yen(spend)}のカード利用で計算しています
          <button type="button" class="link-btn" id="fee-spend-edit" onClick={() => { spendOpen = true; ctx.render(); }}>変更</button>
        </p>
      )}
      {showSpend && spendOpen && <div class="panel" id="fee-spend-panel">
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
        <button type="button" class="link-btn" id="fee-spend-close" onClick={() => { spendOpen = false; ctx.render(); }}>閉じる</button>
      </div>}
      {view === 'owned' ? (
        <div id="diag-owned-view">
          {ownedCards.length === 0 && (
            <div class="panel" id="diag-owned-empty">
              <p>年会費や年間ボーナスのあるカードを持っていません。［おすすめカード］で追加すると得なカードを確認できます。</p>
            </div>
          )}
          {ownedCards.map((oc) => OwnedCardPanel(ctx, oc.cardId, ownedFee.find((o) => o.cardId === oc.cardId), enough, recent.length, spend))}
        </div>
      ) : (
        <div id="diag-suggest-view">
          {gain.length > 0 && <h2 class="review-group-head" id="fee-gain-head">追加すると得なカード</h2>}
          {!enough && (
            <div class="panel" id="review-empty">
              <p>お店を{BANNER_MIN_STORES}件以上調べると表示されます（いま{recent.length}件）。</p>
              <button class="btn btn-ghost" onClick={() => ctx.go('home')}>お店を調べる</button>
            </div>
          )}
          {enough && items.length === 0 && (
            <div class="panel" id="review-none">
              <p>今の組み合わせで十分です。最近のお店では、カードを追加してもポイント率はほとんど変わりません。</p>
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
        </div>
      )}
    </section>
  );
}

/** ［持っているカード］の1枚：年会費の回収判定＋ボーナスの進み具合。内訳・入力は折りたたみ */
function OwnedCardPanel(
  ctx: Ctx, cardId: Id, fee: OwnedFeeResult | undefined, enough: boolean, storeCount: number, spend: number,
): Node {
  const { mi, state } = ctx;
  const card = mi.cards.get(cardId)!;
  const bonus = mi.bonusByCard.get(cardId);
  return (
    <article class="panel review-card" id={`fee-owned-${cardId}`}>
      <div class="review-head">
        <div>
          <h2>{cardName(mi, cardId)}</h2>
          <p class="muted">年会費 {card.annualFee ? yen(card.annualFee) : '無料'}</p>
        </div>
      </div>
      {card.annualFee > 0 && (fee ? FeeVerdict(fee) : (
        <p class="note">お店を{BANNER_MIN_STORES}件以上調べると、年会費を回収できているか判定します（いま{storeCount}件）。</p>
      ))}
      {bonus && BonusBlock(ctx, bonus, state.settings.bonusGoals.find((g) => g.bonusId === bonus.id) ?? { bonusId: bonus.id, target: false }, spend)}
      {fee && (
        <details class="fold" id={`fee-detail-${cardId}`} {...foldProps(`fee-detail-${cardId}`)}>
          <summary>内訳</summary>
          {fee.bestStores.length === 0
            ? <p class="review-lead">よく行くお店では、ほかのカードと同じか低い率です。</p>
            : <p class="review-lead">よく行くお店 {fee.totalStores}件中<strong>{fee.bestStores.length}件</strong>で1位</p>}
          <ul class="facts">
            <li>年間の上乗せ 約{yen(fee.net.gainYen)}＋ボーナス{yen(fee.net.bonusYen)}{fee.bonusAchieved ? '（今期達成済み）' : ''}</li>
            <li>年会費 {yen(fee.net.feeYen)}</li>
          </ul>
        </details>
      )}
    </article>
  );
}

function FeeVerdict(o: OwnedFeeResult): Node {
  const ok = o.net.netYen >= 0;
  return (
    <p class={`fee-verdict ${ok ? 'fee-ok' : 'fee-ng'}`} data-ok={ok ? '1' : '0'}>
      {ok
        ? `年会費を回収できています（年${signed(o.net.netYen)}）`
        : `この使い方では年会費を回収できません（年${signed(o.net.netYen)}）${o.net.breakEvenMonthlyYen != null ? `。月${yen(o.net.breakEvenMonthlyYen)}以上で回収` : ''}`}
    </p>
  );
}

/** 年間ボーナスの進み具合（旧ボーナスタブ）。入力欄は折りたたむ */
function BonusBlock(ctx: Ctx, b: Bonus, g: BonusGoal, spend: number): Node {
  const { state } = ctx;
  const card = state.settings.ownedCards.find((c) => c.cardId === b.cardId);
  const st = goalStatus(b, g, card, ctx.today);
  const edit = (f: (x: BonusGoal) => void) => ctx.update((s) => {
    const x = s.bonusGoals.find((y) => y.bonusId === b.id);
    if (x) { f(x); x.updatedAt = ctx.today; }
  });
  const label = g.target ? STATE_LABEL[st.state] : '狙っていない';
  return (
    <div class="bonus-block" id={`bonus-${b.id}`}>
      <div class="bonus-head">
        <strong>年間ボーナス</strong>
        <span class={`badge badge-${g.target ? st.state : 'off'}`}>{label}</span>
      </div>
      <p class="note">{b.description}</p>
      <div class="progress" aria-label={`進捗 ${Math.round(st.progressRatio * 100)}%`}>
        <div class="progress-bar" style={{ width: `${st.progressRatio * 100}%` }} />
      </div>
      <dl class="stats">
        <div><dt>累計</dt><dd>{yen(st.progressYen)} / {yen(st.thresholdYen)}</dd></div>
        <div><dt>残り</dt><dd>{yen(st.remainingYen)}</dd></div>
        <div><dt>期限</dt><dd>{st.deadline ?? '—'}{st.deadline && st.state !== 'expired' ? `（あと${st.monthsLeft}か月）` : ''}</dd></div>
        <div><dt>必要な月額</dt><dd>{st.state === 'active' ? yen(st.requiredMonthlyYen) : '—'}</dd></div>
      </dl>
      {st.state === 'active' && (st.requiredMonthlyYen > spend
        ? <p class="bonus-reach bonus-reach-ng" id={`reach-${b.id}`}>月{yen(spend)}の利用では期限までに届きません</p>
        : <p class="bonus-reach bonus-reach-ok" id={`reach-${b.id}`}>月{yen(spend)}の利用なら期限までに届く見込みです</p>)}
      {st.state === 'unset' && <p class="note">［カード］タブで入会年月を入れると期限を計算します。</p>}
      <details class="fold" id={`bonus-input-${b.id}`} {...foldProps(`bonus-input-${b.id}`, !!g.deadlineOverride)}>
        <summary>ボーナスの入力</summary>
        {st.start && <p class="note">今期：{st.start}〜{st.deadline}（{b.periodNote ?? ''}）</p>}
        <label class="field">
          <span>今期の累計利用額（概算・円）</span>
          <input id={`progress-${b.id}`} type="number" inputmode="numeric" min="0" step="1000" value={g.progressYen ?? ''}
            placeholder="例：300000"
            onChange={(e: Event) => void edit((x) => {
              const v = intOrUndef((e.target as HTMLInputElement).value);
              if (v === undefined) delete x.progressYen; else x.progressYen = v;
            })} />
        </label>
        <label class="field">
          <span>達成条件額（円）</span>
          <input id={`threshold-${b.id}`} type="number" inputmode="numeric" min="1" step="10000" value={g.thresholdYen ?? b.thresholdYen}
            onChange={(e: Event) => void edit((x) => {
              const v = intOrUndef((e.target as HTMLInputElement).value);
              if (!v || v === b.thresholdYen) delete x.thresholdYen; else x.thresholdYen = v;
            })} />
        </label>
        {b.oneTimeValueYen ? (
          <label class="check">
            <input id={`onetime-${b.id}`} type="checkbox" checked={!!g.oneTimeAchieved}
              onChange={(e: Event) => void edit((x) => { x.oneTimeAchieved = (e.target as HTMLInputElement).checked; })} />
            <span>{b.oneTimeNote ?? '初回特典'}は達成済み</span>
          </label>
        ) : null}
        <label class="field">
          <span>期限を手動で変更する（空欄で自動計算）</span>
          <input id={`deadline-${b.id}`} type="date" value={g.deadlineOverride ?? ''}
            onChange={(e: Event) => void edit((x) => {
              const v = (e.target as HTMLInputElement).value;
              if (v && isValidYMD(v)) x.deadlineOverride = v; else delete x.deadlineOverride;
            })} />
          <small>手動の期限は自動で次の期間に切り替わりません。</small>
        </label>
        {g.prevPeriod && (
          <p class="note">前期（〜{g.prevPeriod.deadline}）：{yen(g.prevPeriod.progressYen)}{g.prevPeriod.achieved ? '・達成' : ''}</p>
        )}
        <p class="note">{b.excludedNote}</p>
      </details>
    </div>
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
      {/* 年間の損得を1行で大きく。内訳とお店は折りたたむ（詳細設計 31.2.1） */}
      <p class={`net-headline ${it.net.netYen >= 0 ? 'net-plus' : 'net-minus'}`}>年間 {signed(it.net.netYen)}</p>
      <p class="review-lead">よく行くお店 {it.totalStores}件中<strong>{it.improved.length}件</strong>でポイント率アップ</p>
      <details class="fold" id={`review-detail-${it.cardId}`} {...foldProps(`review-detail-${it.cardId}`)}>
        <summary>内訳とお店</summary>
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
      </details>
      {it.link && (offline
        ? <span class="btn btn-disabled" aria-disabled="true">オフラインのため開けません</span>
        : <a class={`btn${index === 0 ? '' : ' btn-ghost'}`} href={it.link.url} target="_blank" rel="noopener noreferrer sponsored">公式サイトで詳しく見る</a>)}
      <button type="button" class="link-btn" onClick={() => {
        void ctx.update((s) => {
          if (s.ownedCards.some((c) => c.cardId === it.cardId)) return;
          s.ownedCards.push({ cardId: it.cardId, enabledMethods: methodsForCard(mi, it.cardId), priority: s.ownedCards.length + 1 });
        }, { render: false });
        ctx.toast(`${card.name}を持っているカードに追加しました`);
      }}>このカードを持っている（持っているカードに追加）</button>
    </article>
  );
}

const signed = (n: number) => `${n >= 0 ? '＋' : '−'}${yen(Math.abs(n))}`;

/** 「年間 ＋23,300円（ポイント＋28,800円／ボーナス＋0円／年会費−5,500円）」 */
function NetLine(n: NetResult): string {
  return `年間 ${signed(n.netYen)}（ポイント＋${yen(n.gainYen)}／ボーナス＋${yen(n.bonusYen)}／年会費−${yen(n.feeYen)}）`;
}
