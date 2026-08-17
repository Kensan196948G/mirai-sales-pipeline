/** 顧客・マスター・メタ・ダッシュボード・健全性・スナップショット・監査・通知・管理ルート */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { customerSchema, masterSchema, userCreateSchema, userUpdateSchema } from '../validation.ts';
import { Errors } from '../errors.ts';
import { requireHQ, requireRole } from '../middleware.ts';
import { writeAudit } from '../audit.ts';
import { hashPassword } from '../auth.ts';
import { calcDaysSince, calcActionDelay } from '../calc.ts';
import { visibleOrgIds, fetchOrgTree } from '../permissions.ts';
import { fiscalYearRange } from './plans.ts';
import { createForecastSnapshot } from '../snapshots.ts';
import { runDailyJobs } from '../jobs.ts';
import type { AppEnv, AuthUser } from '../types.ts';

// ================= 顧客 =================
export const customerRoutes = new Hono<AppEnv>();

customerRoutes.get('/', async (c) => {
  const db = c.get('db');
  const q = String(c.req.query('q') ?? '');
  const kind = c.req.query('kind');
  const params: unknown[] = [];
  let where = 'c.is_active = true';
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (c.name ILIKE $${params.length} OR c.code ILIKE $${params.length})`;
  }
  if (kind) {
    params.push(kind);
    where += ` AND c.kind = $${params.length}`;
  }
  const r = await db.query(
    `SELECT c.id, c.code, c.name, c.kind, c.region_id, m_r.name AS region_name, c.notes
     FROM customers c LEFT JOIN masters m_r ON m_r.id = c.region_id
     WHERE ${where} ORDER BY c.name LIMIT 200`, params);
  return c.json({ items: r.rows });
});

customerRoutes.post('/', requireRole('sales', 'manager', 'hq'), zValidator('json', customerSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');
  try {
    const r = await db.query(
      `INSERT INTO customers (code, name, kind, region_id, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4::uuid,$5,$6::uuid,$6::uuid) RETURNING id`,
      [body.code.toUpperCase(), body.name, body.kind, body.region_id, body.notes ?? null, user.id]);
    await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'customer', entity_id: String(r.rows[0]!.id), new_value: JSON.stringify({ code: body.code, name: body.name }), ip: c.req.header('cf-connecting-ip') });
    return c.json({ id: r.rows[0]!.id }, 201);
  } catch (e: any) {
    if (String(e?.message ?? '').includes('duplicate key')) throw Errors.conflict('顧客コードが重複しています');
    throw e;
  }
});

// ================= マスター =================
export const masterRoutes = new Hono<AppEnv>();

masterRoutes.get('/', async (c) => {
  const db = c.get('db');
  const mtype = c.req.query('mtype');
  const includeInactive = ['admin', 'hq'].includes(c.get('user')?.role ?? '');
  const params: unknown[] = [];
  let where = includeInactive ? 'TRUE' : 'm.is_active = true';
  if (mtype) {
    params.push(mtype);
    where += ` AND m.mtype = $${params.length}`;
  }
  const r = await db.query(`SELECT m.id, m.mtype, m.code, m.name, m.sort_order, m.weight, m.is_active, m.meta
    FROM masters m WHERE ${where} ORDER BY m.mtype, m.sort_order, m.code`, params);
  return c.json({ items: r.rows });
});

masterRoutes.post('/', requireHQ(), zValidator('json', masterSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');
  try {
    const r = await db.query(
      `INSERT INTO masters (mtype, code, name, sort_order, weight, is_active, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5::numeric,$6,$7::uuid,$7::uuid) RETURNING id`,
      [body.mtype, body.code, body.name, body.sort_order, body.weight ?? null, body.is_active ?? true, user.id]);
    await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'master', entity_id: String(r.rows[0]!.id), new_value: JSON.stringify(body), ip: c.req.header('cf-connecting-ip') });
    return c.json({ id: r.rows[0]!.id }, 201);
  } catch (e: any) {
    if (String(e?.message ?? '').includes('duplicate key')) throw Errors.conflict('コードが重複しています');
    throw e;
  }
});

masterRoutes.put('/:masterId', requireHQ(), zValidator('json', masterSchema.partial()), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');
  const sets: string[] = [];
  const params: unknown[] = [c.req.param('masterId')];
  const map: [string, string][] = [
    ['name', 'name=$1'], ['code', 'code=$1'], ['sort_order', 'sort_order=$1'], ['weight', 'weight=$1::numeric'], ['is_active', 'is_active=$1'],
  ];
  for (const [key, sql] of map) {
    if (body[key as keyof typeof body] !== undefined) {
      sets.push(sql.replace('$1', `$${params.length}`));
      params.push(body[key as keyof typeof body]);
    }
  }
  if (!sets.length) throw Errors.badRequest('更新項目がありません');
  await db.query(`UPDATE masters SET ${sets.join(', ')}, updated_at=now(), updated_by=$${params.length}::uuid WHERE id=$${params.length - 1}::uuid`, [...params.slice(1), user.id, c.req.param('masterId')]);
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'update', entity_type: 'master', entity_id: c.req.param('masterId'), new_value: JSON.stringify(body), ip: c.req.header('cf-connecting-ip') });
  return c.json({ ok: true });
});

// ================= メタ（フォーム用） =================
export const metaRoutes = new Hono<AppEnv>();

metaRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const [masters, orgs, users] = await Promise.all([
    db.query(`SELECT id, mtype, code, name, sort_order, weight, is_active FROM masters ORDER BY mtype, sort_order`),
    fetchOrgTree(db),
    db.query(`SELECT u.id, u.email, u.display_name, u.role, u.org_id, o.code AS org_code, o.name AS org_name FROM users u JOIN organizations o ON o.id=u.org_id WHERE u.is_active = true ORDER BY u.display_name`),
  ]);
  const grouped: Record<string, unknown[]> = {};
  for (const m of masters.rows) {
    const t = String(m.mtype);
    (grouped[t] ??= []).push(m);
  }
  const visible = await visibleOrgIds(db, user);
  const visibleOrgs = (orgs as { id: string }[]).filter((o) => visible.has(o.id));
  return c.json({ masters: grouped, organizations: visibleOrgs, users: users.rows });
});

// ================= ダッシュボード（SCR-01） =================
export const dashboardRoutes = new Hono<AppEnv>();

/** 定期処理の自己トリガー（外部スケジューラ無し時の安全網。24h以上未実行なら日次ジョブを起動） */
let lastJobTriggerTs = 0;
async function maybeRunDailyJobs(c: import('hono').Context<AppEnv>) {
  const now = Date.now();
  if (now - lastJobTriggerTs < 60_000) return; // isolate 内で1分に1回まで
  lastJobTriggerTs = now;
  try {
    const db = c.get('db');
    const lastRun = await db.queryOne<{ started_at: string }>(
      `SELECT started_at FROM job_runs WHERE job_name='JOB-01_stale' AND status='ok' ORDER BY started_at DESC LIMIT 1`,
    );
    const stale = lastRun ? now - new Date(lastRun.started_at).getTime() : Infinity;
    if (stale > 24 * 3600_000) {
      c.executionCtx.waitUntil(runDailyJobs(db).catch((e) => console.error('lazy daily jobs failed:', e)));
    }
  } catch (e) {
    console.error('maybeRunDailyJobs failed:', e);
  }
}

dashboardRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const fy = Number(c.req.query('fiscal_year') ?? new Date().getFullYear());
  const orgFilter = c.req.query('org_id');
  const visible = await visibleOrgIds(db, user);
  const scopeOrgs = orgFilter && visible.has(orgFilter) ? [orgFilter] : [...visible];
  void maybeRunDailyJobs(c);

  const { start, end } = fiscalYearRange(fy);
  const params: unknown[] = [start, end, scopeOrgs];

  const [planR, oppR, stageR, probR, monthR, alertR, recentR] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(p.target_amount),0)::float8 AS target, COALESCE(SUM(p.target_gross_profit),0)::float8 AS target_gp
       FROM (SELECT DISTINCT ON (org_id) org_id, target_amount, target_gross_profit FROM sales_plans
             WHERE fiscal_year=$1 AND org_id = ANY($2::uuid[]) ORDER BY org_id, revision DESC) p`, [fy, scopeOrgs]),
    db.query(
      `SELECT o.id, o.opp_code, o.name, o.expected_amount, m_p.weight AS probability_weight, o.status, o.org_id,
              to_char(o.expected_order_date,'YYYY-MM') AS ym
       FROM opportunities o JOIN masters m_p ON m_p.id = o.probability_id
       WHERE o.status IN ('in_progress','hold') AND o.expected_order_date >= $1::date AND o.expected_order_date <= $2::date
         AND o.org_id = ANY($3::uuid[])`, params),
    db.query(
      `SELECT m.name AS stage_name, COUNT(*)::int AS cnt, COALESCE(SUM(o.expected_amount),0)::float8 AS amount
       FROM opportunities o JOIN masters m ON m.id = o.stage_id
       WHERE o.status IN ('in_progress','hold') AND o.expected_order_date >= $1::date AND o.expected_order_date <= $2::date
         AND o.org_id = ANY($3::uuid[])
       GROUP BY m.name, m.sort_order ORDER BY m.sort_order`, params),
    db.query(
      `SELECT m.name AS probability_name, m.weight, COUNT(*)::int AS cnt, COALESCE(SUM(o.expected_amount),0)::float8 AS amount
       FROM opportunities o JOIN masters m ON m.id = o.probability_id
       WHERE o.status IN ('in_progress','hold') AND o.expected_order_date >= $1::date AND o.expected_order_date <= $2::date
         AND o.org_id = ANY($3::uuid[])
       GROUP BY m.name, m.weight, m.sort_order ORDER BY m.sort_order`, params),
    db.query(
      `SELECT to_char(o.expected_order_date,'YYYY-MM') AS ym, COUNT(*)::int AS cnt, COALESCE(SUM(o.expected_amount),0)::float8 AS amount
       FROM opportunities o
       WHERE o.status IN ('in_progress','hold') AND o.expected_order_date >= $1::date AND o.expected_order_date <= $2::date
         AND o.org_id = ANY($3::uuid[])
       GROUP BY 1 ORDER BY 1`, params),
    db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM opportunities o WHERE o.status IN ('in_progress','hold')
            AND o.last_updated_at < now() - make_interval(days => (SELECT COALESCE((value->>'value')::int,14) FROM settings WHERE key='STALE_DAYS'))
            AND o.org_id = ANY($1::uuid[])) AS stale,
         (SELECT COUNT(*)::int FROM opportunities o WHERE o.status IN ('in_progress','hold')
            AND o.next_action_due IS NOT NULL AND o.next_action_due < current_date
            AND o.org_id = ANY($1::uuid[])) AS overdue,
         (SELECT COUNT(*)::int FROM duplicate_candidates WHERE status='pending') AS duplicates,
         (SELECT COUNT(*)::int FROM opportunities o WHERE o.status IN ('in_progress','hold') AND o.next_action_due IS NULL
            AND o.org_id = ANY($1::uuid[])) AS no_action`,
      [scopeOrgs]),
    db.query(
      `SELECT o.opp_code, o.name, o.next_action, to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due, u.display_name AS owner_name
       FROM opportunities o JOIN users u ON u.id=o.owner_id
       WHERE o.status IN ('in_progress','hold') AND o.next_action_due IS NOT NULL
         AND o.org_id = ANY($1::uuid[])
       ORDER BY o.next_action_due ASC LIMIT 8`, [scopeOrgs]),
  ]);

  const planTarget = Number(planR.rows[0]?.target ?? 0);
  let simple = 0;
  let weighted = 0;
  let count = 0;
  for (const o of oppR.rows) {
    const amount = Number(o.expected_amount ?? 0);
    simple += amount;
    weighted += amount * Number(o.probability_weight ?? 0);
    count++;
  }
  simple = Math.round(simple);
  weighted = Math.round(weighted);
  const variance = simple - planTarget;
  const achievement = planTarget > 0 ? Math.round((simple / planTarget) * 10000) / 100 : null;

  return c.json({
    fiscal_year: fy,
    plan: { target_amount: planTarget, target_gross_profit: Number(planR.rows[0]?.target_gp ?? 0) },
    forecast: { simple, weighted, count, variance, achievement_rate: achievement },
    pipeline_by_stage: stageR.rows,
    pipeline_by_probability: probR.rows,
    by_month: monthR.rows,
    alerts: alertR.rows[0] ?? { stale: 0, overdue: 0, duplicates: 0, no_action: 0 },
    upcoming: recentR.rows,
  });
});

// ================= 案件健全性（SCR-06, FR-11） =================
export const healthRoutes = new Hono<AppEnv>();

const healthItemSelect = `
SELECT o.id, o.opp_code, o.name, o.status, o.owner_id, u.display_name AS owner_name,
       o.org_id, oo.code AS org_code, oo.name AS org_name,
       m_st.name AS stage_name, m_p.name AS probability_name,
       o.expected_amount, to_char(o.last_updated_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_updated_at,
       to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due, o.next_action,
       o.customer_id, c.name AS customer_name
FROM opportunities o
JOIN users u ON u.id = o.owner_id
JOIN organizations oo ON oo.id = o.org_id
JOIN masters m_st ON m_st.id = o.stage_id
JOIN masters m_p ON m_p.id = o.probability_id
LEFT JOIN customers c ON c.id = o.customer_id`;

async function visibleWhere(db: import('../db/client.ts').NeonClient, user: AuthUser): Promise<{ sql: string; params: unknown[] }> {
  const visible = await visibleOrgIds(db, user);
  const bypass = user.role === 'admin' || user.role === 'hq';
  if (bypass) return { sql: 'TRUE', params: [] };
  return {
    sql: `o.org_id = ANY($1::uuid[]) AND (
      (SELECT code FROM masters WHERE id = o.confidentiality_id) <> 'C3'
      OR o.owner_id = $2
      OR EXISTS (SELECT 1 FROM opportunity_members om WHERE om.opportunity_id=o.id AND om.user_id=$3)
      OR (SELECT role FROM users WHERE id = $4) IN ('manager','hq','admin'))`,
    params: [[...visible], user.id, user.id, user.id],
  };
}

healthRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const vis = await visibleWhere(db, user);
  const base = `${healthItemSelect} WHERE o.status IN ('in_progress','hold') AND ${vis.sql}`;
  const [staleR, overdueR, noActionR, dupR] = await Promise.all([
    db.query(`${base} AND o.last_updated_at < now() - make_interval(days => (SELECT COALESCE((value->>'value')::int,14) FROM settings WHERE key='STALE_DAYS')) ORDER BY o.last_updated_at ASC`, vis.params),
    db.query(`${base} AND o.next_action_due IS NOT NULL AND o.next_action_due < current_date ORDER BY o.next_action_due ASC`, vis.params),
    db.query(`${base} AND o.next_action_due IS NULL ORDER BY o.last_updated_at ASC`, vis.params),
    db.query(
      `SELECT dc.id, dc.score, dc.matched_fields, dc.status,
              oa.opp_code AS a_code, oa.name AS a_name, oa.org_id AS a_org, oa.status AS a_status,
              ob.opp_code AS b_code, ob.name AS b_name, ob.org_id AS b_org, ob.status AS b_status
       FROM duplicate_candidates dc
       JOIN opportunities oa ON oa.id = dc.opp_a_id
       JOIN opportunities ob ON ob.id = dc.opp_b_id
       WHERE dc.status = 'pending' AND ${vis.sql.replaceAll('o.', 'oa.')}`, vis.params),
  ]);

  const now = new Date();
  const staleItems = staleR.rows.map((r: any) => ({ ...r, days_since_update: calcDaysSince(r.last_updated_at, now) }));
  const overdueItems = overdueR.rows.map((r: any) => ({ ...r, delay_days: calcActionDelay(r.next_action_due, now) }));
  return c.json({ stale: staleItems, overdue: overdueItems, no_action: noActionR.rows, duplicates: dupR.rows });
});

// ================= 予測スナップショット（FR-18, SCR-07） =================
export const snapshotRoutes = new Hono<AppEnv>();

snapshotRoutes.get('/', async (c) => {
  const db = c.get('db');
  const r = await db.query(`SELECT id, to_char(snapshot_date,'YYYY-MM-DD') AS snapshot_date, label, fiscal_year, month, totals, created_at
    FROM forecast_snapshots ORDER BY snapshot_date DESC LIMIT 120`);
  return c.json({ items: r.rows });
});

snapshotRoutes.get('/:snapshotId', async (c) => {
  const db = c.get('db');
  const snap = await db.queryOne<{ id: string }>('SELECT id FROM forecast_snapshots WHERE id=$1', [c.req.param('snapshotId')]);
  if (!snap) throw Errors.notFound();
  const [summary, details] = await Promise.all([
    db.query(`SELECT oo.code AS org_code, oo.name AS org_name, COUNT(*)::int AS cnt, COALESCE(SUM(d.expected_amount),0)::float8 AS amount, COALESCE(SUM(d.weighted_amount),0)::float8 AS weighted
      FROM forecast_snapshot_details d JOIN organizations oo ON oo.id = d.org_id WHERE d.snapshot_id=$1 GROUP BY oo.code, oo.name, oo.sort_order ORDER BY oo.sort_order`, [snap.id]),
    db.query(`SELECT d.opportunity_id, o.opp_code, o.name, d.expected_amount, d.weighted_amount, d.expected_gross_profit, d.expected_order_month, d.status, m_st.name AS stage_name, m_p.name AS probability_name
      FROM forecast_snapshot_details d JOIN opportunities o ON o.id=d.opportunity_id
      LEFT JOIN masters m_st ON m_st.id=d.stage_id LEFT JOIN masters m_p ON m_p.id=d.probability_id
      WHERE d.snapshot_id=$1 ORDER BY d.expected_amount DESC LIMIT 500`, [snap.id]),
  ]);
  return c.json({ summary: summary.rows, details: details.rows });
});

/** スナップショット作成（月末締め。詳細仕様設計書 §16 JOB-05） */
snapshotRoutes.post('/', requireHQ(), zValidator('json', z.object({ snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const { snapshot_date } = c.req.valid('json');
  const snapId = await createForecastSnapshot(db, snapshot_date, user.id);
  if (!snapId) throw Errors.conflict('同日のスナップショットが既に存在します');
  const label = await db.queryOne<{ label: string }>('SELECT label FROM forecast_snapshots WHERE id=$1', [snapId]);
  const totals = await db.queryOne<{ totals: unknown }>('SELECT totals FROM forecast_snapshots WHERE id=$1', [snapId]);
  const cnt = await db.queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM forecast_snapshot_details WHERE snapshot_id=$1', [snapId]);
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'snapshot', entity_id: snapId, new_value: JSON.stringify({ snapshot_date, label: label?.label, count: Number(cnt?.n ?? 0) }), ip: c.req.header('cf-connecting-ip') });
  return c.json({ id: snapId, label: label?.label, totals, count: Number(cnt?.n ?? 0) }, 201);
});

/** スナップショット差分比較（SCR-07 予測比較） */
snapshotRoutes.get('/:snapshotId/diff', async (c) => {
  const db = c.get('db');
  const snap = await db.queryOne<{ id: string }>('SELECT id FROM forecast_snapshots WHERE id=$1', [c.req.param('snapshotId')]);
  if (!snap) throw Errors.notFound();
  const prev = await db.queryOne<{ id: string }>(
    'SELECT id FROM forecast_snapshots WHERE snapshot_date < (SELECT snapshot_date FROM forecast_snapshots WHERE id=$1) ORDER BY snapshot_date DESC LIMIT 1', [snap.id]);
  const cur = await db.query(`SELECT org_id, COALESCE(SUM(expected_amount),0)::float8 AS amount, COALESCE(SUM(weighted_amount),0)::float8 AS weighted, COUNT(*)::int AS cnt
    FROM forecast_snapshot_details WHERE snapshot_id=$1 GROUP BY org_id`, [snap.id]);
  const prevRows = prev ? await db.query(`SELECT org_id, COALESCE(SUM(expected_amount),0)::float8 AS amount, COALESCE(SUM(weighted_amount),0)::float8 AS weighted, COUNT(*)::int AS cnt
    FROM forecast_snapshot_details WHERE snapshot_id=$1 GROUP BY org_id`, [prev.id]) : { rows: [] };
  const orgR = await db.query('SELECT id, code, name FROM organizations');
  const nameOf = new Map(orgR.rows.map((r: any) => [String(r.id), { code: r.code, name: r.name }]));
  const curMap = new Map(cur.rows.map((r: any) => [String(r.org_id), r]));
  const prevMap = new Map(prevRows.rows.map((r: any) => [String(r.org_id), r]));
  const items = [...new Set([...curMap.keys(), ...prevMap.keys()])].map((orgId) => {
    const cRow = curMap.get(orgId);
    const pRow = prevMap.get(orgId);
    const info = nameOf.get(orgId) ?? { code: '?', name: '?' };
    return {
      org_id: orgId, org_code: info.code, org_name: info.name,
      current: { amount: Number(cRow?.amount ?? 0), weighted: Number(cRow?.weighted ?? 0), count: Number(cRow?.cnt ?? 0) },
      previous: { amount: Number(pRow?.amount ?? 0), weighted: Number(pRow?.weighted ?? 0), count: Number(pRow?.cnt ?? 0) },
      diff_amount: Math.round(Number(cRow?.amount ?? 0) - Number(pRow?.amount ?? 0)),
      diff_weighted: Math.round(Number(cRow?.weighted ?? 0) - Number(pRow?.weighted ?? 0)),
    };
  });
  return c.json({ current_snapshot: snap.id, previous_snapshot: prev?.id ?? null, items });
});

// ================= 監査ログ =================
export const auditRoutes = new Hono<AppEnv>();

auditRoutes.get('/', requireHQ(), async (c) => {
  const db = c.get('db');
  const q = c.req.query();
  const where: string[] = ['TRUE'];
  const params: unknown[] = [];
  if (q.entity_type) { params.push(q.entity_type); where.push(`entity_type = $${params.length}`); }
  if (q.entity_id) { params.push(q.entity_id); where.push(`entity_id = $${params.length}`); }
  if (q.action) { params.push(q.action); where.push(`action = $${params.length}`); }
  if (q.user_id) { params.push(q.user_id); where.push(`user_id = $${params.length}::uuid`); }
  if (q.from) { params.push(q.from); where.push(`created_at >= $${params.length}::date`); }
  if (q.to) { params.push(q.to); where.push(`created_at < ($${params.length}::date + interval '1 day')`); }
  const page = Number(q.page ?? 1);
  const pageSize = Math.min(Number(q.pageSize ?? 50), 200);
  params.push(pageSize, (page - 1) * pageSize);
  const r = await db.query(
    `SELECT id, user_name, action, entity_type, entity_id, field, old_value, new_value, reason, ip, to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return c.json({ items: r.rows });
});

