import { h, mount } from '../h';
import { foldProps } from '../fold';
import type { Ctx } from '../app';
import { recommend, type RecommendScope } from '../../domain/engine';
import { linkFor } from '../../domain/affiliate';
import { masterCards } from '../../domain/catalog';
import { searchStores } from '../../domain/search';
import type { RecommendItem, RecommendResult } from '../../domain/types';
import { cardName, methodShort, pct, pointName, yen } from '../format';
import { decideBanner, decideHint, dismissBanner, dismissHint, tapBanner, tapHint, type HintView } from '../promoView';
import { nearbyOn } from '../../domain/nearby';
import { openNearby } from './nearby';

let debounce: ReturnType<typeof setTimeout> | undefined;

export function HomeScreen(ctx: Ctx): Node {
  const { state, mi } = ctx;
  const sugBox = <div class="suggest" id="suggest" /> as HTMLElement;
  mount(sugBox, Suggestions(ctx));

  const onInput = (e: Event) => {
    state.query = (e.target as HTMLInputElement).value;
    clearTimeout(debounce);
    // 待っている間に再描画されても、画面上の最新の候補欄に描画する
    debounce = setTimeout(() => {
      const box = document.getElementById('suggest');
      if (box) mount(box, Suggestions(ctx));
    }, 150);
  };

  // 保有カードが0枚なら登録カード全体。選んだ後は切り替えられる（既定は持っているカード）
  const noCards = state.settings.ownedCards.length === 0;
  const scope: RecommendScope = noCards ? 'all' : state.recScope;
  const ownedIds = new Set(state.settings.ownedCards.map((c) => c.cardId));
  const total = masterCards(mi).length;
  let result: RecommendResult | null = null;
  let error = '';
  if (state.selection) {
    const amount = state.amount.trim() === '' ? undefined : Number(state.amount);
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 1 || amount > 9_999_999)) {
      error = '金額は1〜9,999,999円の整数で入力してください';
    }
    try {
      result = recommend(mi, state.settings, { ...state.selection, amountYen: error ? undefined : amount, scope }, ctx.today);
    } catch {
      state.selection = null;
    }
  }
  const title = state.selection?.storeId
    ? mi.stores.get(state.selection.storeId)?.name
    : state.selection?.categoryId ? `${mi.categories.get(state.selection.categoryId)?.name}（店舗未登録）` : '';

  return (
    <section>
      <header class="screen-head">
        <h1 class="app-title">どのカードで払う？</h1>
      </header>
      {state.settings.ownedCards.length === 0 && (
        <div class="onboard" id="onboard" role="note">
          <strong>まず持っているカードを選んでください</strong>
          <span>今は登録カード（{total}枚）全体でおすすめしています。選ぶと、持っているカードの中から表示します。</span>
          <button class="btn" onClick={() => ctx.go('cards')}>カードを選ぶ</button>
        </div>
      )}
      <div class="search">
        <input id="q" class="search-input" type="search" inputmode="search" autocomplete="off"
          placeholder="店舗名を入力（例：せぶん、スタバ）" aria-label="店舗名" value={state.query} onInput={onInput}
          onKeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              const first = searchStores(ctx.search, state.query, state.recent, 1)[0];
              if (first) { (e.target as HTMLInputElement).blur(); void ctx.selectStore(first.id); }
            }
          }} />
        {nearbyOn(state.settings) && (
          <button type="button" class="btn btn-ghost nearby-btn" id="nearby-btn" aria-label="近くのお店から選ぶ"
            onClick={() => openNearby(ctx)}>📍 近く</button>
        )}
      </div>
      {sugBox}
      {state.selection && result && (
        <div class="result" id="result">
          <div class="result-head">
            <h2 class="result-title">{title}</h2>
            <button class="btn btn-ghost btn-small" onClick={() => ctx.setState({ selection: null, amount: '' })}>クリア</button>
          </div>
          {!noCards && (
            <div class="segs scope-segs" role="tablist" aria-label="比べるカード">
              {ScopeTab(ctx, 'owned', '手持ちで比べる')}
              {ScopeTab(ctx, 'all', `全${total}枚で比べる`)}
            </div>
          )}
          {result.top.length === 0 ? (
            <div class="empty">
              <p>このお店で使える支払い方法が登録されていません。</p>
              <button class="btn" onClick={() => ctx.go('cards')}>持っているカードを設定する</button>
            </div>
          ) : (
            <ol class="ranking">
              {result.top.map((item, i) => RankItem(ctx, item, i, scope === 'all' ? ownedIds : null, sourceLabel(ctx, result!, item)))}
            </ol>
          )}
          {scope === 'all' && (
            <p class="note scope-note" id="scope-note">アプリに登録している主なカード{total}枚の中での比較です。日本のすべてのカードではありません。</p>
          )}
          {(() => {
            // 登録カード表示では、未保有カードの提案ヒント（①）は出さない
            const storeId = scope === 'owned' ? state.selection?.storeId : undefined;
            const hint = storeId ? decideHint(ctx, storeId) : null;
            return hint && Hint(ctx, hint);
          })()}
          {result.pointPay && (
            <div class="pointpay" role="note">
              <strong>ポイント払いがおすすめ</strong>
              <span>{result.pointPay.map((p) => pointName(mi, p)).join('／')}</span>
              <small>1位の支払いが通常のポイント率のため、手持ちのポイントを使っても損が小さい場面です</small>
            </div>
          )}
          <details class="amount" open={state.amount !== ''}>
            <summary>金額を入れて獲得ポイントを計算</summary>
            <label class="field">
              <span>支払金額（円）</span>
              <input id="amount" type="number" inputmode="numeric" min="1" max="9999999" step="1"
                value={state.amount} placeholder="例：850"
                onChange={(e: Event) => ctx.setState({ amount: (e.target as HTMLInputElement).value })} />
            </label>
            {error && <p class="error">{error}</p>}
          </details>
          {result.warnings.length > 0 && (
            <ul class="warnings">
              {result.warnings.map((w) => <li>⚠ {w}</li>)}
            </ul>
          )}
        </div>
      )}
      <footer class="disclaimer">
        <p>ポイント率の確認日 {mi.raw.checkedAt}（版 {mi.raw.masterVersion}）</p>
        <p>{mi.raw.disclaimer} 月間の付与上限は考慮していません。</p>
      </footer>
    </section>
  );
}

