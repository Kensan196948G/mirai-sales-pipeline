/** 年間受注計画ルート（FR-03, FR-09, AC-03） */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { planSchema } from '../validation.ts';
import { Errors } from '../errors.ts';
import { requireHQ } from '../middleware.ts';
import { writeAudit } from '../audit.ts';
import { visibleOrgIds, isWithinOrg } from '../permissions.ts';
import { calcPlanVariance, calcAchievementRate } from '../calc.ts';
import type { AppEnv } from '../types.ts';

export const planRoutes = new Hono<AppEnv>();

/** 日本の会計年度の開始/終了 */
export function fiscalYearRange(fy: number): { start: string; end: string } {
  return { start: `${fy}-04-01`, end: `${fy + 1}-03-31` };
}

planRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const fy = Number(c.req.query('fiscal_year') ?? new Date().getFullYear());
  const visible = await visibleOrgIds(db, user);
  const orgFilter = c.req.query('org_id');
  let where = `p.fiscal_year = $1`;
  const params: unknown[] = [fy];
  if (orgFilter) {
    if (!visible.has(orgFilter)) throw Errors.forbidden();
    where += ` AND p.org_id = $2::uuid`;
    params.push(orgFilter);
  } else {
    where += ` AND p.org_id = ANY($2::uuid[])`;
    params.push([...visible]);
  }
  const r = await db.query(
    `SELECT p.id, p.fiscal_year, p.org_id, o.code AS org_code, o.name AS org_name,
            p.public_private_id, m_pp.name AS public_private_name, p.region_id, m_r.name AS region_name,
            p.work_type_id, m_wt.name AS work_type_name, p.target_amount, p.target_gross_profit,
            p.revision, p.status, to_char(p.updated_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
     FROM sales_plans p
     JOIN organizations o ON o.id = p.org_id
     LEFT JOIN masters m_pp ON m_pp.id = p.public_private_id
     LEFT JOIN masters m_r ON m_r.id = p.region_id
     LEFT JOIN masters m_wt ON m_wt.id = p.work_type_id
     WHERE ${where} ORDER BY o.sort_order`, params);
  return c.json({ items: r.rows });
});

planRoutes.post('/', requireHQ(), zValidator('json', planSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');
  if (!(await isWithinOrg(db, body.org_id, user.org_id)) && user.role !== 'admin') throw Errors.forbidden();
  const r = await db.query(
    `INSERT INTO sales_plans (fiscal_year, org_id, public_private_id, region_id, work_type_id, target_amount, target_gross_profit, status, created_by, updated_by)
     VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::numeric,$7::numeric,$8,$9::uuid,$9::uuid) RETURNING id`,
    [body.fiscal_year, body.org_id, body.public_private_id, body.region_id, body.work_type_id, body.target_amount, body.target_gross_profit ?? null, body.status ?? 'draft', user.id],
  );
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'plan', entity_id: String(r.rows[0]!.id), new_value: JSON.stringify({ fiscal_year: body.fiscal_year, org_id: body.org_id, target_amount: body.target_amount }), ip: c.req.header('cf-connecting-ip') });
  return c.json({ id: r.rows[0]!.id }, 201);
});

planRoutes.put('/:planId', requireHQ(), zValidator('json', planSchema.partial()), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const plan = await db.queryOne<{ id: string; org_id: string }>('SELECT id, org_id FROM sales_plans WHERE id=$1', [c.req.param('planId')]);
  if (!plan) throw Errors.notFound('計画が見つかりません');
  if (!(await isWithinOrg(db, plan.org_id, user.org_id)) && user.role !== 'admin') throw Errors.forbidden();
  const body = c.req.valid('json');
  const sets: string[] = [];
  const params: unknown[] = [];
  const map: [string, string][] = [
    ['fiscal_year', 'fiscal_year=$1'], ['org_id', 'org_id=$1::uuid'], ['public_private_id', 'public_private_id=$1::uuid'],
    ['region_id', 'region_id=$1::uuid'], ['work_type_id', 'work_type_id=$1::uuid'],
    ['target_amount', 'target_amount=$1::numeric'], ['target_gross_profit', 'target_gross_profit=$1::numeric'],
    ['status', 'status=$1'], ['revision', 'revision=revision+1'],
  ];
  for (const [key, sql] of map) {
    if (body[key as keyof typeof body] !== undefined || key === 'revision') {
      if (key === 'revision') { sets.push(sql); continue; }
      sets.push(sql.replace('$1', `$${params.length + 1}`));
      params.push(body[key as keyof typeof body] ?? null);
    }
  }
  if (!sets.length) throw Errors.badRequest('更新項目がありません');
  await db.query(`UPDATE sales_plans SET ${sets.join(', ')}, updated_at=now(), updated_by=$${params.length + 1}::uuid WHERE id=$${params.length + 2}::uuid`, [...params, user.id, plan.id]);
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'update', entity_type: 'plan', entity_id: plan.id, new_value: JSON.stringify(body), ip: c.req.header('cf-connecting-ip') });
  return c.json({ ok: true });
});

