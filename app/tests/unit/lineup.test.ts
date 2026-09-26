import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../../src/data/rules.json' with { type: 'json' };
import { indexMaster, validateMaster } from '../../src/domain/master';
import { recommend } from '../../src/domain/engine';
import { defaultSettings, makeBackup, parseBackup, reconcile } from '../../src/domain/settings';
import { addOwnedCard, cardCatalog, masterCards, segmentCounts } from '../../src/domain/catalog';
import { addCustomCard, removeCustomCard, sanitizeCustomCards, withCustomCards } from '../../src/domain/custom';
import { simulateAddCard } from '../../src/domain/simulate';
import type { Master, UserSettings } from '../../src/domain/types';

/** カードラインナップの再整理 段階2（詳細設計 32.7・32.8） */
const master = rules as unknown as Master;
const mi = indexMaster(master);
const TODAY = '2026-09-22';
const own = (...ids: string[]): UserSettings => ids.reduce((s, id) => addOwnedCard(mi, s, id), { ...defaultSettings(mi), enabledNonCardRoutes: [] as string[] });
const withCustom = (s: UserSettings, name: string, pointId: string, baseRate: number) => addCustomCard(mi, s, { name, pointId, baseRate });

// ---- 32.7 全カードで比べるときのシリーズまとめ ----

test('L01: 全カード・持っているカードなし：同じシリーズ・同じ率は1枠。代表は年会費の安いカード', () => {
  const res = recommend(mi, own(), { storeId: 'seven', scope: 'all' }, TODAY, 10);
  const ids = res.top.map((t) => t.cardId);
  assert.equal(ids.filter((id) => id === 'smbc_nl' || id === 'smbc_gold_nl' || id === 'smbc_pp').length, 1);
  const nl = res.top.find((t) => t.cardId === 'smbc_nl')!;
  assert.deepEqual(nl.sameRateCardIds, ['smbc_gold_nl', 'smbc_pp'], '年会費の安い順に添える');
  assert.equal(new Set(ids).size, ids.length);
});

test('L02: 全カード：持っているカードが代表。持っていないカードは持っているカードの枠にまとまる', () => {
  const res = recommend(mi, own('smbc_pp'), { storeId: 'seven', scope: 'all' }, TODAY, 10);
  const pp = res.top.find((t) => t.cardId === 'smbc_pp')!;
  assert.deepEqual(pp.sameRateCardIds, ['smbc_nl', 'smbc_gold_nl']);
  assert.ok(!res.top.some((t) => t.cardId === 'smbc_nl' || t.cardId === 'smbc_gold_nl'));
});

test('L03: 全カード：同じシリーズを2枚持っていても、持っているカードどうしはまとめない', () => {
  const res = recommend(mi, own('smbc_nl', 'smbc_gold_nl'), { storeId: 'seven', scope: 'all' }, TODAY, 10);
  const ids = res.top.map((t) => t.cardId);
  assert.ok(ids.includes('smbc_nl') && ids.includes('smbc_gold_nl'));
  assert.deepEqual(res.top.find((t) => t.cardId === 'smbc_nl')!.sameRateCardIds, ['smbc_pp']);
  assert.equal(res.top.find((t) => t.cardId === 'smbc_gold_nl')!.sameRateCardIds, undefined);
});

test('L04: 率が違えば同じシリーズでもまとめない（ファミマ：プラチナプリファード1%と（NL）0.5%）', () => {
  const res = recommend(mi, own(), { storeId: 'familymart', scope: 'all' }, TODAY, 30);
  const ids = res.top.map((t) => t.cardId);
  assert.ok(ids.includes('smbc_pp') && ids.includes('smbc_nl'));
  assert.deepEqual(res.top.find((t) => t.cardId === 'smbc_nl')!.sameRateCardIds, ['smbc_gold_nl']);
});

test('L05: 手持ちで比べるときはまとめない（結果は従来どおり）', () => {
  const res = recommend(mi, own('smbc_nl', 'smbc_gold_nl', 'smbc_pp'), { storeId: 'seven' }, TODAY, 10);
  assert.deepEqual(res.top.map((t) => t.cardId).slice(0, 3), ['smbc_nl', 'smbc_gold_nl', 'smbc_pp']);
  assert.ok(res.top.every((t) => t.sameRateCardIds === undefined));
});

// ---- 32.8 その他のカード ----

