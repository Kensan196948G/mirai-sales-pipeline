/**
 * 単体テスト: ハッシュルートパーサー（新規登録/詳細/編集のルート解決）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../../web/src/router.tsx';

test('ルートパスは dashboard', () => {
  assert.deepEqual(parseRoute('/'), { key: '/', raw: '/', isEdit: false });
});

test('新規登録は詳細マッチに誤解釈されない', () => {
  const r = parseRoute('/opportunities/new');
  assert.equal(r.key, '/opportunities/new');
  assert.equal(r.code, undefined);
});

test('案件詳細は code を持つ', () => {
  const r = parseRoute('/opportunities/OPP-0001001');
  assert.equal(r.key, '/opportunities/detail');
  assert.equal(r.code, 'OPP-0001001');
  assert.equal(r.isEdit, false);
});

test('案件編集は isEdit=true', () => {
  const r = parseRoute('/opportunities/OPP-0001001/edit');
  assert.equal(r.key, '/opportunities/edit');
  assert.equal(r.code, 'OPP-0001001');
  assert.equal(r.isEdit, true);
});

test('空パスはルートへ', () => {
  assert.equal(parseRoute('').key, '/');
});
