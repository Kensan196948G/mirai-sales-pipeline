/**
 * ユニットテスト: requireRole / requireHQ のロール判定（DB 不要）
 * - admin は常に許可（roles に 'admin' を含む場合を含む）
 * - 指定ロール未満は 403（FORBIDDEN）
 * - 指定ロール以上（ROLE_RANK 比較）は許可
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole, requireHQ } from '../../src/middleware.ts';
import type { Context } from 'hono';
import type { AuthUser, AppEnv } from '../../src/types.ts';

function user(role: string): AuthUser {
  return { id: 'u1', email: `${role}@test.local`, display_name: role, role, org_id: 'o1', org_code: 'HQ', org_name: '営業本部', org_type: 'hq' } as AuthUser;
}

async function call(mw: ReturnType<typeof requireRole>, u: AuthUser | null): Promise<'allowed' | 'blocked'> {
  const ctx = { get: (k: string) => (k === 'user' ? u : undefined) } as unknown as Context<AppEnv>;
  try {
    await mw(ctx, async () => {});
    return 'allowed';
  } catch {
    return 'blocked';
  }
}

test('未ログインは常に拒否', async () => {
  assert.equal(await call(requireRole('viewer'), null), 'blocked');
});

test('admin は requireRole("admin") を通過する', async () => {
  assert.equal(await call(requireRole('admin'), user('admin')), 'allowed');
});

test('viewer は requireRole("admin") で拒否される（admin を含む role リストでチェックがスキップされない）', async () => {
  assert.equal(await call(requireRole('admin'), user('viewer')), 'blocked');
});

test('sales は requireRole("admin") で拒否される', async () => {
  assert.equal(await call(requireRole('admin'), user('sales')), 'blocked');
});

test('requireHQ: admin / hq は通過、sales は拒否', async () => {
  assert.equal(await call(requireHQ(), user('admin')), 'allowed');
  assert.equal(await call(requireHQ(), user('hq')), 'allowed');
  assert.equal(await call(requireHQ(), user('sales')), 'blocked');
});

test('requireRole("hq"): admin は通過、manager は拒否', async () => {
  assert.equal(await call(requireRole('hq'), user('admin')), 'allowed');
  assert.equal(await call(requireRole('hq'), user('hq')), 'allowed');
  assert.equal(await call(requireRole('hq'), user('manager')), 'blocked');
});

test('requireRole("manager","hq"): sales は拒否、manager は通過', async () => {
  assert.equal(await call(requireRole('manager', 'hq'), user('sales')), 'blocked');
  assert.equal(await call(requireRole('manager', 'hq'), user('manager')), 'allowed');
});

test('requireRole("sales","manager","hq"): viewer は拒否、sales は通過', async () => {
  assert.equal(await call(requireRole('sales', 'manager', 'hq'), user('viewer')), 'blocked');
  assert.equal(await call(requireRole('sales', 'manager', 'hq'), user('sales')), 'allowed');
});
