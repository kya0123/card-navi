import type { MasterIndex } from './master';
import type { Id, Store } from './types';

/** 検索用の正規化：NFKC → 小文字 → カタカナをひらがな → 空白・記号を除去（長音「ー」は残す） */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐‑–—―・･!！?？'’"“”.,、。&＆()（）\[\]［］/／:：]/g, '');
}

export interface SearchIndex { entries: { store: Store; keys: string[] }[] }

export function buildSearchIndex(mi: MasterIndex): SearchIndex {
  return {
    entries: mi.raw.stores.map((store) => ({
      store,
      keys: [store.name, store.kana, ...store.aliases].map(normalize).filter(Boolean),
    })),
  };
}

/** 店舗検索（詳細設計 7章）。前方一致 > 部分一致、同順位は最近使った店 → 名前の短い順 */
export function searchStores(idx: SearchIndex, query: string, recent: Id[], limit = 8): Store[] {
  const q = normalize(query);
  const recentRank = new Map(recent.map((id, i) => [id, i]));
  if (!q) {
    return recent
      .map((id) => idx.entries.find((e) => e.store.id === id)?.store)
      .filter((s): s is Store => !!s)
      .slice(0, limit);
  }
  const hits: { store: Store; rank: number }[] = [];
  for (const e of idx.entries) {
    let rank = -1;
    if (e.keys.some((k) => k.startsWith(q))) rank = 0;
    else if (e.keys.some((k) => k.includes(q))) rank = 1;
    if (rank >= 0) hits.push({ store: e.store, rank });
  }
  hits.sort((a, b) =>
    a.rank - b.rank
    || (recentRank.get(a.store.id) ?? 1e9) - (recentRank.get(b.store.id) ?? 1e9)
    || a.store.name.length - b.store.name.length
    || a.store.name.localeCompare(b.store.name, 'ja'));
  return hits.slice(0, limit).map((h) => h.store);
}
