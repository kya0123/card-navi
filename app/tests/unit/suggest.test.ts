import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../../src/data/rules.json' with { type: 'json' };
import affJson from '../../src/data/affiliates.json' with { type: 'json' };
import { indexMaster } from '../../src/domain/master';
import { defaultSettings } from '../../src/domain/settings';
import { addOwnedCard } from '../../src/domain/catalog';
import { bestUnownedAt, simulateAddCard } from '../../src/domain/simulate';
import {
  canShow, isShowingToday, markDismissed, markShown, markTapped, newSlot, preparePromo, warmedUp, newPromoState,
} from '../../src/domain/promo';
import { linkFor, validateAffiliates, type AffiliateMaster } from '../../src/domain/affiliate';
import { reviewItems } from '../../src/domain/review';
import type { Master, UserSettings } from '../../src/domain/types';

const master = rules as unknown as Master;
const mi = indexMaster(master);
const TODAY = '2026-09-22';
const EMPTY_AFF = affJson as unknown as AffiliateMaster;

/**
 * 提案の計算仕様（S01〜S07）は、候補を初期5枚に絞ったマスタで検証する（詳細設計 25.5）。
 * 全カードでの動きは S08・S09 と fee.test.ts で確認する
 */
const FIVE = new Set(['smbc_gold_nl', 'rakuten', 'ana_wide_gold', 'mufg', 'paypay_gold']);
const fullMi = mi;
const mi5 = (() => {
  const routes = master.routes.filter((r) => r.cardId === null || FIVE.has(r.cardId));
  const rids = new Set(routes.map((r) => r.id));
  return indexMaster({
    ...master, cards: master.cards.filter((c) => FIVE.has(c.id)), routes,
    bonuses: master.bonuses.filter((b) => FIVE.has(b.cardId)), rateRules: master.rateRules.filter((x) => rids.has(x.routeId)),
  });
})();
const ownAll = (m: typeof mi): UserSettings => m.raw.cards.reduce((s, c) => addOwnedCard(m, s, c.id), defaultSettings(m));
const only = (...ids: string[]): UserSettings => ids.reduce((s, id) => addOwnedCard(fullMi, s, id), defaultSettings(fullMi));
const RECENT = ['seven', 'mcdonalds', 'starbucks', 'lawson_threef', 'familymart'];

// ---------- シミュレーション ----------
test('S01: 全カード保有なら見直し結果は0件', () => {
  assert.deepEqual(simulateAddCard(mi5, ownAll(mi5), RECENT, TODAY), []);
});

test('S02: 楽天のみ保有：三井住友が4件で1位、三菱UFJが2件で続く', () => {
  const r = simulateAddCard(mi5, only('rakuten'), RECENT, TODAY);
  assert.deepEqual(r.map((x) => [x.cardId, x.improved.length]), [['smbc_gold_nl', 4], ['mufg', 2]]);
  assert.equal(r[0].totalStores, 5);
  assert.deepEqual(r[0].improved.map((d) => d.storeId), ['seven', 'mcdonalds', 'starbucks', 'lawson_threef']);
  assert.deepEqual(r[0].improved[0], { storeId: 'seven', beforeRate: 0.01, afterRate: 0.07 });
});

test('S03: 1万円あたり・年会費の回収ライン（100円切り上げ）・年会費0円はnull', () => {
  const r = simulateAddCard(mi5, only('rakuten'), RECENT, TODAY);
  const smbc = r.find((x) => x.cardId === 'smbc_gold_nl')!;
  assert.equal(smbc.per10kYen, 600);
  // 分冊10.3：回収ラインは月のカード利用額。5,500 ÷ (12 × 4/5 × 6%) = 9,548.6 → 9,600（旧定義は上がるお店での月額 7,700）
  assert.equal(smbc.breakEvenMonthlyYen, 9600);
  assert.equal(smbc.annualFeeYen, 5500);
  assert.match(smbc.bonusNote!, /1,000,000円の利用で10,000円相当/);
  const mufg = r.find((x) => x.cardId === 'mufg')!;
  assert.equal(mufg.breakEvenMonthlyYen, null);
  assert.equal(mufg.bonusNote, null);
});

test('S04: 差がちょうど2ポイントは含み、未満は除外', () => {
  // 楽天1%→三井住友7%（差6pt）。minDeltaを6ptちょうど・6.01ptで確認
  assert.equal(simulateAddCard(mi5, only('rakuten'), ['seven'], TODAY, { minDelta: 0.06 }).length, 2);
  assert.equal(simulateAddCard(mi5, only('rakuten'), ['seven'], TODAY, { minDelta: 0.0601 }).length, 0);
  // 既定の2pt：ファミマは楽天1%→PayPayゴールド1%で差0 → 対象外
  assert.equal(simulateAddCard(mi5, only('rakuten'), ['familymart'], TODAY).length, 0);
});

