/** 単体テスト: 集計・計算（CALC-01〜07） */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcGrossMarginRate,
  calcSimpleForecast,
  calcWeightedForecast,
  calcPlanVariance,
  calcAchievementRate,
  calcDaysSince,
  calcActionDelay,
  toYearMonth,
} from '../../src/calc.ts';

test('CALC-01 予定粗利率', () => {
  assert.equal(calcGrossMarginRate(1000, 120), 12);
  assert.equal(calcGrossMarginRate(1000, null), null);
  assert.equal(calcGrossMarginRate(0, 100), null);
  assert.equal(calcGrossMarginRate(333, 100), 30.03);
});

test('CALC-02 単純積上げ見込', () => {
  assert.equal(calcSimpleForecast([100, 200, null, 300]), 600);
  assert.equal(calcSimpleForecast([]), 0);
});

test('CALC-03 加重見込', () => {
  assert.equal(calcWeightedForecast([{ amount: 1000, weight: 0.5 }, { amount: 2000, weight: 1 }]), 2500);
  assert.equal(calcWeightedForecast([{ amount: null, weight: 0.5 }]), 0);
});

test('CALC-04 計画差異', () => {
  assert.equal(calcPlanVariance(80, 100), -20);
  assert.equal(calcPlanVariance(120, 100), 20);
});

test('CALC-05 計画達成見込率', () => {
  assert.equal(calcAchievementRate(80, 100), 80);
  assert.equal(calcAchievementRate(50, 0), null);
});

test('CALC-06 未更新日数', () => {
  const base = new Date('2026-08-16T00:00:00Z');
  assert.equal(calcDaysSince(new Date('2026-08-01T00:00:00Z'), base), 15);
  assert.equal(calcDaysSince(new Date('2026-08-20T00:00:00Z'), base), 0);
  assert.equal(calcDaysSince(null, base), null);
});

test('CALC-07 次回行動遅延日数', () => {
  const base = new Date('2026-08-16T00:00:00Z');
  assert.equal(calcActionDelay(new Date('2026-08-10T00:00:00Z'), base), 6);
  assert.equal(calcActionDelay(new Date('2026-08-20T00:00:00Z'), base), null);
  assert.equal(calcActionDelay(null, base), null);
});

test('受注予定月 YYYYMM', () => {
  assert.equal(toYearMonth('2026-08-15'), 202608);
  assert.equal(toYearMonth(null), null);
});