/** 1位の理由の1行要約：「セブン-イレブンの特約」「コンビニの特約」「通常のポイント率」 */
function sourceLabel(ctx: Ctx, result: RecommendResult, item: RecommendItem): string {
  if (item.rateSource === 'base') return '通常のポイント率';
  const name = item.rateSource === 'store' && result.storeId
    ? ctx.mi.stores.get(result.storeId)?.name : ctx.mi.categories.get(result.categoryId)?.name;
  return `${name}の特約`;
}

function ScopeTab(ctx: Ctx, id: RecommendScope, label: string): Node {
  const on = ctx.state.recScope === id;
  return (
    <button type="button" role="tab" id={`scope-${id}`} class={`seg${on ? ' active' : ''}`} aria-selected={on ? 'true' : 'false'}
      onClick={() => ctx.setState({ recScope: id })}>{label}</button>
  );
}

/** ownedIds を渡すと（登録カード表示）、保有・未保有の印と未保有カードのリンクを出す */
function RankItem(ctx: Ctx, item: RecommendItem, i: number, ownedIds: Set<string> | null, source: string): Node {
  const { mi } = ctx;
  const name = cardName(mi, item.cardId, item.routeIds[0]);
  const methods = item.cardId ? item.methodIds.map(methodShort).join('／') : '';
  const owned = !item.cardId || !ownedIds || ownedIds.has(item.cardId);
  const link = ownedIds && item.cardId && !owned ? linkFor(mi, ctx.aff, item.cardId, ctx.today) : null;
  return (
    <li class={`rank rank-${i + 1}`}>
      <div class="rank-no" aria-label={`${i + 1}位`}>{i + 1}</div>
      <div class="rank-body">
        <div class="rank-card">
          {name}
          {ownedIds && item.cardId && (owned
            ? <span class="own-mark own-yes">持っている</span>
            : <span class="own-mark own-no">持っていない</span>)}
        </div>
        {item.sameRateCardIds && item.sameRateCardIds.length > 0 && (
          <div class="rank-same">{item.sameRateCardIds.map((id) => cardName(mi, id)).join('・')}も同じポイント率</div>
        )}
        {methods && <div class="rank-method">{methods}</div>}
        <div class="rank-rate">
          <span class="rate">{pct(item.effectiveRate)}</span>
        </div>
        {/* 1行の要約：「7% ＋ボーナス1% セブン-イレブンの特約」（詳細設計 31.2.5） */}
        {(i === 0 || item.bonusRate > 0) && (
          <div class="rank-why">
            {item.bonusRate > 0 && <span class="rate-base">{pct(item.rate)}</span>}
            {item.bonusRate > 0 && <span class="bonus-badge">＋ボーナス{pct(item.bonusRate)}</span>}
            {i === 0 && <span class="why-src">{source}</span>}
          </div>
        )}
        {item.earnedYen != null && (
          <div class="rank-earned">{item.earnedApprox ? '約' : ''}{yen(item.earnedYen)}相当</div>
        )}
        {i === 0 && (item.reasons.length > 0 || item.others.length > 0) && (
          <details class="rank-detail" id="rank-detail" {...foldProps(`rank-detail-${source}-${item.cardId ?? item.routeIds[0]}`)}>
            <summary>詳しい条件</summary>
            <ul class="reasons">
              {item.reasons.map((r) => <li>{r}</li>)}
              {item.others.map((o) => <li>{o.methodIds.map(methodShort).join('・')}は{pct(o.effectiveRate)}</li>)}
            </ul>
            {item.cardId && (
              <button type="button" class="link-btn" id="rank-rate-link" onClick={() => ctx.openCardRate(item.cardId!)}>このカードのポイント率を見る ›</button>
            )}
          </details>
        )}
        {link && (
          <div class="rank-link">
            {link.pr && <span class="pr">PR</span>}
            <a class="card-link" href={link.url} target="_blank" rel={`noopener noreferrer${link.pr ? ' sponsored' : ''}`}>公式サイトを見る</a>
          </div>
        )}
      </div>
    </li>
  );
}