test('S05: 並び順は年間の損得 → 件数 → 1万円あたり → カードID', () => {
  // セブンとスタバだけなら両方2件・600円。年会費のない三菱UFJ（＋36,000円）が三井住友ゴールド（＋30,500円）より先
  const r = simulateAddCard(mi5, only('rakuten'), ['seven', 'starbucks'], TODAY);
  assert.deepEqual(r.map((x) => x.cardId), ['mufg', 'smbc_gold_nl']);
});

test('S06: bestUnownedAt は3ポイント未満なら null、同率はカードID順', () => {
  assert.equal(bestUnownedAt(mi5, only('rakuten'), 'familymart', TODAY), null);
  const seven = bestUnownedAt(mi5, only('rakuten'), 'seven', TODAY)!;
  assert.equal(seven.cardId, 'mufg');
  assert.equal(seven.afterRate, 0.07);
  assert.equal(bestUnownedAt(mi5, only('rakuten'), 'mcdonalds', TODAY)!.cardId, 'smbc_gold_nl');
  assert.equal(bestUnownedAt(mi5, ownAll(mi5), 'seven', TODAY), null);
  assert.equal(bestUnownedAt(mi5, only('rakuten'), 'nope', TODAY), null);
});

test('S07: ボーナスを狙っていても比較はボーナス加算なし', () => {
  const u = only('rakuten', 'smbc_gold_nl');
  u.ownedCards[1].joinYm = '2024-04';
  u.bonusGoals = [{ bonusId: 'smbcg_1m', target: true, progressYen: 0 }];
  // オーケー：三井住友0.5%(+1.55%) / 楽天1% → 追加の三菱UFJ 7% は差6pt（ボーナス込みの比較なら5.45pt）
  const r = simulateAddCard(mi5, u, ['ok'], TODAY);
  assert.deepEqual(r[0].improved[0], { storeId: 'ok', beforeRate: 0.01, afterRate: 0.07 });
});

// ---------- 表示タイミング ----------
test('P01: 未表示なら出せる。表示した日の翌日は出せない', () => {
  const s = newSlot();
  assert.equal(canShow(s, 'a', TODAY), true);
  const shown = markShown(s, 'a', TODAY);
  assert.equal(shown.intervalDays, 7);
  assert.equal(canShow(shown, 'a', '2026-09-23'), false);
  assert.equal(canShow(shown, 'a', '2026-09-29'), true);
});

test('P02: A：反応がなければ 7→14→30 と広がり30で止まる。タップで7に戻る', () => {
  let s = markShown(newSlot(), 'a', '2026-01-01');
  s = markShown(s, 'a', '2026-01-08'); assert.equal(s.intervalDays, 14);
  assert.equal(canShow(s, 'a', '2026-01-21'), false);
  assert.equal(canShow(s, 'a', '2026-01-22'), true);
  s = markShown(s, 'a', '2026-01-22'); assert.equal(s.intervalDays, 30);
  s = markShown(s, 'a', '2026-02-21'); assert.equal(s.intervalDays, 30);
  s = markTapped(s); assert.equal(s.intervalDays, 7);
  s = markShown(s, 'a', '2026-03-01'); assert.equal(s.intervalDays, 7); // タップ後の表示は広げない
});

test('P03: B：内容が変われば間隔14・30でも7日で出せる', () => {
  let s = markShown(newSlot(), 'a', '2026-01-01');
  s = markShown(s, 'a', '2026-01-08');
  s = markShown(s, 'a', '2026-01-22'); // 間隔30
  assert.equal(canShow(s, 'a', '2026-01-29'), false);
  assert.equal(canShow(s, 'b', '2026-01-28'), false);
  assert.equal(canShow(s, 'b', '2026-01-29'), true);
});

test('P04: ×：60日間はBや早めのきっかけがあっても出さず、以後は間隔30', () => {
  let s = markShown(newSlot(), 'a', '2026-01-01');
  s = markDismissed(s, '2026-01-01');
  assert.equal(s.dismissedUntil, '2026-03-02');
  assert.equal(canShow({ ...s, pendingEarly: 'rollover' }, 'b', '2026-03-01'), false);
  assert.equal(canShow(s, 'a', '2026-03-02'), true); // 60日後：前回表示から60日 ≥ 30
  s = markShown(s, 'a', '2026-03-02');
  assert.equal(s.intervalDays, 30);
});

