/**
 * 統合テスト: MVP 公開デモ用のログイン認証バイパス（実 Neon DB を使用。要 .env の DATABASE_URL）
 * - 既定（AUTH_BYPASS 未設定）は未ログインで 401
 * - AUTH_BYPASS='true' かつ ENVIRONMENT != production なら未ログインでも /api/auth/me が 200
 * - ENVIRONMENT='production' では AUTH_BYPASS='true' でも必ず 401（安全装置）
 * - 存在しない AUTH_BYPASS_EMAIL はフェイルクローズ
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../src/app.ts';

let baseEnv: Record<string, string>;
let app: ReturnType<typeof createApp>;

function loadEnv() {
  const envFile = join(process.cwd(), '.env');
  if (!existsSync(envFile)) throw new Error('.env がありません。統合テストには DATABASE_URL が必要です');
  const out: Record<string, string> = {};
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] && m[2]) out[m[1]] = m[2];
  }
  return out;
}

/** Cookie を付けずに /api/auth/me を叩く */
async function anonMe(envOverrides: Record<string, string>) {
  const env = { ...baseEnv, ...envOverrides };
  const res = await app.fetch(
    new Request('http://test.local/api/auth/me', { headers: { host: 'test.local' } }),
    env,
  );
  return res;
}

before(() => {
  const env = loadEnv();
  baseEnv = { ...env, DATABASE_URL: env.DATABASE_URL_TEST ?? env.DATABASE_URL! };
  app = createApp();
});

test('既定（AUTH_BYPASS 未設定）では未ログインは 401', async () => {
  const res = await anonMe({ ENVIRONMENT: 'mvp' });
  assert.equal(res.status, 401);
});

test('AUTH_BYPASS=true / ENVIRONMENT=mvp なら未ログインでも 200', async () => {
  const res = await anonMe({ ENVIRONMENT: 'mvp', AUTH_BYPASS: 'true' });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user?: { role?: string } };
  assert.equal(body.user?.role, 'admin');
});

test('AUTH_BYPASS_EMAIL で成りすまし先を切り替えられる', async () => {
  const res = await anonMe({ ENVIRONMENT: 'mvp', AUTH_BYPASS: 'true', AUTH_BYPASS_EMAIL: 'viewer@mirai.local' });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user?: { email?: string } };
  assert.equal(body.user?.email, 'viewer@mirai.local');
});

test('ENVIRONMENT=production では AUTH_BYPASS=true でも 401（安全装置）', async () => {
  const res = await anonMe({ ENVIRONMENT: 'production', AUTH_BYPASS: 'true' });
  assert.equal(res.status, 401);
});

test('存在しない AUTH_BYPASS_EMAIL はフェイルクローズ', async () => {
  const res = await anonMe({ ENVIRONMENT: 'mvp', AUTH_BYPASS: 'true', AUTH_BYPASS_EMAIL: 'nobody@example.invalid' });
  assert.equal(res.status, 401);
});
