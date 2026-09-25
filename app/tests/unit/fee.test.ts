import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../../src/data/rules.json' with { type: 'json' };
import { indexMaster, methodsForCard } from '../../src/domain/master';
import { annualNet, monthlySpendOf, ownedFeeReview, simulateAddCard } from '../../src/domain/simulate';
import type { Master, UserSettings } from '../../src/domain/types';

/** 見直すタブの年会費回収計算（詳細設計書（カード提案機能）10章） */
const mi = indexMaster(rules as unknown as Master);
const TODAY = '2026-09-22';
const RECENT = ['seven', 'mcdonalds', 'starbucks', 'lawson_threef', 'familymart'];
const owning = (ids: string[], extra: Partial<UserSettings> = {}): UserSettings => ({
  schemaVersion: 1, staleWarnDays: 180, enabledNonCardRoutes: [],
  ownedCards: ids.map((cardId, i) => ({ cardId, enabledMethods: methodsForCard(mi, cardId), priority: i + 1 })),
  bonusGoals: mi.raw.bonuses.map((b) => ({ bonusId: b.id, target: false })),
  ...extra,
});

test('F01: 計算例（楽天のみ・月5万円）', () => {
  const r = simulateAddCard(mi, owning(['rakuten']), RECENT, TODAY);
  const by = new Map(r.map((x) => [x.cardId, x.net]));
  assert.deepEqual(by.get('smbc_nl'), { gainYen: 28800, bonusYen: 0, feeYen: 0, netYen: 28800, breakEvenMonthlyYen: null, movedAnnualYen: 480000 });
  assert.deepEqual(by.get('smbc_gold_nl'), { gainYen: 28800, bonusYen: 0, feeYen: 5500, netYen: 23300, breakEvenMonthlyYen: 9600, movedAnnualYen: 480000 });
  assert.deepEqual(by.get('marriott_premium'), { gainYen: 12000, bonusYen: 0, feeYen: 82500, netYen: -70500, breakEvenMonthlyYen: 343800, movedAnnualYen: 600000 });
  assert.equal(r.find((x) => x.cardId === 'smbc_gold_nl')!.breakEvenMonthlyYen, 9600);
});

test('F02: 移る利用額が条件額以上でボーナスを加算', () => {
  assert.equal(annualNet(mi, 'smbc_gold_nl', 5 / 6, 0.01, 100_000).bonusYen, 10000);       // 100万円ちょうど
  assert.equal(annualNet(mi, 'smbc_gold_nl', 0.8333333, 0.01, 100_000).bonusYen, 0);       // 999,999円
  assert.equal(annualNet(mi, 'smbc_gold_nl', 0.1, 0.01, 10_000, true).bonusYen, 10000);    // 達成済み
});

test('F03: 並びは年間の損得順。利用額を変えると順位が変わる', () => {
  const low = simulateAddCard(mi, owning(['rakuten']), RECENT, TODAY, { monthlySpendYen: 50_000 }).map((x) => x.cardId);
  assert.equal(low.at(-1), 'marriott_premium');
  assert.ok(low.indexOf('smbc_nl') < low.indexOf('smbc_gold_nl'));
  const high = simulateAddCard(mi, owning(['rakuten']), RECENT, TODAY, { monthlySpendYen: 1_000_000 }).map((x) => x.cardId);
  assert.ok(high.indexOf('smbc_gold_nl') < high.indexOf('smbc_nl'));   // ボーナス10,000円が年会費を上回る
});

test('F04: 年会費0円は回収ライン null・損得は0以上', () => {
  for (const r of simulateAddCard(mi, owning(['rakuten']), RECENT, TODAY)) {
    if (r.annualFeeYen === 0) { assert.equal(r.breakEvenMonthlyYen, null); assert.ok(r.net.netYen >= 0); }
  }
});

test('F05: 持っているカード：年会費0円は対象外、1位のお店がなければ損得は−年会費', () => {
  const r = ownedFeeReview(mi, owning(['smbc_gold_nl', 'ana_wide_gold', 'rakuten']), RECENT, TODAY);
  assert.deepEqual(r.map((x) => x.cardId), ['ana_wide_gold', 'smbc_gold_nl']);
  assert.equal(r[0].bestStores.length, 0);
  assert.deepEqual(r[0].net, { gainYen: 0, bonusYen: 0, feeYen: 15400, netYen: -15400, breakEvenMonthlyYen: null, movedAnnualYen: 0 });
  assert.equal(r[1].bestStores.length, 4);
  assert.equal(r[1].net.netYen, 23300);
  assert.deepEqual(r[1].bestStores[0], { storeId: 'seven', beforeRate: 0.01, afterRate: 0.07 });
});

test('F06: 今期達成済みのボーナスは移る利用額によらず加算', () => {
  const u = owning(['smbc_gold_nl', 'rakuten']);
  u.bonusGoals = u.bonusGoals.map((g) => (g.bonusId === 'smbcg_1m' ? { ...g, achieved: true } : g));
  const r = ownedFeeReview(mi, u, RECENT, TODAY);
  assert.equal(r[0].bonusAchieved, true);
  assert.equal(r[0].net.netYen, 33300);
});

test('F07: 月の利用額の検査（範囲外・非整数・1万円単位でなければ既定値）', () => {
  const s = owning([]);
  assert.equal(monthlySpendOf(s), 50000);
  assert.equal(monthlySpendOf({ ...s, reviewMonthlySpendYen: 200000 }), 200000);
  for (const v of [0, 5000, 1_010_000, 15000, 12345.5]) assert.equal(monthlySpendOf({ ...s, reviewMonthlySpendYen: v }), 50000);
});
