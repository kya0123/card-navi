import { h, mount } from '../h';
import type { Ctx } from '../app';
import { methodsForCard } from '../../domain/master';
import { isValidYM } from '../../domain/date';
import { addOwnedCard, cardCatalog, removeOwnedCard, segmentCounts, type SegmentFilter } from '../../domain/catalog';
import { methodShort, pct } from '../format';

/** S03 カード（詳細設計 20.5）：保有カード／カード一覧から選ぶ を切り替える */

let view: 'owned' | 'catalog' | null = null;
let filter: SegmentFilter = 'all';
let query = '';
const FILTERS: { id: SegmentFilter; label: string }[] = [
  { id: 'all', label: 'すべて' }, { id: 'popular', label: '定番' }, { id: 'enthusiast', label: 'ポイ活向け' }, { id: 'owned', label: '保有中' },
];

export function CardsScreen(ctx: Ctx): Node {
  const { state } = ctx;
  const n = state.settings.ownedCards.length;
  if (view === null) view = n === 0 ? 'catalog' : 'owned';
  const tab = (id: 'owned' | 'catalog', label: string) => (
    <button type="button" role="tab" id={`view-${id}`} class={`seg${view === id ? ' active' : ''}`} aria-selected={view === id ? 'true' : 'false'}
      onClick={() => { view = id; ctx.render(); window.scrollTo(0, 0); }}>{label}</button>
  );
  return (
    <section>
      <header class="screen-head"><h1>カード</h1></header>
      <div class="segs" role="tablist" aria-label="表示の切り替え">
        {tab('owned', `保有カード（${n}）`)}
        {tab('catalog', 'カード一覧から選ぶ')}
      </div>
      {view === 'owned' ? OwnedView(ctx) : CatalogView(ctx)}
    </section>
  );
}

function CatalogView(ctx: Ctx): Node {
  const { mi, state } = ctx;
  const counts = segmentCounts(mi, state.settings);
  const list = <div id="catalog-list" /> as HTMLElement;
  mount(list, CatalogList(ctx));
  return (
    <div>
      <p class="sub">持っているカードにチェックを入れてください。おすすめは、チェックしたカードの中からだけ選びます。</p>
      <div class="chips filter-chips" role="group" aria-label="絞り込み">
        {FILTERS.map((f) => (
          <button type="button" id={`filter-${f.id}`} class={`chip${filter === f.id ? ' chip-on' : ''}`} aria-pressed={filter === f.id ? 'true' : 'false'}
            onClick={() => { filter = f.id; ctx.render(); }}>{f.label} {counts[f.id]}</button>
        ))}
      </div>
      {/* 日本語変換が途切れないよう、入力のたびに一覧部分だけを差し替える */}
      <input id="card-q" class="search-input catalog-search" type="search" autocomplete="off" aria-label="カード名で検索"
        placeholder="カード名・発行会社で検索（例：りくるーと）" value={query}
        onInput={(e: Event) => {
          query = (e.target as HTMLInputElement).value;
          const box = document.getElementById('catalog-list');
          if (box) mount(box, CatalogList(ctx));
        }} />
      {list}
    </div>
  );
}

function CatalogList(ctx: Ctx): Node {
  const { mi, state } = ctx;
  const items = cardCatalog(mi, state.settings, filter, query);
  return (
    <div>
      {items.length === 0 && <p class="empty">該当するカードがありません。</p>}
      <ul class="catalog">
        {items.map(({ card, owned, baseRate, maxRate, hasBonus }, i) => [
          (i === 0 || items[i - 1].card.company !== card.company) && <li class="catalog-company" role="presentation">{card.company}</li>,
          <li class={`catalog-item${owned ? ' is-owned' : ''}`}>
            <label class="catalog-label">
              <input id={`own-${card.id}`} type="checkbox" checked={owned} onChange={(e: Event) => {
                const el = e.target as HTMLInputElement;
                if (el.checked) { void ctx.update((s) => { Object.assign(s, addOwnedCard(mi, s, card.id)); }); return; }
                const joined = ctx.state.settings.ownedCards.find((c) => c.cardId === card.id)?.joinYm;
                if (joined && !window.confirm(`${card.name}を保有カードから外しますか？（入会年月も消えます）`)) { el.checked = true; return; }
                void ctx.update((s) => { Object.assign(s, removeOwnedCard(s, card.id)); });
              }} />
              <span class="catalog-body">
                <span class="catalog-title">
                  <strong>{card.name}</strong>
                  {card.segments.includes('popular') && <span class="tag tag-popular">定番</span>}
                  {card.segments.includes('enthusiast') && <span class="tag tag-enthusiast">ポイ活向け</span>}
                </span>
                <span class="catalog-meta">
                  {card.brand}・年会費{card.annualFee === 0 ? '無料' : `${card.annualFee.toLocaleString('ja-JP')}円`}・基本{pct(baseRate)}
                  {maxRate > baseRate ? `・最大${pct(maxRate)}` : ''}{hasBonus ? '・年間ボーナスあり' : ''}
                </span>
                <span class="catalog-note">{card.highlight}</span>
              </span>
            </label>
          </li>,
        ])}
      </ul>
    </div>
  );
}

