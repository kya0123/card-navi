import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../../src/data/rules.json' with { type: 'json' };
import { indexMaster, validateMaster } from '../../src/domain/master';
import { earnedYen, recommend, resolveRate } from '../../src/domain/engine';
import { bonusPeriod, bonusValueYen, goalStatus, periodFor, rolloverGoals } from '../../src/domain/bonus';
import { buildSearchIndex, normalize, searchStores } from '../../src/domain/search';
import { defaultSettings, makeBackup, parseBackup, reconcile } from '../../src/domain/settings';
import { addOwnedCard } from '../../src/domain/catalog';
import { methodsForCard } from '../../src/domain/master';
import type { Master, RateRule, UserSettings } from '../../src/domain/types';

const master = rules as unknown as Master;
const mi = indexMaster(master);
const TODAY = '2026-09-22';

// ---------- マスタ ----------
test('master: 同梱マスタは検証エラーなし', () => {
  assert.deepEqual(validateMaster(master), []);
});

test('master: 参照切れ・率の不整合を検出する', () => {
  const broken = structuredClone(master);
  broken.routes[0].cardId = 'nope';
  broken.routes[1].baseRate = 0.02;
  broken.rateRules[0].routeId = 'nope';
  const errs = validateMaster(broken);
  assert.ok(errs.some((e) => e.includes('cardId不正')));
  assert.ok(errs.some((e) => e.includes('不整合')));
  assert.ok(errs.some((e) => e.includes('routeId不正')));
});

// ---------- 還元率の決定 ----------
function withRules(extra: RateRule[]) {
  const m = structuredClone(master);
  m.rateRules.push(...extra);
  return indexMaster(m);
}
const rule = (p: Partial<RateRule>): RateRule => ({
  id: 'x', target: {}, routeId: 'rakuten_card', rate: 0.03, validFrom: null, validTo: null,
  sourceUrl: 'u', checkedAt: TODAY, confidence: 'high', conditions: '', ...p,
});

test('resolveRate: 店舗 > カテゴリ > 基本', () => {
  const m = withRules([
    rule({ id: 'c', target: { categoryId: 'convenience' }, rate: 0.02 }),
    rule({ id: 's', target: { storeId: 'familymart' }, rate: 0.03 }),
  ]);
  const route = m.routes.get('rakuten_card')!;
  assert.deepEqual(
    [resolveRate(m, route, m.stores.get('familymart'), 'convenience', TODAY).rate,
      resolveRate(m, route, m.stores.get('lawson'), 'convenience', TODAY).rate,
      resolveRate(m, route, m.stores.get('aeon'), 'supermarket', TODAY).rate],
    [0.03, 0.02, 0.01]);
});

test('resolveRate: 有効期間の境界（当日を含む）', () => {
  const m = withRules([rule({ id: 'v', target: { storeId: 'aeon' }, validFrom: '2026-09-22', validTo: '2026-09-30' })]);
  const route = m.routes.get('rakuten_card')!;
  const s = m.stores.get('aeon');
  assert.equal(resolveRate(m, route, s, 'supermarket', '2026-09-21').source, 'base');
  assert.equal(resolveRate(m, route, s, 'supermarket', '2026-09-22').source, 'store');
  assert.equal(resolveRate(m, route, s, 'supermarket', '2026-09-30').source, 'store');
  assert.equal(resolveRate(m, route, s, 'supermarket', '2026-10-01').source, 'base');
});

// ---------- 付与ポイント ----------
test('earnedYen: 付与単位の境界 199/200/201円', () => {
  // 1回ごと計算の例：ANA（200円＝1pt）。三井住友系は2026-09-25から月間合計（概算）
  const r = mi.routes.get('ana_card')!;
  assert.deepEqual([199, 200, 201, 399, 400].map((a) => earnedYen(r, 0.005, a).yen), [0, 1, 1, 1, 2]);
  const touch = mi.routes.get('smbcg_touch')!;
  assert.deepEqual(earnedYen(touch, 0.07, 850), { yen: 59, approx: true });
  assert.deepEqual(earnedYen(touch, 0.07, undefined), { yen: null, approx: false });
});

test('earnedYen: 月間合計のカードは概算', () => {
  const r = mi.routes.get('mufg_card')!;
  assert.deepEqual(earnedYen(r, 0.005, 999), { yen: 4, approx: true });
});

// ---------- 推奨・グループ化 ----------
/** v1.5までの初期状態に相当する保有カード（新規利用者は0枚のため、テストでは5枚を持たせる。詳細設計 20.8） */
const INITIAL_CARDS = ['smbc_gold_nl', 'rakuten', 'ana_wide_gold', 'mufg', 'paypay_gold'];
const withInitial = (): UserSettings => INITIAL_CARDS.reduce((s, id) => addOwnedCard(mi, s, id), defaultSettings(mi));
const user = (patch: Partial<UserSettings> = {}): UserSettings => ({ ...withInitial(), ...patch });

