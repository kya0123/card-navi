import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../../src/data/rules.json' with { type: 'json' };
import { indexMaster, validateMaster } from '../../src/domain/master';
import { defaultSettings, makeBackup, parseBackup, reconcile } from '../../src/domain/settings';
import { addOwnedCard, cardCatalog, compareCards, removeOwnedCard, segmentCounts } from '../../src/domain/catalog';
import { isThemeId, THEMES, themeOf } from '../../src/domain/theme';
import { bestUnownedAt, simulateAddCard } from '../../src/domain/simulate';
import { recommend } from '../../src/domain/engine';
import type { Master, UserSettings } from '../../src/domain/types';

/** カード一覧（20章）・配色（23章）・並び順（24章）・全カードでの提案（25章） */
const master = rules as unknown as Master;
const mi = indexMaster(master);
const TODAY = '2026-09-22';
const own = (...ids: string[]): UserSettings => ids.reduce((s, id) => addOwnedCard(mi, s, id), defaultSettings(mi));

test('C01: 新規利用者は保有カード0枚。カード以外の支払いは有効', () => {
  const d = defaultSettings(mi);
  assert.deepEqual(d.ownedCards, []);
  assert.deepEqual(d.enabledNonCardRoutes.sort(), ['paypay_balance', 'suica_ride']);
});

test('C02: 区分の絞り込み・件数', () => {
  const u = own('rakuten');
  const c = segmentCounts(mi, u);
  assert.equal(c.all, master.cards.length);
  assert.equal(c.owned, 1);
  assert.ok(cardCatalog(mi, u, 'enthusiast').every((e) => e.card.segments.includes('enthusiast')));
  assert.deepEqual(cardCatalog(mi, u, 'owned').map((e) => e.card.id), ['rakuten']);
  assert.equal(cardCatalog(mi, u, 'popular').length, c.popular);
});

test('C03: 検索（別名・略称・よみ）', () => {
  const u = own();
  assert.deepEqual(cardCatalog(mi, u, 'all', 'やふー').map((e) => e.card.id), ['paypay_gold']);
  assert.deepEqual(cardCatalog(mi, u, 'all', 'プラプリ').map((e) => e.card.id), ['smbc_pp']);
  assert.deepEqual(cardCatalog(mi, u, 'all', 'りくる').map((e) => e.card.id), ['recruit']);
  assert.deepEqual(cardCatalog(mi, u, 'all', 'びゅー').map((e) => e.card.id), ['view_std']);
});

test('C04: 基本・最大還元率と年間ボーナスの有無', () => {
  const e = cardCatalog(mi, own(), 'all', 'セブンカード')[0];
  assert.equal(e.baseRate, 0.005);
  assert.equal(e.maxRate, 0.1);
  assert.equal(e.hasBonus, false);
  assert.equal(cardCatalog(mi, own(), 'all', 'ゴールド（NL）')[0].hasBonus, true);
});

test('C05: 追加は末尾・重複しない・支払い方法は全部有効。外すと優先順位を振り直す', () => {
  let u = own('rakuten', 'mufg');
  u = addOwnedCard(mi, u, 'recruit');
  assert.deepEqual(u.ownedCards.map((c) => [c.cardId, c.priority]), [['rakuten', 1], ['mufg', 2], ['recruit', 3]]);
  assert.equal(addOwnedCard(mi, u, 'recruit'), u);
  assert.ok(u.ownedCards[2].enabledMethods.includes('applepay_quicpay'));
  u = removeOwnedCard(u, 'rakuten');
  assert.deepEqual(u.ownedCards.map((c) => [c.cardId, c.priority]), [['mufg', 1], ['recruit', 2]]);
  assert.throws(() => addOwnedCard(mi, u, 'nope'));
});

test('C06: 保有していないカードの特約は推奨に出ない', () => {
  const res = recommend(mi, own('rakuten'), { storeId: 'seven' }, TODAY);
  assert.ok(res.top.every((t) => t.cardId !== 'seven_plus' && t.cardId !== 'smbc_gold_nl'));
});

test('C07: マスタ検証で区分・会社のないカードを検出', () => {
  const bad = { ...master, cards: master.cards.map((c, i) => (i === 0 ? { ...c, segments: [], company: '' } : c)) };
  const errs = validateMaster(bad as Master);
  assert.ok(errs.some((e) => e.includes('segments不正')));
  assert.ok(errs.some((e) => e.includes('カード会社なし')));
  assert.deepEqual(validateMaster(master), []);
});