// ================= 通知 =================
export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const unreadOnly = c.req.query('unread') === 'true';
  const r = await db.query(
    `SELECT id, ntype, title, body, link, entity_type, entity_id, read_at IS NOT NULL AS is_read, to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM notifications WHERE user_id=$1 ${unreadOnly ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 100`,
    [user.id]);
  const unread = await db.queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [user.id]);
  return c.json({ items: r.rows, unread: Number(unread?.n ?? 0) });
});

notificationRoutes.post('/read', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  if (body.id) {
    await db.query(`UPDATE notifications SET read_at=now() WHERE id=$1::uuid AND user_id=$2`, [body.id, user.id]);
  } else {
    await db.query(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [user.id]);
  }
  return c.json({ ok: true });
});

// ================= 管理（ユーザー・設定） =================
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get('/users', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const r = await db.query(`SELECT u.id, u.email, u.display_name, u.role, u.org_id, o.code AS org_code, o.name AS org_name, u.is_active, to_char(u.last_login_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_login_at, to_char(u.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM users u JOIN organizations o ON o.id=u.org_id ORDER BY u.created_at`);
  return c.json({ items: r.rows });
});

adminRoutes.post('/users', requireRole('admin'), zValidator('json', userCreateSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');
  const hash = await hashPassword(body.password);
  try {
    const r = await db.query(
      `INSERT INTO users (email, display_name, password_hash, role, org_id, created_by) VALUES ($1,$2,$3,$4,$5::uuid,$6::uuid) RETURNING id`,
      [body.email.toLowerCase(), body.display_name, hash, body.role, body.org_id, user.id]);
    await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'user', entity_id: String(r.rows[0]!.id), new_value: JSON.stringify({ email: body.email, role: body.role, org_id: body.org_id }), ip: c.req.header('cf-connecting-ip') });
    return c.json({ id: r.rows[0]!.id }, 201);
  } catch (e: any) {
    if (String(e?.message ?? '').includes('duplicate key')) throw Errors.conflict('メールアドレスが既に登録されています');
    throw e;
  }
});