test('recommend: 同じカードは1枠（いちばん高い率）。低い率の支払い方法は others に入る', () => {
  const s = user({ bonusGoals: [{ bonusId: 'smbcg_1m', target: false }] });
  const res = recommend(mi, s, { storeId: 'seven' }, TODAY, 10);
  const smbc = res.top.filter((t) => t.cardId === 'smbc_gold_nl');
  assert.equal(smbc.length, 1);
  assert.deepEqual(smbc[0].methodIds, ['smartphone_visa_touch']);
  assert.equal(smbc[0].others.length, 1);
  assert.ok(smbc[0].others[0].methodIds.length >= 3);
  assert.ok(smbc[0].others[0].effectiveRate < smbc[0].effectiveRate);
  const cards = res.top.map((t) => t.cardId ?? t.routeIds[0]);
  assert.equal(new Set(cards).size, cards.length);
});

test('recommend: ボーナスの上乗せに年会費無料の初回特典は含めない', () => {
  const s = user({ ownedCards: user().ownedCards.map((c) => (c.cardId === 'smbc_gold_nl' ? { ...c, joinYm: '2024-04' } : c)),
    bonusGoals: [{ bonusId: 'smbcg_1m', target: true, progressYen: 0 }] });
  const res = recommend(mi, s, { storeId: 'seven' }, TODAY);
  assert.equal(res.top[0].bonusRate, 0.01);
  const done = recommend(mi, { ...s, bonusGoals: [{ bonusId: 'smbcg_1m', target: true, achieved: true }] }, { storeId: 'seven' }, TODAY);
  assert.equal(done.top[0].bonusRate, 0, '今期達成済みは加算しない');
});

test('recommend: 入会年月が未設定ならボーナスは加算しない', () => {
  const s = user({ bonusGoals: [{ bonusId: 'smbcg_1m', target: true }] });
  const res = recommend(mi, s, { storeId: 'familymart' }, TODAY);
  assert.equal(res.top[0].cardId, 'rakuten');
});

test('recommend: 候補0件', () => {
  const s = user({ ownedCards: [], enabledNonCardRoutes: [] });
  const res = recommend(mi, s, { storeId: 'seven' }, TODAY);
  assert.deepEqual(res.top, []);
  assert.equal(res.pointPay, null);
});

test('recommend: 店舗もカテゴリもない場合は例外', () => {
  assert.throws(() => recommend(mi, user(), {}, TODAY));
  assert.throws(() => recommend(mi, user(), { storeId: 'nope' }, TODAY));
});

test('recommend: 要確認の経路と古いルールを警告する', () => {
  // Suica乗車は2026-09-25に確認済み。要確認が残る dカード（2027年改定予定）で確認する
  const dc = { cardId: 'dcard', enabledMethods: ['card_physical', 'smartphone_visa_touch', 'applepay_id', 'online'], priority: 1 };
  const res = recommend(mi, { ...user({ staleWarnDays: 30 }), ownedCards: [dc] }, { storeId: 'familymart' }, '2026-12-31');
  assert.ok(res.warnings.some((w) => w.includes('要確認')));
  assert.ok(res.warnings.some((w) => w.includes('日経過')));
});

test('recommend: ポイント払いの表示順はマスタ定義順', () => {
  const res = recommend(mi, user(), { storeId: 'familymart' }, TODAY);
  assert.deepEqual(res.pointPay, ['vpoint', 'rakuten_point', 'paypay_point']);
});

// ---------- 比較範囲（持っているカード／登録カード全体） ----------
test('recommend: 登録カード全体では未保有カードも候補になる（既定は持っているカードだけ）', () => {
  const owned = recommend(mi, user(), { storeId: 'seven' }, TODAY, 10);
  assert.ok(owned.top.every((t) => t.cardId == null || INITIAL_CARDS.includes(t.cardId)));
  const all = recommend(mi, user(), { storeId: 'seven', scope: 'all' }, TODAY, 10);
  assert.equal(all.top[0].cardId, 'seven_plus');
  assert.equal(all.top[0].effectiveRate, 0.1);
});

test('recommend: 登録カード全体で同率なら持っているカードが先（同じシリーズは持っているカードの枠にまとまる。32.7）', () => {
  const all = recommend(mi, user(), { storeId: 'seven', scope: 'all' }, TODAY, 10);
  const ids = all.top.map((t) => t.cardId);
  assert.ok(ids.indexOf('smbc_gold_nl') < ids.indexOf('amazon_mc'));
  assert.ok(!ids.includes('smbc_nl'));
  assert.deepEqual(all.top.find((t) => t.cardId === 'smbc_gold_nl')!.sameRateCardIds, ['smbc_nl', 'smbc_pp']);
});

