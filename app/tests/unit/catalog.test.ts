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
  assert.deepEqual(cardCatalog(mi, u, 'all', 'プラプリ').map((e) => e.card.id), ['olive_pp', 'smbc_pp']);
  assert.deepEqual(cardCatalog(mi, u, 'all', 'りくる').map((e) => e.card.id), ['recruit']);
  assert.deepEqual(cardCatalog(mi, u, 'all', 'びゅー').map((e) => e.card.id), ['view_std', 'view_gold']);
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

test('C07: マスタ検証で区分・会社・シリーズ・ランクのないカードを検出', () => {
  const bad = { ...master, cards: master.cards.map((c, i) => (i === 0 ? { ...c, segments: [], company: '', series: 'nope', tier: 'silver' } : c)) };
  const errs = validateMaster(bad as Master);
  assert.ok(errs.some((e) => e.includes('segments不正')));
  assert.ok(errs.some((e) => e.includes('カード会社なし')));
  assert.ok(errs.some((e) => e.includes('series不正')));
  assert.ok(errs.some((e) => e.includes('tier不正')));
  const orphan = { ...master, series: [...master.series, { id: 'empty', name: '空', kana: 'から', aliases: [] }] };
  assert.ok(validateMaster(orphan as Master).some((e) => e.includes('series empty: カードなし')));
  assert.deepEqual(validateMaster(master), []);
});

test('C08: 並び順はシリーズ名（英字→よみ順）→ランク（一般→ゴールド→プラチナ）→カード名（32.6）', () => {
  const list = cardCatalog(mi, own(), 'all');
  const series = [...new Set(list.map((e) => mi.series.get(e.card.series)!.name))];
  assert.deepEqual(series, [
    'Amazon Mastercard', 'ANAカード', 'au PAY カード', 'dカード', 'JALカード', 'JCBオリジナルシリーズ', 'Marriott Bonvoy アメックス', 'Olive', 'PayPayカード',
    'アメリカン・エキスプレス', 'イオンカード', 'エポスカード', 'セゾンカード', 'セブンカード・プラス', 'ビューカード', '三井住友カード（NL）', '三菱UFJカード',
    '楽天カード', 'リクルートカード', 'ローソンPontaプラス',
  ]);
  const ids = list.map((e) => e.card.id);
  assert.deepEqual(ids.filter((id) => mi.cards.get(id)!.series === 'smbc_nl'), ['smbc_nl', 'smbc_gold_nl', 'smbc_pp']);
  assert.deepEqual(ids.filter((id) => mi.cards.get(id)!.series === 'marriott'), ['marriott', 'marriott_premium']);
  assert.deepEqual(ids.filter((id) => mi.cards.get(id)!.series === 'dcard'), ['dcard', 'dcard_gold']);
  const sorted = [...master.cards].sort(compareCards(mi)).map((c) => c.id);
  assert.deepEqual(ids, sorted);
  assert.deepEqual(cardCatalog(mi, own(), 'popular').map((e) => e.card.id), sorted.filter((id) => mi.cards.get(id)!.segments.includes('popular')));
});

test('C09: シリーズ名・シリーズの別名・ランク名でも検索できる（32.6）', () => {
  const u = own();
  const ids = (q: string) => cardCatalog(mi, u, 'all', q).map((e) => e.card.id);
  const ana = ['ana_jcb_general', 'ana_visa_general', 'ana_jcb_wide_gold', 'ana_wide_gold'];
  assert.deepEqual(ids('ANA'), ana, 'ANAシリーズは一般→ゴールド');
  assert.deepEqual(ids('あな'), ana);
  assert.deepEqual(ids('ソラチカ'), ['ana_jcb_general'], 'ソラチカカードはANA JCB一般の別名');
  assert.deepEqual(ids('JCBオリジナル'), ['jcb_w', 'jcb_gold']);
  assert.deepEqual(ids('JAL'), ['jal_general', 'jal_club_a_gold']);
  assert.deepEqual(ids('マリオット'), ['marriott', 'marriott_premium']);
  assert.deepEqual(ids('プラチナ'), ['marriott_premium', 'olive_pp', 'epos_platinum', 'smbc_pp']);
  const gold = ids('ゴールド');
  assert.ok(gold.includes('marriott') && gold.includes('dcard_gold') && gold.includes('smbc_gold_nl'));
  assert.ok(gold.every((id) => mi.cards.get(id)!.tier === 'gold' || /ゴールド/.test(mi.cards.get(id)!.name)));
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

test('C10: ラインナップ第1弾・第2弾（32.3・32.4）：シリーズごとに一般とゴールド。マイル・永久不滅・MRの評価', () => {
  for (const x of master.series) {
    if (['amazon', 'recruit', 'marriott', 'lawson_ponta'].includes(x.id)) continue;
    const tiers = new Set(master.cards.filter((c) => c.series === x.id).map((c) => c.tier));
    assert.ok(tiers.has('general') && tiers.has('gold'), `${x.name}：一般とゴールド`);
  }
  assert.equal(mi.points.get('ana_mile')!.yenPerPoint, 1);
  assert.equal(mi.points.get('jal_mile')!.yenPerPoint, 1);
  assert.equal(mi.points.get('eikyu_point')!.yenPerPoint, 5);
  assert.equal(mi.points.get('amex_mr')!.yenPerPoint, 0.3);
  assert.equal(mi.points.has('ana_transfer_point'), false);
  assert.equal(mi.routes.get('ana_card')!.baseRate, 0.01, 'ANA VISAワイドゴールドは1マイル＝1円で1%');
  assert.ok(!mi.cards.has('rakuten_premium') && !mi.cards.has('jcb_platinum'), '率・ボーナスに差のない上位カードは入れない');
});