adminRoutes.put('/users/:userId', requireRole('admin'), zValidator('json', userUpdateSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');
  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.display_name !== undefined) { params.push(body.display_name); sets.push(`display_name=$${params.length}`); }
  if (body.role !== undefined) { params.push(body.role); sets.push(`role=$${params.length}`); }
  if (body.org_id !== undefined) { params.push(body.org_id); sets.push(`org_id=$${params.length}::uuid`); }
  if (body.is_active !== undefined) { params.push(body.is_active); sets.push(`is_active=$${params.length}`); }
  if (body.password !== undefined) { params.push(await hashPassword(body.password)); sets.push(`password_hash=$${params.length}`); }
  if (!sets.length) throw Errors.badRequest('更新項目がありません');
  await db.query(`UPDATE users SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length + 1}::uuid`, [...params, c.req.param('userId')]);
  if (body.is_active === false) {
    await db.query(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [c.req.param('userId')]);
  }
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'update', entity_type: 'user', entity_id: c.req.param('userId'), new_value: JSON.stringify(body), ip: c.req.header('cf-connecting-ip') });
  return c.json({ ok: true });
});

adminRoutes.get('/settings', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const r = await db.query(`SELECT key, value, description, to_char(updated_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at FROM settings ORDER BY key`);
  return c.json({ items: r.rows });
});

adminRoutes.put('/settings', requireRole('admin'), zValidator('json', z.record(z.string(), z.any())), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');
  for (const [key, value] of Object.entries(body)) {
    if (key.includes(';') || key.includes('--')) continue;
    await db.query(`INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1,$2::jsonb,$3::uuid,now())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [key, JSON.stringify(value), user.id]);
  }
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'update', entity_type: 'settings', entity_id: 'settings', new_value: JSON.stringify(Object.keys(body)), ip: c.req.header('cf-connecting-ip') });
  return c.json({ ok: true });
});

adminRoutes.get('/job-runs', requireRole('admin'), async (c) => {
  const db = c.get('db');
  const r = await db.query(`SELECT id, job_name, status, detail, to_char(started_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at, to_char(finished_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS finished_at FROM job_runs ORDER BY started_at DESC LIMIT 50`);
  return c.json({ items: r.rows });
});