/** 計画差異サマリ（CALC-04/05 + 積上げ見込） */
planRoutes.get('/summary', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const fy = Number(c.req.query('fiscal_year') ?? new Date().getFullYear());
  const { start, end } = fiscalYearRange(fy);
  const visible = await visibleOrgIds(db, user);
  const orgIds = [...visible];

  // 最新リビジョンの計画
  const plans = await db.query(
    `SELECT DISTINCT ON (p.org_id) p.org_id, o.code AS org_code, o.name AS org_name, p.target_amount, p.target_gross_profit, p.status
     FROM sales_plans p JOIN organizations o ON o.id=p.org_id
     WHERE p.fiscal_year=$1 AND p.org_id = ANY($2::uuid[])
     ORDER BY p.org_id, p.revision DESC`,
    [fy, orgIds],
  );

  // 見込（進行中+保留・受注予定日がFY内）
  const opps = await db.query(
    `SELECT o.org_id, o.expected_amount, m_p.weight AS probability_weight
     FROM opportunities o JOIN masters m_p ON m_p.id=o.probability_id
     WHERE o.status IN ('in_progress','hold') AND o.expected_order_date >= $1::date AND o.expected_order_date <= $2::date
       AND o.org_id = ANY($3::uuid[])`,
    [start, end, orgIds],
  );

  const planByOrg = new Map<string, Record<string, unknown>>();
  for (const p of plans.rows) planByOrg.set(String(p.org_id), p);
  const totals = new Map<string, { simple: number; weighted: number; count: number }>();
  for (const o of opps.rows) {
    const key = String(o.org_id);
    const t = totals.get(key) ?? { simple: 0, weighted: 0, count: 0 };
    t.simple += Number(o.expected_amount ?? 0);
    t.weighted += Number(o.expected_amount ?? 0) * Number(o.probability_weight ?? 0);
    t.count++;
    totals.set(key, t);
  }

  const items = [...planByOrg.values()].map((p) => {
    const t = totals.get(String(p.org_id)) ?? { simple: 0, weighted: 0, count: 0 };
    const target = Number(p.target_amount ?? 0);
    return {
      org_id: p.org_id, org_code: p.org_code, org_name: p.org_name, status: p.status,
      target_amount: target,
      forecast_simple: Math.round(t.simple),
      forecast_weighted: Math.round(t.weighted),
      variance: calcPlanVariance(Math.round(t.simple), target),
      achievement_rate: calcAchievementRate(Math.round(t.simple), target),
      count: t.count,
    };
  });

  // 全体
  const allPlan = items.reduce((s, it) => s + Number(it.target_amount ?? 0), 0);
  const allForecast = items.reduce((s, it) => s + Number(it.forecast_simple), 0);
  const allWeighted = items.reduce((s, it) => s + Number(it.forecast_weighted), 0);
  const allCount = items.reduce((s, it) => s + Number(it.count), 0);

  return c.json({
    fiscal_year: fy,
    items,
    totals: {
      target_amount: allPlan,
      forecast_simple: allForecast,
      forecast_weighted: allWeighted,
      variance: calcPlanVariance(allForecast, allPlan),
      achievement_rate: calcAchievementRate(allForecast, allPlan),
      count: allCount,
    },
  });
});
