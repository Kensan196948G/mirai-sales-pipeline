/** 内部 API（cron 実行・ヘルスチェック） */
import { Hono } from 'hono';
import { runDailyJobs } from '../jobs.ts';
import { Errors } from '../errors.ts';
import type { AppEnv } from '../types.ts';

export const internalRoutes = new Hono<AppEnv>();

/** ヘルスチェック（公開） */
internalRoutes.get('/healthz', async (c) => {
  const db = c.get('db');
  let dbOk = false;
  let version = 'unknown';
  try {
    const r = await db.query('SELECT 1 AS ok, version() AS v');
    dbOk = true;
    version = String((r.rows[0] as any)?.v ?? 'unknown').split(' on ')[0] ?? 'unknown';
  } catch {
    dbOk = false;
  }
  return c.json({
    ok: dbOk,
    app: c.env.APP_NAME ?? 'mirai-sales-pipeline',
    environment: c.env.ENVIRONMENT ?? 'production',
    database: dbOk ? 'ok' : 'error',
    postgres: version,
    time: new Date().toISOString(),
  });
});

/** 定期処理実行（X-Cron-Secret ヘッダー必須） */
internalRoutes.post('/cron', async (c) => {
  const secret = c.req.header('x-cron-secret');
  if (!secret || secret !== c.env.CRON_SECRET) throw Errors.unauthorized('cron secret が一致しません');
  const results = await runDailyJobs(c.get('db'));
  return c.json(results);
});