/** ① 推奨直後のヒント */
function Hint(ctx: Ctx, hint: HintView): Node {
  const { mi } = ctx;
  return (
    <aside class="hint" id="hint" aria-label="持っていないカードの提案">
      <div class="hint-body">
        <p class="hint-lead">持っていないカードなら</p>
        <p class="hint-main"><span class="hint-card">{cardName(mi, hint.cardId)}</span>で <strong class="hint-rate">{pct(hint.afterRate)}</strong></p>
        <p class="hint-sub">{hint.methodIds.map(methodShort).join('／')}（今は{pct(hint.beforeRate)}）</p>
        <div class="hint-actions">
          {hint.pr && <span class="pr">PR</span>}
          <button type="button" class="link-btn" id="hint-more" onClick={() => tapHint(ctx, hint)}>詳しく見る ›</button>
        </div>
      </div>
      <button type="button" class="icon-btn hint-close" id="hint-close" aria-label="このお店では表示しない"
        onClick={() => dismissHint(ctx, hint.storeId)}>×</button>
    </aside>
  );
}

/** ③ ホームのバナー */
function Banner(ctx: Ctx): Node | null {
  const b = decideBanner(ctx);
  if (!b) return null;
  return (
    <div class="promo-banner" id="promo-banner">
      <button type="button" class="promo-main" onClick={() => tapBanner(ctx)}>
        <span class="promo-text">
          <strong>あなたの使い方に合うカードが見つかりました</strong>
          <small>よく行くお店でポイント率が上がるカード {b.results.length}件{b.pr ? '（PRを含みます）' : ''}</small>
        </span>
        <span class="promo-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" class="promo-close" id="promo-close" aria-label="バナーを閉じる" onClick={() => dismissBanner(ctx)}>閉じる</button>
    </div>
  );
}

function Suggestions(ctx: Ctx): Node {
  const { state } = ctx;
  const q = state.query.trim();
  const list = searchStores(ctx.search, q, state.recent, 8);
  if (!q) {
    return (
      <div>
        {list.length > 0 && <p class="sub">最近使ったお店</p>}
        <div class="chips">
          {list.map((s) => <button class="chip" onClick={() => ctx.selectStore(s.id)}>{s.name}</button>)}
          <button class="chip chip-ghost" onClick={() => ctx.go('category')}>カテゴリで探す</button>
        </div>
        {Banner(ctx)}
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div class="nohit">
        <p>「{q}」は見つかりませんでした</p>
        <button class="btn" onClick={() => ctx.go('category')}>カテゴリで探す</button>
      </div>
    );
  }
  return (
    <ul class="suggest-list" role="listbox" aria-label="候補">
      {list.map((s) => (
        <li>
          <button class="suggest-item" role="option" onClick={() => ctx.selectStore(s.id)}>
            <span>{s.name}</span>
            <small>{ctx.mi.categories.get(s.categoryId)?.name}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
