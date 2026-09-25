import { h } from '../h';
import type { Ctx } from '../app';
import type { Id, Store } from '../../domain/types';
import type { MasterIndex } from '../../domain/master';
import { pct } from '../format';

/** 一覧表示中のカテゴリ（画面を離れても戻ったときに続きから選べるよう保持） */
let browsing: Id | null = null;

/** 保有カードで特約（高還元）がある店舗に付けるラベル。例：「三井住友 7%」 */
function specialTags(mi: MasterIndex, owned: Set<Id>, store: Store): string[] {
  const best = new Map<Id, number>();
  for (const r of mi.raw.rateRules) {
    if (r.target.storeId !== store.id) continue;
    const cardId = mi.routes.get(r.routeId)?.cardId;
    if (!cardId || !owned.has(cardId)) continue;
    best.set(cardId, Math.max(best.get(cardId) ?? 0, r.rate));
  }
  return [...best.entries()].map(([id, rate]) => `${mi.cards.get(id)?.shortName ?? id} ${pct(rate)}`);
}

export function CategoryScreen(ctx: Ctx): Node {
  const { mi, state } = ctx;
  if (browsing && !mi.categories.has(browsing)) browsing = null;

  // ---- カテゴリの選択 ----
  if (!browsing) {
    return (
      <section>
        <header class="screen-head">
          <button type="button" class="back" onClick={() => ctx.go('home')}>‹ 戻る</button>
          <h1>カテゴリで探す</h1>
        </header>
        <p class="sub">カテゴリを選ぶと、そのカテゴリのお店の一覧から選べます。</p>
        <div class="grid">
          {mi.raw.categories.map((c) => {
            const n = mi.raw.stores.filter((s) => s.categoryId === c.id).length;
            return (
              <button class="tile" onClick={() => { browsing = c.id; ctx.render(); window.scrollTo(0, 0); }}>
                <span>{c.name}</span>
                <small class="tile-count">{n}店</small>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // ---- 店舗一覧 ----
  const cat = mi.categories.get(browsing)!;
  const owned = new Set(state.settings.ownedCards.map((c) => c.cardId));
  const stores = mi.raw.stores
    .filter((s) => s.categoryId === cat.id)
    .map((s) => ({ s, tags: specialTags(mi, owned, s) }))
    // 高還元のある店を先に、その中はよみ順
    .sort((a, b) => Number(b.tags.length > 0) - Number(a.tags.length > 0)
      || (a.s.kana || a.s.name).localeCompare(b.s.kana || b.s.name, 'ja'));

  return (
    <section>
      <header class="screen-head">
        <button type="button" class="back" onClick={() => { browsing = null; ctx.render(); }}>‹ カテゴリ</button>
        <h1>{cat.name}</h1>
      </header>
      <p class="sub">お店を選んでください。<span class="tag-sample">三井住友 7%</span> のような表示は、お持ちのカードで高還元になるお店です。</p>
      <ul class="suggest-list store-list" aria-label={`${cat.name}のお店`}>
        {stores.map(({ s, tags }) => (
          <li>
            <button class="suggest-item" onClick={() => { browsing = null; void ctx.selectStore(s.id); }}>
              <span>{s.name}</span>
              {tags.length > 0 && <small class="tags">{tags.map((t) => <em class="tag">{t}</em>)}</small>}
            </button>
          </li>
        ))}
      </ul>
      <button class="btn btn-ghost" id="category-other" onClick={() => {
        state.selection = { categoryId: cat.id };
        state.query = '';
        browsing = null;
        ctx.go('home');
      }}>一覧にないお店（{cat.name}の通常還元で比べる）</button>
    </section>
  );
}
