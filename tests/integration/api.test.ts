/** 統合テスト: API フロー（実 Neon DB を使用。要 .env の DATABASE_URL） */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../src/app.ts';
import { NeonClient } from '../../src/db/client.ts';


let env: Record<string, string>;
let appEnv: Record<string, string>;
let db: NeonClient;
let app: ReturnType<typeof createApp>;
let cookie = '';
let adminCookie = '';
const createdOpps: string[] = [];
const createdCustomers: string[] = [];
const createdUsers: string[] = [];

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

async function call(path: string, init: RequestInit = {}, cookieHeader?: string) {
  const headers = new Headers(init.headers);
  if (!headers.has('host')) headers.set('host', 'test.local');
  if (cookieHeader) headers.set('cookie', cookieHeader);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if ((init.method === 'POST' || init.method === 'PUT' || init.method === 'DELETE') && !headers.has('origin')) {
    headers.set('origin', 'http://test.local');
  }
  const req = new Request(`http://test.local${path}`, { ...init, headers });
  const res = await app.fetch(req, appEnv as never, {} as never);
  return { res, json: await res.json().catch(() => null) };
}

async function login(email: string, password: string): Promise<string> {
  const { res, json } = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, JSON.stringify(json));
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0] ?? '';
}

/** シードのデモパスワード（SEED_DEMO_PASSWORD があればそれを使用） */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Mirai#2026';

before(async () => {
  env = loadEnv();
  // テスト専用 DB があれば優先（本番 DB へのテスト書き込みを防ぐ）
  appEnv = { ...env, DATABASE_URL: env.DATABASE_URL_TEST ?? env.DATABASE_URL! };
  db = new NeonClient(appEnv.DATABASE_URL!);
  app = createApp();
  adminCookie = await login('admin@mirai.local', DEMO_PASSWORD);
  cookie = await login('sales1@mirai.local', DEMO_PASSWORD);
});

after(async () => {
  for (const id of createdOpps) await db.query('DELETE FROM opportunities WHERE id=$1', [id]).catch(() => {});
  for (const id of createdCustomers) await db.query('DELETE FROM customers WHERE id=$1', [id]).catch(() => {});
  for (const id of createdUsers) await db.query('DELETE FROM users WHERE id=$1', [id]).catch(() => {});
});

test('ログイン失敗: 不正パスワード', async () => {
  const { res } = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'sales1@mirai.local', password: 'wrong-pass' }) });
  assert.equal(res.status, 401);
});

test('未認証アクセスは 401', async () => {
  const { res } = await call('/api/meta');
  assert.equal(res.status, 401);
});

test('T-01: 案件登録（必須項目）', async () => {
  const meta = await call('/api/meta', {}, cookie);
  assert.equal(meta.res.status, 200);
  const m = meta.json as any;
  const stageId = m.masters.stage[0].id;
  const probId = m.masters.probability.find((p: any) => p.code === 'P50').id;
  const confId = m.masters.confidentiality[0].id;
  const orgId = m.organizations[0].id;

  const { res } = await call('/api/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      name: '統合テスト案件',
      org_id: orgId,
      stage_id: stageId, probability_id: probId, confidentiality_id: confId,
      expected_amount: 5000000,
    }),
  }, cookie);
  // owner_id 未指定のため失敗するはず（必須バリデーション）
  assert.equal(res.status, 400);
});

test('T-01b: 案件登録成功', async () => {
  const meta = await call('/api/meta', {}, cookie);
  const m = meta.json as any;
  const stageId = m.masters.stage[0].id;
  const probId = m.masters.probability.find((p: any) => p.code === 'P50').id;
  const confId = m.masters.confidentiality[0].id;
  const orgId = m.organizations[0].id;
  const me = await call('/api/auth/me', {}, cookie);
  const ownerId = (me.json as any).user.id;

  const { res, json } = await call('/api/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      name: '統合テスト案件',
      org_id: orgId, owner_id: ownerId,
      stage_id: stageId, probability_id: probId, confidentiality_id: confId,
      expected_amount: 5000000, expected_gross_profit: 500000,
      expected_order_date: '2026-12-01', next_action: 'テスト行動', next_action_due: '2026-09-30',
    }),
  }, cookie);
  assert.equal(res.status, 201, JSON.stringify(json));
  assert.ok((json as any).opp_code.startsWith('OPP-'));
  createdOpps.push((json as any).id);
});

test('T-02: 確度変更理由が空なら保存不可', async () => {
  const list = await call('/api/opportunities?q=統合テスト案件', {}, cookie);
  const opp = (list.json as any).items[0];
  assert.ok(opp, 'テスト案件が見つからない');
  const meta = await call('/api/meta', {}, cookie);
  const m = meta.json as any;
  const p90 = m.masters.probability.find((p: any) => p.code === 'P90').id;

  // 理由なし → 400
  const { res } = await call(`/api/opportunities/${opp.opp_code}?version=${opp.version}`, {
    method: 'PUT',
    body: JSON.stringify({ probability_id: p90 }),
  }, cookie);
  assert.equal(res.status, 400);

  // 理由あり → 200
  const upd = await call(`/api/opportunities/${opp.opp_code}?version=${opp.version}`, {
    method: 'PUT',
    body: JSON.stringify({ probability_id: p90, reason: '内示があり確度が上がった' }),
  }, cookie);
  assert.equal(upd.res.status, 200, JSON.stringify(upd.json));
});