test('recommend: 保有0枚でも登録カード全体なら候補が出る。ポイント払いは出さない', () => {
  const s = user({ ownedCards: [], enabledNonCardRoutes: [] });
  const res = recommend(mi, s, { storeId: 'seven', scope: 'all' }, TODAY);
  assert.equal(res.top.length, 3);
  assert.equal(res.pointPay, null);
});

test('recommend: 登録カード全体でもポイント払いは持っているカードで判定する', () => {
  const owned = recommend(mi, user(), { storeId: 'familymart' }, TODAY);
  const all = recommend(mi, user(), { storeId: 'familymart', scope: 'all' }, TODAY);
  assert.deepEqual(all.pointPay, owned.pointPay);
});

test('recommend: 未保有カードにはボーナスを加算しない（目標が残っていても）', () => {
  const s = user({
    ownedCards: user().ownedCards.filter((c) => c.cardId !== 'paypay_gold'),
    bonusGoals: [{ bonusId: 'ppg_1m', target: true, deadlineOverride: '2026-12-31' }],
  });
  const all = recommend(mi, s, { storeId: 'seven', scope: 'all' }, TODAY, 50);
  assert.ok(all.top.every((t) => t.bonusRate === 0));
});

// ---------- ボーナス ----------
test('bonusPeriod: 年またぎ', () => {
  assert.deepEqual(bonusPeriod('2023-11', 0, '2026-01-15'), { start: '2025-11-01', end: '2026-10-31' });
  assert.deepEqual(bonusPeriod('2023-11', 0, '2026-10-31'), { start: '2025-11-01', end: '2026-10-31' });
  assert.deepEqual(bonusPeriod('2023-11', 0, '2026-11-01'), { start: '2026-11-01', end: '2027-10-31' });
});

test('goalStatus: 状態と必要な月額の切り上げ', () => {
  const b = mi.bonuses.get('smbcg_1m')!;
  const card = { cardId: 'smbc_gold_nl', joinYm: '2024-04', enabledMethods: [], priority: 1 };
  const g = { bonusId: b.id, target: true };
  assert.equal(goalStatus(b, { ...g, progressYen: 1_000_000 }, card, TODAY).state, 'achieved');
  assert.equal(goalStatus(b, { ...g, achieved: true }, card, TODAY).state, 'achieved');
  assert.equal(goalStatus(b, { ...g, deadlineOverride: '2026-09-21' }, card, TODAY).state, 'expired');
  assert.equal(goalStatus(b, g, { ...card, joinYm: undefined }, TODAY).state, 'unset');
  const st = goalStatus(b, { ...g, progressYen: 300_001 }, card, TODAY);
  assert.equal(st.requiredMonthlyYen, Math.ceil(699_999 / 7));
});

test('rolloverGoals: 期限を過ぎたら前期実績に退避してリセット', () => {
  const cards = [{ cardId: 'smbc_gold_nl', joinYm: '2024-04', enabledMethods: [], priority: 1 }];
  const goals = [{ bonusId: 'smbcg_1m', target: true, progressYen: 800_000, oneTimeAchieved: true, periodEnd: '2026-03-31' }];
  const r = rolloverGoals(mi, goals, cards, '2026-04-01');
  assert.equal(r.notices.length, 1);
  assert.deepEqual(r.goals[0].prevPeriod, { deadline: '2026-03-31', progressYen: 800_000, achieved: false });
  assert.equal(r.goals[0].progressYen, 0);
  assert.equal(r.goals[0].oneTimeAchieved, true);
  assert.equal(r.goals[0].periodEnd, '2027-03-31');
  // 期限内は変化なし
  const r2 = rolloverGoals(mi, r.goals, cards, '2026-09-22');
  assert.equal(r2.changed, false);
  // 手動期限は対象外
  const r3 = rolloverGoals(mi, [{ ...goals[0], deadlineOverride: '2026-03-31' }], cards, '2026-04-01');
  assert.equal(r3.notices.length, 0);
});

// ---------- 検索 ----------
const idx = buildSearchIndex(mi);
test('normalize: 半角カナ・カタカナ・記号', () => {
  assert.equal(normalize('ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ'), 'せぶんいれぶん');
  assert.equal(normalize('セブン・イレブン'), 'せぶんいれぶん');
  assert.equal(normalize('ＭＡＣ'), 'mac');
});

