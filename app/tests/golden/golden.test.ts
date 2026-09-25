import { test } from 'node:test';
import assert from 'node:assert/strict';
import golden from './golden_cases.json' with { type: 'json' };
import rules from '../../src/data/rules.json' with { type: 'json' };
import { indexMaster } from '../../src/domain/master';
import { recommend } from '../../src/domain/engine';
import { bonusPeriod, goalStatus, periodFor } from '../../src/domain/bonus';
import type { Master, UserSettings } from '../../src/domain/types';

const mi = indexMaster(rules as unknown as Master);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('golden: マスタ版数が一致', () => {
  assert.equal(golden.masterVersion, (rules as Master).masterVersion);
});

for (const c of golden.cases) {
  test(`golden ${c.id}: ${c.desc}`, () => {
    const { user, store_id, category_id, amount } = c.input as any;
    const u: UserSettings = { schemaVersion: 1, staleWarnDays: 180, ...user };
    const res = recommend(mi, u, { storeId: store_id, categoryId: category_id, amountYen: amount }, golden.today);
    const exp = c.expected as any;
    assert.equal(res.top.length, exp.top.length, 'top件数');
    exp.top.forEach((e: any, i: number) => {
      const a = res.top[i];
      assert.equal(a.cardId, e.cardId, `#${i + 1} cardId`);
      assert.deepEqual(a.methodIds, e.methodIds, `#${i + 1} methodIds`);
      assert.deepEqual(a.routeIds, e.routeIds, `#${i + 1} routeIds`);
      assert.equal(a.rateSource, e.rateSource, `#${i + 1} rateSource`);
      assert.ok(close(a.rate, e.rate), `#${i + 1} rate ${a.rate} != ${e.rate}`);
      assert.ok(close(a.bonusRate, e.bonusRate), `#${i + 1} bonusRate ${a.bonusRate} != ${e.bonusRate}`);
      assert.ok(close(a.effectiveRate, e.effectiveRate), `#${i + 1} effectiveRate`);
      assert.equal(a.earnedYen, e.earnedYen, `#${i + 1} earnedYen`);
      assert.equal(a.earnedApprox, e.earnedApprox, `#${i + 1} earnedApprox`);
    });
    const got = res.pointPay ? [...res.pointPay].sort() : null;
    assert.deepEqual(got, exp.pointPay, 'pointPay');
  });
}

for (const p of golden.periodCases) {
  test(`period ${p.id}: 入会${p.joinYm} offset${p.offset} 今日${p.today}`, () => {
    assert.deepEqual(bonusPeriod(p.joinYm, p.offset, p.today), { start: p.expectedStart, end: p.expectedEnd });
  });
}

for (const q of (golden as any).periodForCases ?? []) {
  test(`periodFor ${q.id}: ${q.bonusId} 入会${q.joinYm ?? 'なし'} 今日${q.today}`, () => {
    const b = mi.bonuses.get(q.bonusId)!;
    assert.deepEqual(periodFor(b, q.joinYm ?? undefined, q.today), { start: q.expectedStart, end: q.expectedEnd, first: q.expectedFirst });
  });
}

test('goalStatus: 参照実装のサンプルと一致', () => {
  const g = golden.goalStatusCase;
  const bonus = mi.bonuses.get('smbcg_1m')!;
  const st = goalStatus(bonus, { bonusId: 'smbcg_1m', target: true, progressYen: g.input.progressYen },
    { cardId: 'smbc_gold_nl', joinYm: g.input.joinYm, enabledMethods: [], priority: 1 }, g.input.today);
  assert.equal(st.state, g.expected.state);
  assert.equal(st.start, g.expected.start);
  assert.equal(st.deadline, g.expected.deadline);
  assert.equal(st.remainingYen, g.expected.remainingYen);
  assert.equal(st.monthsLeft, g.expected.monthsLeft);
  assert.equal(st.requiredMonthlyYen, g.expected.requiredMonthlyYen);
  assert.equal(st.firstPeriod, (g.expected as any).firstPeriod);
});