test('L10: 追加すると持っているカードの末尾に入り、おすすめの候補になる（ファミマで1.2%が1位・概算）', () => {
  const s = withCustom(own('rakuten'), '〇〇銀行カード', 'rakuten_point', 0.012);
  assert.deepEqual(s.customCards, [{ id: 'custom_1', name: '〇〇銀行カード', pointId: 'rakuten_point', baseRate: 0.012 }]);
  assert.deepEqual(s.ownedCards.map((c) => [c.cardId, c.priority]), [['rakuten', 1], ['custom_1', 2]]);
  const res = recommend(mi, s, { storeId: 'familymart', amountYen: 1000 }, TODAY);
  assert.equal(res.top[0].cardId, 'custom_1');
  assert.equal(res.top[0].effectiveRate, 0.012);
  assert.equal(res.top[0].earnedYen, 12);
  assert.equal(res.top[0].earnedApprox, true);
  assert.deepEqual(res.top[0].methodIds, ['card_physical', 'smartphone_visa_touch']);
  assert.deepEqual(res.top[0].reasons, ['登録した基本のポイント率1.2%']);
  assert.deepEqual(res.warnings, []);
});

test('L11: 特約はない（セブンで7%のカードより下）。ポイントの評価はマスタのポイントに従う（三菱UFJポイント1pt＝5円）', () => {
  const s = withCustom(own('smbc_nl'), '', 'global_point', 0.01);
  const res = recommend(mi, s, { storeId: 'seven' }, TODAY);
  assert.deepEqual(res.top.map((t) => t.cardId), ['smbc_nl', 'custom_1']);
  const mx = withCustomCards(mi, s.customCards);
  assert.equal(mx.cards.get('custom_1')!.name, 'その他のカード1');
  assert.equal(mx.routes.get('custom_1_card_physical')!.pointsPerUnit, 0.2);
});

test('L12: 全カードで比べるときもその他のカードは持っているカード。シリーズのまとめには入らない（同率3%のマリオット・プレミアムより上）', () => {
  const s = withCustom(withCustom(own(), 'A', 'vpoint', 0.03), 'B', 'vpoint', 0.03);
  const res = recommend(mi, s, { storeId: 'familymart', scope: 'all' }, TODAY, 5);
  assert.deepEqual(res.top.slice(0, 2).map((t) => t.cardId), ['custom_1', 'custom_2']);
  assert.ok(res.top.slice(0, 2).every((t) => t.sameRateCardIds === undefined));
});

test('L13: 上限5枚・範囲外の率・未知のポイントは追加しない。削除すると持っているカードからも外れる', () => {
  let s = own('rakuten');
  for (let i = 0; i < 6; i++) s = withCustom(s, `C${i}`, 'vpoint', 0.01);
  assert.equal(s.customCards!.length, 5);
  assert.equal(withCustom(own(), 'x', 'vpoint', 0.05).customCards, undefined);
  assert.equal(withCustom(own(), 'x', 'nope', 0.01).customCards, undefined);
  s = removeCustomCard(s, 'custom_2');
  assert.deepEqual(s.customCards!.map((c) => c.id), ['custom_1', 'custom_3', 'custom_4', 'custom_5']);
  assert.ok(!s.ownedCards.some((c) => c.cardId === 'custom_2'));
  assert.deepEqual(s.ownedCards.map((c) => c.priority), [1, 2, 3, 4, 5]);
  assert.equal(withCustom(s, 'D', 'vpoint', 0.01).customCards!.at(-1)!.id, 'custom_6', 'IDは使い回さない');
});

test('L14: reconcile：不正なものを外し、抜けている持っているカードを補う。率は0.1%刻みに丸める', () => {
  const raw = {
    ...own('rakuten'),
    customCards: [
      { id: 'custom_1', name: ' A ', pointId: 'vpoint', baseRate: 0.01249 },
      { id: 'custom_1', name: '重複', pointId: 'vpoint', baseRate: 0.01 },
      { id: 'custom_2', name: '範囲外', pointId: 'vpoint', baseRate: 0.2 },
      { id: 'custom_3', name: '未知', pointId: 'nope', baseRate: 0.01 },
      { id: 'bad', name: 'ID不正', pointId: 'vpoint', baseRate: 0.01 },
    ],
  } as UserSettings;
  raw.ownedCards.push({ cardId: 'custom_2', enabledMethods: [], priority: 9 });
  const { settings, dropped } = reconcile(mi, raw);
  assert.deepEqual(settings.customCards, [{ id: 'custom_1', name: 'A', pointId: 'vpoint', baseRate: 0.012 }]);
  assert.deepEqual(settings.ownedCards.map((c) => c.cardId), ['rakuten', 'custom_1']);
  assert.equal(dropped, 5);
  assert.equal(reconcile(mi, own('rakuten')).settings.customCards, undefined);
});

test('L15: バックアップの書き出し・読み込みで引き継ぐ', () => {
  const s = withCustom(own('rakuten'), 'A', 'd_point', 0.015);
  const r = parseBackup(mi, JSON.stringify(makeBackup(s, TODAY)));
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.settings.customCards, s.customCards);
    assert.ok(r.settings.ownedCards.some((c) => c.cardId === 'custom_1'));
  }
});

