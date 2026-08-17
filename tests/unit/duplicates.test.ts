/** 単体テスト: 重複候補判定（§10.1） */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, cjkSimilarity, scoreDuplicates, isDuplicateCandidate } from '../../src/duplicates.ts';

test('案件名の正規化', () => {
  assert.equal(normalizeName('九州圏 港湾改良工事（第一工区）'), '九州圏港湾改良工事'); // 括弧内は除去
  assert.equal(normalizeName('九州圏・港湾改良工事[第1工区]'), normalizeName('九州圏港湾改良工事'));
  assert.equal(normalizeName('ABC-１２３'), normalizeName('abc123'));
});

test('CJK 類似度', () => {
  assert.equal(cjkSimilarity('港湾改良工事', '港湾改良工事'), 1);
  assert.ok(cjkSimilarity('九州圏 港湾改良工事（第一工区）', '九州圏 港湾改良工事（第二工区）') > 0.5);
  assert.equal(cjkSimilarity('道路改修', 'マンション新築'), 0);
});

test('重複スコア: 同一発注者＋類似案件名', () => {
  const a = { customerCode: 'C-0001', customerName: '国交省', name: '九州圏 港湾改良工事（第一工区）', regionId: 'r1', workTypeId: 'w1', expectedOrderDate: '2026-11-15' };
  const b = { customerCode: 'C-0001', customerName: '国交省', name: '九州圏 港湾改良工事（第二工区）', regionId: 'r1', workTypeId: 'w1', expectedOrderDate: '2026-11-20' };
  const { score, matched } = scoreDuplicates(a, b);
  assert.ok(score >= 0.6, `score=${score} should be >= 0.6`);
  assert.ok(matched.includes('customer_code'));
  assert.ok(isDuplicateCandidate({ score, matched }, 0.6));
});

test('重複スコア: 別案件は候補にならない', () => {
  const a = { customerCode: 'C-0002', customerName: 'A社', name: '橋梁補修設計', regionId: 'r1', workTypeId: 'w2', expectedOrderDate: null };
  const b = { customerCode: 'C-0005', customerName: 'B社', name: 'マンション新築', regionId: 'r2', workTypeId: 'w3', expectedOrderDate: null };
  const { score } = scoreDuplicates(a, b);
  assert.ok(score < 0.6);
});

test('閾値判定', () => {
  assert.equal(isDuplicateCandidate({ score: 0.61, matched: [] }, 0.6), true);
  assert.equal(isDuplicateCandidate({ score: 0.5, matched: [] }, 0.6), false);
});