function OwnedView(ctx: Ctx): Node {
  const { mi, state } = ctx;
  const owned = [...state.settings.ownedCards].sort((a, b) => a.priority - b.priority);
  const nonCard = mi.raw.routes.filter((r) => r.cardId === null);
  const renumber = (list: typeof owned) => list.forEach((c, i) => { c.priority = i + 1; });
  return (
    <div>
      {owned.length === 0 ? (
        <div class="empty">
          <p>保有カードがまだありません。「カード一覧から選ぶ」で持っているカードを選んでください。</p>
          <button class="btn" onClick={() => { view = 'catalog'; ctx.render(); }}>カード一覧から選ぶ</button>
        </div>
      ) : <p class="sub">使う支払い方法だけチェックしてください。同じ還元率のときは上のカードを優先します。</p>}
      {owned.map((oc, idx) => {
        const card = mi.cards.get(oc.cardId)!;
        const methods = methodsForCard(mi, oc.cardId);
        return (
          <div class="panel">
            <div class="panel-head">
              <h2>{card.name}</h2>
              <div class="order">
                <button class="icon-btn" aria-label="上へ" disabled={idx === 0} onClick={() => ctx.update((s) => {
                  const list = [...s.ownedCards].sort((a, b) => a.priority - b.priority);
                  [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
                  renumber(list); s.ownedCards = list;
                })}>↑</button>
                <button class="icon-btn" aria-label="下へ" disabled={idx === owned.length - 1} onClick={() => ctx.update((s) => {
                  const list = [...s.ownedCards].sort((a, b) => a.priority - b.priority);
                  [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
                  renumber(list); s.ownedCards = list;
                })}>↓</button>
              </div>
            </div>
            <label class="field">
              <span>入会年月（ボーナス期限の計算に使います）</span>
              <input id={`join-${oc.cardId}`} type="month" value={oc.joinYm ?? ''} max={ctx.today.slice(0, 7)}
                onChange={(e: Event) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v && (!isValidYM(v) || v > ctx.today.slice(0, 7))) { ctx.toast('入会年月が正しくありません'); return; }
                  void ctx.update((s) => {
                    const c = s.ownedCards.find((x) => x.cardId === oc.cardId)!;
                    if (v) c.joinYm = v; else delete c.joinYm;
                  });
                }} />
            </label>
            <fieldset class="checks">
              <legend>使う支払い方法</legend>
              {methods.map((m) => (
                <label class="check">
                  <input type="checkbox" checked={oc.enabledMethods.includes(m)} onChange={(e: Event) => {
                    const on = (e.target as HTMLInputElement).checked;
                    void ctx.update((s) => {
                      const c = s.ownedCards.find((x) => x.cardId === oc.cardId)!;
                      c.enabledMethods = on ? [...new Set([...c.enabledMethods, m])] : c.enabledMethods.filter((x) => x !== m);
                    });
                  }} />
                  <span>{methodShort(m)}</span>
                </label>
              ))}
            </fieldset>
            {(() => {
              const armId = `remove-${oc.cardId}`;
              const armed = state.armed === armId;
              return (
                <button id={armId} class={`btn btn-small ${armed ? 'btn-danger' : 'btn-ghost danger'}`} onClick={() => {
                  if (!armed) { ctx.setState({ armed: armId }); return; }
                  state.armed = null;
                  void ctx.update((s) => {
                    s.ownedCards = s.ownedCards.filter((x) => x.cardId !== oc.cardId);
                    renumber(s.ownedCards.sort((a, b) => a.priority - b.priority));
                  });
                }}>{armed ? 'もう一度押すと外します（入会年月も消えます）' : '保有カードから外す'}</button>
              );
            })()}
          </div>
        );
      })}
      <div class="panel">
        <h2>カード以外の支払い</h2>
        <fieldset class="checks">
          {nonCard.map((r) => (
            <label class="check">
              <input type="checkbox" checked={state.settings.enabledNonCardRoutes.includes(r.id)} onChange={(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                void ctx.update((s) => {
                  s.enabledNonCardRoutes = on ? [...new Set([...s.enabledNonCardRoutes, r.id])] : s.enabledNonCardRoutes.filter((x) => x !== r.id);
                });
              }} />
              <span>{r.methodId === 'paypay' ? 'PayPay残高払い' : 'モバイルSuica（JR東日本の乗車）'}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