test('searchStores: ひらがな・半角カナ・別名で見つかる', () => {
  assert.equal(searchStores(idx, 'せぶん', [])[0].id, 'seven');
  assert.equal(searchStores(idx, 'ｾﾌﾞﾝ', [])[0].id, 'seven');
  assert.equal(searchStores(idx, 'ファミマ', [])[0].id, 'familymart');
  assert.equal(searchStores(idx, 'スタバ', [])[0].id, 'starbucks');
});

test('searchStores: 前方一致が部分一致より上、最近使った店を優先', () => {
  const r = searchStores(idx, 'がすと', []);
  assert.deepEqual(r.slice(0, 2).map((s) => s.id), ['gusto', 'steakgusto']);
  const r2 = searchStores(idx, 'ま', ['matsuya']);
  assert.equal(r2[0].id, 'matsuya');
  assert.deepEqual(searchStores(idx, '', ['lawson', 'seven']).map((s) => s.id), ['lawson', 'seven']);
  assert.deepEqual(searchStores(idx, 'zzzz', []), []);
});

// ---------- バックアップ ----------
test('backup: 往復で一致', () => {
  const s = user({ lastExportAt: TODAY });
  s.ownedCards[0].joinYm = '2024-04';
  const r = parseBackup(mi, JSON.stringify(makeBackup(s, TODAY)));
  assert.ok(r.ok);
  if (r.ok) { assert.deepEqual(r.settings, s); assert.equal(r.dropped, 0); }
});

test('backup: 不正ファイルは拒否', () => {
  assert.equal(parseBackup(mi, 'not json').ok, false);
  assert.equal(parseBackup(mi, '{"app":"other"}').ok, false);
  assert.equal(parseBackup(mi, '{"app":"card-advisor","settings":{"schemaVersion":2}}').ok, false);
});

test('backup: 未知のIDは読み飛ばして件数を返す', () => {
  const s = user();
  s.ownedCards.push({ cardId: 'unknown', enabledMethods: [], priority: 9 });
  s.enabledNonCardRoutes.push('unknown_route');
  const r = parseBackup(mi, JSON.stringify(makeBackup(s, TODAY)));
  assert.ok(r.ok && r.dropped === 2 && !r.settings.ownedCards.some((c) => c.cardId === 'unknown'));
});

// ---------- 2026-09-25：初年度・固定期間のボーナス ----------
test('periodFor: 入会年月なしの入会月基準は null、固定期間は入会年月不要', () => {
  const ppg = mi.bonuses.get('ppg_1m')!, dg = mi.bonuses.get('dg_1m')!;
  assert.equal(periodFor(ppg, undefined, '2026-09-22'), null);
  assert.deepEqual(periodFor(dg, undefined, '2026-12-16'), { start: '2026-12-16', end: '2027-12-15', first: false });
  assert.deepEqual(periodFor(dg, undefined, '2026-01-01'), { start: '2025-12-16', end: '2026-12-15', first: false });
});

test('goalStatus・bonusValueYen: PayPayゴールドの入会初年度は13か月・6,000pt', () => {
  const b = mi.bonuses.get('ppg_1m')!;
  const card = { cardId: 'paypay_gold', joinYm: '2026-03', enabledMethods: [], priority: 1 };
  const g = { bonusId: 'ppg_1m', target: true, progressYen: 0 };
  const st = goalStatus(b, g, card, '2026-09-22');
  assert.equal(st.firstPeriod, true);
  assert.equal(st.deadline, '2027-03-31');
  assert.equal(st.monthsLeft, 7);
  assert.equal(bonusValueYen(b, g, st.firstPeriod), 6000);
  const st2 = goalStatus(b, g, card, '2027-04-01');
  assert.equal(st2.firstPeriod, false);
  assert.equal(bonusValueYen(b, g, st2.firstPeriod), 11000);
});

test('rolloverGoals: 固定期間は入会年月がなくても繰り越す', () => {
  const cards = [{ cardId: 'dcard_gold', enabledMethods: [], priority: 1 }];
  const goals = [{ bonusId: 'dg_1m', target: true, progressYen: 800000, periodEnd: '2026-12-15' }];
  const r = rolloverGoals(mi, goals, cards, '2026-12-16');
  assert.equal(r.notices.length, 1);
  assert.equal(r.goals[0].progressYen, 0);
  assert.equal(r.goals[0].periodEnd, '2027-12-15');
  assert.equal(r.goals[0].prevPeriod?.progressYen, 800000);
});

test('reconcile: 支払い方法の選択は廃止。外していた支払い方法もすべて使える状態に戻す', () => {
  const s = user({ ownedCards: [{ cardId: 'rakuten', enabledMethods: ['card_physical'], priority: 1 }] });
  const r = reconcile(mi, s);
  assert.deepEqual(r.settings.ownedCards[0].enabledMethods, methodsForCard(mi, 'rakuten'));
  assert.equal(r.dropped, 0);
});
