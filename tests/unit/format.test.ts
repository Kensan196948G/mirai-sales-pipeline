/**
 * 単体テスト: 表示フォーマット（Neon HTTP SQL が numeric を文字列で返すケース）
 * - yen / yenShort / yenUnit / pct は number | string | null を正しく扱う
 * - null / NaN / 非数値は '-' を返す（クラッシュしない）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yen, yenShort, yenUnit, pct } from '../../web/src/format.ts';

test('yen: 数値・数値文字列の両方をフォーマットできる', () => {
  assert.equal(yen(1200000000), '1,200,000,000 円');
  assert.equal(yen('1200000000'), '1,200,000,000 円');
  assert.equal(yen(0), '0 円');
});

test('yen: null/undefined/非数値は "-"', () => {
  assert.equal(yen(null), '-');
  assert.equal(yen(undefined), '-');
  assert.equal(yen('abc'), '-');
});

test('yenShort: 億/万の省略表記', () => {
  assert.equal(yenShort(1200000000), '12.0 億');
  assert.equal(yenShort('1200000000'), '12.0 億');
  assert.equal(yenShort(50000000), '5000 万');
  assert.equal(yenShort(null), '-');
});

test('yenUnit: 値と単位を分離', () => {
  assert.deepEqual(yenUnit(1200000000), { value: '12.0', unit: '億' });
  assert.deepEqual(yenUnit('1200000000'), { value: '12.0', unit: '億' });
  assert.deepEqual(yenUnit(50000000), { value: '5000', unit: '万' });
  assert.deepEqual(yenUnit(null), { value: '-', unit: '' });
});

test('pct: 数値文字列でも toFixed でクラッシュしない', () => {
  assert.equal(pct(8), '8.0%');
  assert.equal(pct('8.00'), '8.0%');
  assert.equal(pct('33.3333'), '33.3%');
  assert.equal(pct(null), '-');
  assert.equal(pct(undefined), '-');
});