test('L16: カード一覧・区分の枚数・「全N枚」・提案の候補にはその他のカードを含めない', () => {
  const s = withCustom(own('rakuten'), 'A', 'vpoint', 0.01);
  const mx = withCustomCards(mi, s.customCards);
  assert.equal(masterCards(mx).length, master.cards.length);
  assert.ok(!cardCatalog(mx, s, 'all').some((e) => e.card.userDefined));
  assert.ok(!cardCatalog(mx, s, 'owned').some((e) => e.card.userDefined));
  assert.equal(segmentCounts(mx, s).all, master.cards.length);
  assert.equal(segmentCounts(mx, s).owned, 1);
  const sim = simulateAddCard(mx, s, ['familymart', 'seven', 'lawson', 'mcdonalds', 'matsuya'], TODAY, { minDelta: 0 });
  assert.ok(sim.every((x) => !x.cardId.startsWith('custom_')));
});

test('L17: その他のカードのポイントも、ポイント払いの判定で「持っているポイント」に入る', () => {
  const s = withCustom(own(), 'A', 'd_point', 0.005);
  const res = recommend(mi, s, { storeId: 'lawson' }, TODAY);
  assert.deepEqual(res.pointPay, ['d_point']);
});

test('L18: sanitizeCustomCards は配列以外を空にする', () => {
  assert.deepEqual(sanitizeCustomCards(mi, undefined), []);
  assert.deepEqual(sanitizeCustomCards(mi, { id: 'custom_1' }), []);
});

// ---- 32.11 カード以外の支払い・現金のみの店 ----

test('L20: 新規利用者に最初から有効なのはPayPay残高とモバイルSuicaだけ。新しい支払いは既定でオフ', () => {
  assert.deepEqual(defaultSettings(mi).enabledNonCardRoutes.sort(), ['paypay_balance', 'suica_ride']);
  const nonCard = master.routes.filter((r) => r.cardId === null);
  assert.deepEqual(nonCard.map((r) => r.id).sort(),
    ['aupay_balance', 'dbarai_balance', 'edy_emoney', 'nanaco_emoney', 'paypay_balance', 'rpay_cash', 'suica_ride', 'waon_emoney']);
  assert.ok(nonCard.every((r) => r.label), 'カード以外の経路には表示名がある');
  assert.deepEqual(master.methods.filter((m) => m.type === 'emoney').map((m) => m.id), ['waon', 'nanaco', 'edy']);
});

test('L21: 既存利用者の設定には新しい支払いを自動で加えない', () => {
  const s = { ...own('rakuten'), enabledNonCardRoutes: ['paypay_balance'] };
  assert.deepEqual(reconcile(mi, s).settings.enabledNonCardRoutes, ['paypay_balance']);
});

test('L22: 使えるお店：コード決済はコンビニ・スーパー・ドラッグストア。電子マネーは店ごと', () => {
  const s = { ...own(), enabledNonCardRoutes: ['dbarai_balance', 'waon_emoney', 'nanaco_emoney', 'edy_emoney'] };
  const ids = (store: string) => recommend(mi, s, { storeId: store }, TODAY, 10).top.map((t) => t.routeIds[0]);
  assert.deepEqual(ids('welcia').sort(), ['dbarai_balance', 'waon_emoney']);
  assert.deepEqual(ids('seven').sort(), ['dbarai_balance', 'nanaco_emoney']);
  assert.deepEqual(ids('familymart').sort(), ['dbarai_balance', 'edy_emoney']);
  assert.deepEqual(ids('mcdonalds'), [], '飲食チェーンは既定に加えていない');
  assert.equal(recommend(mi, s, { storeId: 'aeon' }, TODAY).top[0].effectiveRate, 0.01, 'WAONはイオンで2倍');
});

test('L23: 現金のみの店：候補は0件。マスタ検証は acceptedMethods が空であることを求める', () => {
  const cashStore = { id: 'cash_ramen', name: '現金ラーメン', kana: 'げんきんらーめん', aliases: [], categoryId: 'restaurant', acceptedMethods: [], cashOnly: true };
  const m2 = { ...master, stores: [...master.stores, cashStore] } as Master;
  assert.deepEqual(validateMaster(m2), []);
  const mi2 = indexMaster(m2);
  const res = recommend(mi2, own('rakuten', 'smbc_nl'), { storeId: 'cash_ramen' }, TODAY);
  assert.deepEqual(res.top, []);
  assert.equal(res.pointPay, null);
  const bad = { ...master, stores: [...master.stores, { ...cashStore, acceptedMethods: ['card_physical'] }] } as Master;
  assert.ok(validateMaster(bad).some((e) => e.includes('現金のみの店はacceptedMethodsを空にする')));
  const bad2 = { ...master, stores: [...master.stores, { ...cashStore, cashOnly: false }] } as Master;
  assert.ok(validateMaster(bad2).some((e) => e.includes('acceptedMethodsが空')));
});