test('P05: 早めのきっかけ：繰り越しは翌日から、ルール更新は内容が変わった場合のみ', () => {
  const s = markShown(newSlot(), 'a', '2026-01-01');
  assert.equal(canShow({ ...s, pendingEarly: 'rollover' }, 'a', '2026-01-01'), false);
  assert.equal(canShow({ ...s, pendingEarly: 'rollover' }, 'a', '2026-01-02'), true);
  assert.equal(canShow({ ...s, pendingEarly: 'master' }, 'a', '2026-01-02'), false);
  assert.equal(canShow({ ...s, pendingEarly: 'master' }, 'b', '2026-01-02'), true);
  assert.equal(markShown({ ...s, pendingEarly: 'rollover' }, 'a', '2026-01-02').pendingEarly, undefined);
});

test('P06: preparePromo：初回起動日・最近にないお店の削除・きっかけの設定', () => {
  const p0 = preparePromo(undefined, TODAY, 'v1', [], false);
  assert.equal(p0.firstLaunchAt, TODAY);
  assert.equal(warmedUp(p0, '2026-10-05'), false);
  assert.equal(warmedUp(p0, '2026-10-06'), true);
  const p1 = preparePromo({ ...p0, hint: { seven: newSlot(), ok: newSlot() } }, TODAY, 'v2', ['seven'], false);
  assert.deepEqual(Object.keys(p1.hint), ['seven']);
  assert.equal(p1.banner.pendingEarly, 'master');
  assert.equal(p1.masterVersion, 'v2');
  assert.equal(preparePromo(p1, TODAY, 'v2', ['seven'], true).banner.pendingEarly, 'rollover');
  assert.equal(newPromoState(TODAY).hint && Object.keys(newPromoState(TODAY).hint).length, 0);
});

test('P07: isShowingToday：同じ日は出し続け、タップ・×の後は消える', () => {
  const s = markShown(newSlot(), 'a', TODAY);
  assert.equal(isShowingToday(s, TODAY), true);
  assert.equal(isShowingToday(s, '2026-09-23'), false);
  assert.equal(isShowingToday(markTapped(s), TODAY), false);
  assert.equal(isShowingToday(markDismissed(s, TODAY), TODAY), false);
});

// ---------- アフィリエイト ----------
const aff = (links: Partial<AffiliateMaster['links'][number]>[]): AffiliateMaster => ({
  schemaVersion: 1, version: 't',
  links: links.map((l) => ({ cardId: 'mufg', url: 'https://px.example/a', asp: 'a8', label: 'PR', validFrom: null, validTo: null, checkedAt: TODAY, ...l })),
});

test('A01: 期間内のアフィリエイトリンクはPR、期間外は公式サイト', () => {
  const a = aff([{ validFrom: '2026-09-01', validTo: '2026-09-30' }]);
  assert.deepEqual(linkFor(mi, a, 'mufg', TODAY), { url: 'https://px.example/a', pr: true });
  assert.deepEqual(linkFor(mi, a, 'mufg', '2026-10-01'), { url: 'https://www.cr.mufg.jp/apply/card/mucard/index.html', pr: false });
  assert.deepEqual(linkFor(mi, EMPTY_AFF, 'smbc_gold_nl', TODAY)?.pr, false);
});

test('A02: 公式サイトもなければ null', () => {
  const m = structuredClone(master);
  delete m.cards[0].officialUrl;
  assert.equal(linkFor(indexMaster(m), EMPTY_AFF, m.cards[0].id, TODAY), null);
});

test('A03: validateAffiliates：同梱ファイルは正常、未知のカード・http・ラベルを検出', () => {
  assert.deepEqual(validateAffiliates(mi, EMPTY_AFF), []);
  const errs = validateAffiliates(mi, aff([{ cardId: 'nope' }, { url: 'http://x' }, { label: 'AD' as 'PR' }, { validTo: '2026-13-01' }]));
  assert.equal(errs.length, 4);
});

test('N01: 中立性：アフィリエイトリンクの有無で見直し結果の順位は変わらない', () => {
  const u = only('rakuten');
  const plain = reviewItems(mi, EMPTY_AFF, u, RECENT, TODAY).map((x) => x.cardId);
  const withLink = reviewItems(mi, aff([{ cardId: 'mufg' }]), u, RECENT, TODAY);
  assert.deepEqual(withLink.map((x) => x.cardId), plain);
  assert.equal(withLink.find((x) => x.cardId === 'mufg')!.link!.pr, true);
  assert.equal(withLink.find((x) => x.cardId === 'smbc_gold_nl')!.link!.pr, false);
});
