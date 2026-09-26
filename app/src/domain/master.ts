import type { Bonus, Card, Category, CustomCard, Id, Master, Method, Point, RateRule, Route, Series, Store } from './types';

export interface MasterIndex {
  raw: Master;
  series: Map<Id, Series>;
  cards: Map<Id, Card>;
  methods: Map<Id, Method>;
  points: Map<Id, Point>;
  routes: Map<Id, Route>;
  bonuses: Map<Id, Bonus>;
  bonusByCard: Map<Id, Bonus>;
  categories: Map<Id, Category>;
  stores: Map<Id, Store>;
  rulesByRoute: Map<Id, RateRule[]>;
  /** その他のカードを取り込んだ索引のとき、元のマスタの索引と取り込んだカード（domain/custom.ts） */
  base?: MasterIndex;
  custom?: readonly CustomCard[];
}

const byId = <T extends { id: Id }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));

export function indexMaster(m: Master): MasterIndex {
  const rulesByRoute = new Map<Id, RateRule[]>();
  for (const r of m.rateRules) {
    const list = rulesByRoute.get(r.routeId) ?? [];
    list.push(r);
    rulesByRoute.set(r.routeId, list);
  }
  return {
    raw: m,
    series: byId(m.series),
    cards: byId(m.cards),
    methods: byId(m.methods),
    points: byId(m.points),
    routes: byId(m.routes),
    bonuses: byId(m.bonuses),
    bonusByCard: new Map(m.bonuses.map((b) => [b.cardId, b])),
    categories: byId(m.categories),
    stores: byId(m.stores),
    rulesByRoute,
  };
}

const TIERS: readonly string[] = ['general', 'gold', 'platinum'];

/** マスタの整合性検証。エラーメッセージの配列を返す（空なら正常） */
export function validateMaster(m: Master): string[] {
  const errs: string[] = [];
  const sets: Record<string, Set<Id>> = {};
  for (const key of ['series', 'cards', 'methods', 'points', 'routes', 'bonuses', 'categories', 'stores', 'rateRules'] as const) {
    const xs = m[key] as { id: Id }[];
    const s = new Set(xs.map((x) => x.id));
    if (s.size !== xs.length) errs.push(`${key}: id重複`);
    sets[key] = s;
  }
  const yen = new Map(m.points.map((p) => [p.id, p.yenPerPoint]));
  for (const c of m.cards) {
    if (!sets.points.has(c.pointId)) errs.push(`card ${c.id}: pointId不正`);
    if (c.officialUrl && !c.officialUrl.startsWith('https://')) errs.push(`card ${c.id}: officialUrlがhttpsでない`);
    if (!Array.isArray(c.segments) || c.segments.length === 0 || c.segments.some((x) => x !== 'popular' && x !== 'enthusiast'))
      errs.push(`card ${c.id}: segments不正`);
    if (!c.shortName || !c.kana) errs.push(`card ${c.id}: 略称/よみなし`);
    if (!c.company || !c.companyKana) errs.push(`card ${c.id}: カード会社なし`);
    if (!sets.series.has(c.series)) errs.push(`card ${c.id}: series不正`);
    if (!TIERS.includes(c.tier)) errs.push(`card ${c.id}: tier不正`);
    if (!m.routes.some((r) => r.cardId === c.id)) errs.push(`card ${c.id}: 決済経路なし`);
  }
  for (const x of m.series) {
    if (!x.name || !x.kana) errs.push(`series ${x.id}: 名前/よみなし`);
    if (!m.cards.some((c) => c.series === x.id)) errs.push(`series ${x.id}: カードなし`);
  }
  for (const r of m.routes) {
    if (r.cardId !== null && !sets.cards.has(r.cardId)) errs.push(`route ${r.id}: cardId不正`);
    if (!sets.methods.has(r.methodId)) errs.push(`route ${r.id}: methodId不正`);
    if (!sets.points.has(r.pointId)) errs.push(`route ${r.id}: pointId不正`);
    if (!r.sourceUrl || !r.checkedAt) errs.push(`route ${r.id}: 出典/確認日なし`);
    const y = yen.get(r.pointId) ?? 0;
    if (r.baseRate > 0 && Math.abs((r.pointsPerUnit * y) / r.unitYen - r.baseRate) > 1e-9)
      errs.push(`route ${r.id}: baseRateと付与単位が不整合`);
  }
  for (const b of m.bonuses) if (!sets.cards.has(b.cardId)) errs.push(`bonus ${b.id}: cardId不正`);
  for (const s of m.stores) {
    if (!sets.categories.has(s.categoryId)) errs.push(`store ${s.id}: categoryId不正`);
    for (const x of s.acceptedMethods ?? []) if (!sets.methods.has(x)) errs.push(`store ${s.id}: method ${x}不正`);
    for (const x of s.usablePoints ?? []) if (!sets.points.has(x)) errs.push(`store ${s.id}: point ${x}不正`);
  }
  for (const k of m.categories)
    for (const x of k.defaultMethods) if (!sets.methods.has(x)) errs.push(`category ${k.id}: method ${x}不正`);
  for (const rr of m.rateRules) {
    const { storeId, categoryId } = rr.target;
    if (storeId && !sets.stores.has(storeId)) errs.push(`rule ${rr.id}: storeId不正`);
    if (categoryId && !sets.categories.has(categoryId)) errs.push(`rule ${rr.id}: categoryId不正`);
    if (!storeId && !categoryId) errs.push(`rule ${rr.id}: 対象なし`);
    if (!sets.routes.has(rr.routeId)) errs.push(`rule ${rr.id}: routeId不正`);
    const st = storeId ? m.stores.find((x) => x.id === storeId) : undefined;
    const route = m.routes.find((x) => x.id === rr.routeId);
    if (st && route) {
      const acc = st.acceptedMethods ?? m.categories.find((k) => k.id === st.categoryId)?.defaultMethods ?? [];
      if (!acc.includes(route.methodId)) errs.push(`rule ${rr.id}: 店舗で使えない支払い方法への特約`);
    }
    if (!rr.sourceUrl || !rr.checkedAt) errs.push(`rule ${rr.id}: 出典/確認日なし`);
  }
  return errs;
}

/** そのカードに経路がある支払い方法 */
export function methodsForCard(mi: MasterIndex, cardId: Id): Id[] {
  return mi.raw.routes.filter((r) => r.cardId === cardId).map((r) => r.methodId);
}

export function acceptedMethods(mi: MasterIndex, store: Store | undefined, categoryId: Id): Set<Id> {
  const list = store?.acceptedMethods ?? mi.categories.get(categoryId)?.defaultMethods ?? [];
  return new Set(list);
}