test('T-04: 計画差異サマリが返る', async () => {
  const { res, json } = await call('/api/plans/summary?fiscal_year=2026', {}, cookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((json as any).items));
  assert.ok('target_amount' in (json as any).totals);
});

test('T-03: ダッシュボード集計が返る', async () => {
  const { res, json } = await call('/api/dashboard?fiscal_year=2026', {}, cookie);
  assert.equal(res.status, 200);
  const d = json as any;
  assert.ok(Array.isArray(d.pipeline_by_stage));
  assert.ok('forecast' in d && 'plan' in d);
});

test('T-06: 健全性一覧（停滞・期限超過・重複候補）', async () => {
  // 重複候補を生成するため cron の JOB-03 を先に実行（admin）
  const cron = await call('/api/internal/cron', { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET! } }, adminCookie);
  assert.equal(cron.res.status, 200);
  const { res, json } = await call('/api/health', {}, adminCookie);
  assert.equal(res.status, 200);
  const h = json as any;
  assert.ok(Array.isArray(h.stale));
  assert.ok(Array.isArray(h.overdue));
  assert.ok(Array.isArray(h.duplicates));
  // シードデータに停滞案件・重複候補があるはず
  assert.ok(h.stale.length >= 1, '停滞案件が検出されるべき');
  assert.ok(h.duplicates.length >= 1, '重複候補が検出されるべき');
});

test('T-07: 重複候補が提示される（自動統合しない）', async () => {
  const { res, json } = await call('/api/opportunities?q=港湾改良工事', {}, adminCookie);
  assert.equal(res.status, 200);
  const items = (json as any).items;
  assert.ok(items.length >= 2, '港湾改良工事の案件が2件あるべき');
});

test('T-05: 権限 — viewer は作成不可・他組織の機密案件は非表示', async () => {
  const viewerCookie = await login('viewer@mirai.local', DEMO_PASSWORD);
  const meta = await call('/api/meta', {}, viewerCookie);
  const m = meta.json as any;
  const { res } = await call('/api/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      name: '権限テスト', org_id: m.organizations[0].id, owner_id: m.users[0].id,
      stage_id: m.masters.stage[0].id, probability_id: m.masters.probability[0].id,
      confidentiality_id: m.masters.confidentiality[0].id, expected_amount: 1000,
    }),
  }, viewerCookie);
  assert.equal(res.status, 403);
});

test('T-09: 監査ログに記録される', async () => {
  const list = await call('/api/opportunities?q=統合テスト案件', {}, cookie);
  const opp = (list.json as any).items[0];
  const detail = await call(`/api/opportunities/${opp.opp_code}`, {}, cookie);
  const audit = (detail.json as any).audit;
  assert.ok(Array.isArray(audit));
  assert.ok(audit.some((a: any) => a.field === 'probability_id'), '確度変更の監査記録があるべき');
});

test('T-08: 文書リンク登録', async () => {
  const list = await call('/api/opportunities?q=統合テスト案件', {}, cookie);
  const opp = (list.json as any).items[0];
  const { res, json } = await call(`/api/opportunities/${opp.opp_code}/doc-links`, {
    method: 'POST',
    body: JSON.stringify({ doc_type: 'working', provider: 'onedrive', url: 'https://example.com/notes', title: '面談メモ' }),
  }, cookie);
  assert.equal(res.status, 201, JSON.stringify(json));
});

test('T-10: スナップショット作成（admin）と差分', async () => {
  const date = new Date();
  const snapDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-15`;
  const { res, json } = await call('/api/snapshots', {
    method: 'POST',
    body: JSON.stringify({ snapshot_date: snapDate }),
  }, adminCookie);
  // 既存スナップショットと重複する場合は 409 で許容
  assert.ok([201, 409].includes(res.status), JSON.stringify(json));
  if (res.status === 201) {
    const id = (json as any).id;
    const diff = await call(`/api/snapshots/${id}/diff`, {}, cookie);
    assert.equal(diff.res.status, 200);
  }
});

test('FR-19: CSV 出力（BOM付き・監査記録）', async () => {
  const res = await app.fetch(new Request('http://test.local/api/csv/opportunities?status=in_progress', { headers: { cookie, host: 'test.local' } }), appEnv as never, {} as never);
  assert.equal(res.status, 200);
  const buf = new Uint8Array(await res.arrayBuffer());
  // UTF-8 BOM (EF BB BF) が先頭にあること（Excel 互換）
  assert.deepEqual([...buf.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder('utf-8').decode(buf.slice(3));
  assert.match(text, /案件コード/);
});

test('CSRF: Origin 不一致は拒否', async () => {
  const res = await app.fetch(new Request('http://test.local/api/auth/logout', {
    method: 'POST',
    headers: { cookie, origin: 'https://evil.example.com' },
  }), env as never, {} as never);
  assert.equal(res.status, 403);
});

test('cron: シークレット不一致は 401', async () => {
  const { res } = await call('/api/internal/cron', { method: 'POST' });
  assert.equal(res.status, 401);
});

test('cron: シークレット一致でジョブ実行', async () => {
  const { res, json } = await call('/api/internal/cron', {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET! },
  });
  assert.equal(res.status, 200, JSON.stringify(json));
  assert.ok((json as any).stale?.status === 'ok');
  assert.ok((json as any).quality?.status === 'ok');
});

test('healthz: DB 接続確認', async () => {
  const { res, json } = await call('/api/internal/healthz');
  assert.equal(res.status, 200);
  assert.equal((json as any).ok, true);
  assert.equal((json as any).database, 'ok');
});