test('C08: 並び順は英字の会社→日本語の会社（よみ順）、会社内はカード名順（24.5）', () => {
  const list = cardCatalog(mi, own(), 'all');
  const companies = [...new Set(list.map((e) => e.card.company))];
  assert.deepEqual(companies.slice(0, 5), ['auフィナンシャルサービス', 'JCB', 'NTTドコモ', 'PayPayカード', 'アメリカン・エキスプレス']);
  assert.equal(companies.at(-1), '楽天カード');
  assert.ok(companies.indexOf('ビューカード') > companies.indexOf('セブン・カードサービス'));
  assert.ok(companies.indexOf('ビューカード') < companies.indexOf('三井住友カード'));
  const smbc = list.filter((e) => e.card.company === '三井住友カード').map((e) => e.card.id);
  assert.deepEqual(smbc.slice(0, 3), ['amazon_mc', 'ana_wide_gold', 'olive']);
  const sorted = [...master.cards].sort(compareCards).map((c) => c.id);
  assert.deepEqual(cardCatalog(mi, own(), 'popular').map((e) => e.card.id), sorted.filter((id) => mi.cards.get(id)!.segments.includes('popular')));
});

test('T01: 配色の既定は navy、未知の値は navy に戻る、バックアップで引き継ぐ', () => {
  assert.equal(themeOf(undefined).id, 'navy');
  assert.equal(themeOf('pink').id, 'navy');
  assert.equal(isThemeId('teal'), true);
  const u = { ...own('rakuten'), theme: 'teal' as const };
  assert.equal(reconcile(mi, { ...u, theme: 'pink' as never }).settings.theme, undefined);
  const r = parseBackup(mi, JSON.stringify(makeBackup(u, TODAY)));
  assert.ok(r.ok && r.settings.theme === 'teal');
});

test('T02: 全案でキー色の上の白文字が4.5:1以上', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const t of THEMES) assert.ok(1.05 / (lum(t.key) + 0.05) >= 4.5, t.id);
});

test('S08: 全カードで楽天のみ保有：損得順（Olive 8%が1位）、マリオット・プレミアムは最下位・回収ライン月343,800円', () => {
  const r = simulateAddCard(mi, own('rakuten'), ['seven', 'mcdonalds', 'starbucks', 'lawson_threef', 'familymart'], TODAY);
  assert.equal(r[0].cardId, 'olive');
  assert.equal(r[0].net.netYen, 33600);   // 月5万円×12×4/5×(8%−1%)
  assert.equal(r.find((x) => x.cardId === 'amazon_mc')?.improved.length, 1);   // セブンのみ（Apple Pay）
  const last = r.at(-1)!;
  assert.equal(last.cardId, 'marriott_premium');
  assert.equal(last.improved.length, 5);
  assert.equal(last.breakEvenMonthlyYen, 343800);
});

test('S09: ヒント：セブン→セブンカード・プラス10%、スタバ→JCB CARD W', () => {
  assert.deepEqual([bestUnownedAt(mi, own('rakuten'), 'seven', TODAY)?.cardId, bestUnownedAt(mi, own('rakuten'), 'seven', TODAY)?.afterRate], ['seven_plus', 0.1]);
  assert.equal(bestUnownedAt(mi, own('rakuten'), 'starbucks', TODAY)?.cardId, 'jcb_w');
});

test('M01: 2026-09-26 のマスタ修正（Olive 8%・Amazon はセブンのみ・楽天ペイ経由のSuica・ビューサンクスボーナス）', () => {
  assert.equal(recommend(mi, own('olive'), { storeId: 'lawson' }, TODAY).top[0].effectiveRate, 0.08);
  const amz = recommend(mi, own('amazon_mc'), { storeId: 'lawson' }, TODAY).top[0];
  assert.equal(amz.effectiveRate, 0.015);
  assert.equal(recommend(mi, own('amazon_mc'), { storeId: 'seven' }, TODAY).top[0].effectiveRate, 0.07);
  const jr = recommend(mi, own('rakuten'), { storeId: 'jr_east' }, TODAY).top[0];
  assert.deepEqual([jr.cardId, jr.effectiveRate], ['rakuten', 0.025]);
  const vb = mi.bonuses.get('view_15m')!;
  assert.equal(vb.periodType, 'fixed');
  assert.equal(vb.fixedStartMonthDay, '04-01');
  assert.ok(vb.excludedMethods.includes('mobile_suica_ride'));
});
