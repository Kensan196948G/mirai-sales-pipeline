/** 営業案件ルート（FR-01,02,04,05,06,07,10,16,17） */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { opportunityCreateSchema, opportunityUpdateSchema, actionSchema, docLinkSchema } from '../validation.ts';
import { Errors } from '../errors.ts';
import { requireRole, csrfGuard } from '../middleware.ts';
import { writeAudit, auditValue } from '../audit.ts';
import { scanDuplicatesFor } from '../services/dupscan.ts';
import { visibleOrgIds, canUpdateOpportunity, canViewConfidential, idsToSqlArray, fetchOrgTree } from '../permissions.ts';
import { AUDIT_TRACKED_FIELDS, OPP_STATUSES } from '../config.ts';
import type { AppEnv, AuthUser } from '../types.ts';

export const oppRoutes = new Hono<AppEnv>();

// ---- 案件ラベル付きSELECTフラグメント ----
const SELECT_OPP = `
SELECT o.id, o.opp_code, o.name, o.customer_id, o.public_private_id, o.region_id, o.work_type_id,
       o.org_id, o.owner_id, o.stage_id, o.probability_id, o.expected_amount, o.expected_gross_profit,
       o.gross_margin_rate, to_char(o.expected_order_date,'YYYY-MM-DD') AS expected_order_date,
       o.next_action, to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due,
       o.status, o.confidentiality_id, o.loss_reason_id, o.loss_note, o.one_drive_url, o.direct_cloud_url,
       o.notes, o.version, to_char(o.last_updated_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_updated_at,
       to_char(o.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       c.code AS customer_code, c.name AS customer_name,
       m_pp.name AS public_private_name, m_r.name AS region_name, m_wt.name AS work_type_name,
       m_st.name AS stage_name, m_p.name AS probability_name, m_p.weight AS probability_weight,
       m_c.name AS confidentiality_name, m_c.code AS confidentiality_code,
       m_lr.name AS loss_reason_name,
       oo.code AS org_code, oo.name AS org_name,
       u.email AS owner_email, u.display_name AS owner_name
FROM opportunities o
LEFT JOIN customers c ON c.id = o.customer_id
LEFT JOIN masters m_pp ON m_pp.id = o.public_private_id
LEFT JOIN masters m_r ON m_r.id = o.region_id
LEFT JOIN masters m_wt ON m_wt.id = o.work_type_id
LEFT JOIN masters m_st ON m_st.id = o.stage_id
LEFT JOIN masters m_p ON m_p.id = o.probability_id
LEFT JOIN masters m_c ON m_c.id = o.confidentiality_id
LEFT JOIN masters m_lr ON m_lr.id = o.loss_reason_id
LEFT JOIN organizations oo ON oo.id = o.org_id
LEFT JOIN users u ON u.id = o.owner_id`;

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  org_id: z.string().optional(),
  region_id: z.string().optional(),
  work_type_id: z.string().optional(),
  stage_id: z.string().optional(),
  probability_id: z.string().optional(),
  owner_id: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  stale: z.string().optional(),
  overdue: z.string().optional(),
  no_action: z.string().optional(),
  my: z.string().optional(),
  sort: z.enum(['created_desc', 'amount_desc', 'order_date_asc', 'updated_desc', 'name_asc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/** 案件の可視性フィルタ条件を組み立て */
async function visibilityCondition(c: { get: (k: 'user') => AuthUser | null }, db: import('../db/client.ts').NeonClient, user: AuthUser, alias = 'o') {
  const bypass = user.role === 'admin' || user.role === 'hq';
  if (bypass) return { sql: 'TRUE', params: [] as unknown[] };
  const visible = await visibleOrgIds(db, user);
  const params: unknown[] = [idsToSqlArray(visible), user.id, user.id, user.id];
  return {
    sql: `${alias}.org_id = ANY($1::uuid[])
      AND (
        (SELECT code FROM masters WHERE id = ${alias}.confidentiality_id) <> 'C3'
        OR ${alias}.owner_id = $2
        OR EXISTS (SELECT 1 FROM opportunity_members om WHERE om.opportunity_id = ${alias}.id AND om.user_id = $3)
        OR (SELECT role FROM users WHERE id = $4) IN ('manager','hq','admin')
      )`,
    params,
  };
}

oppRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const q = c.req.query();
  const parsed = listQuerySchema.safeParse(q);
  if (!parsed.success) throw Errors.badRequest(parsed.error.issues[0]?.message ?? 'クエリが不正です');
  const f = parsed.data;

  const vis = await visibilityCondition(c, db, user);
  const where: string[] = [vis.sql];
  const params: unknown[] = [...vis.params];

  const push = (sql: string, p: unknown[]) => {
    where.push(sql);
    params.push(...p);
  };

  if (f.q) {
    push(`(o.name ILIKE $${params.length + 1} OR o.opp_code ILIKE $${params.length + 1} OR c.name ILIKE $${params.length + 1})`, [`%${f.q}%`]);
  }
  if (f.status) {
    const statuses = f.status.split(',').filter((s) => (OPP_STATUSES as readonly string[]).includes(s));
    if (statuses.length) push(`o.status = ANY($${params.length + 1}::text[])`, [statuses]);
  }
  if (f.org_id) push(`o.org_id = $${params.length + 1}::uuid`, [f.org_id]);
  if (f.region_id) push(`o.region_id = $${params.length + 1}::uuid`, [f.region_id]);
  if (f.work_type_id) push(`o.work_type_id = $${params.length + 1}::uuid`, [f.work_type_id]);
  if (f.stage_id) push(`o.stage_id = $${params.length + 1}::uuid`, [f.stage_id]);
  if (f.probability_id) push(`o.probability_id = $${params.length + 1}::uuid`, [f.probability_id]);
  if (f.owner_id) push(`o.owner_id = $${params.length + 1}::uuid`, [f.owner_id]);
  if (f.date_from) push(`o.expected_order_date >= $${params.length + 1}::date`, [f.date_from]);
  if (f.date_to) push(`o.expected_order_date <= $${params.length + 1}::date`, [f.date_to]);
  if (f.my === 'true') push(`(o.owner_id = $${params.length + 1}::uuid OR EXISTS (SELECT 1 FROM opportunity_members om WHERE om.opportunity_id=o.id AND om.user_id=$${params.length + 1}::uuid))`, [user.id]);
  if (f.stale === 'true') push(`o.status IN ('in_progress','hold') AND o.last_updated_at < now() - make_interval(days => (SELECT COALESCE((value->>'value')::int, 14) FROM settings WHERE key='STALE_DAYS'))`, []);
  if (f.overdue === 'true') push(`o.status IN ('in_progress','hold') AND o.next_action_due IS NOT NULL AND o.next_action_due < current_date`, []);
  if (f.no_action === 'true') push(`o.status IN ('in_progress','hold') AND o.next_action_due IS NULL`, []);

  const sortMap: Record<string, string> = {
    created_desc: 'o.created_at DESC',
    amount_desc: 'o.expected_amount DESC NULLS LAST',
    order_date_asc: 'o.expected_order_date ASC NULLS LAST',
    updated_desc: 'o.last_updated_at DESC',
    name_asc: 'o.name ASC',
  };
  const orderBy = sortMap[f.sort ?? 'created_desc'] ?? 'o.created_at DESC';
  const limit = f.pageSize;
  const offset = (f.page - 1) * limit;

  const countR = await db.query(`SELECT COUNT(*)::int AS total FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE ${where.join(' AND ')}`, params);
  const listR = await db.query(`${SELECT_OPP} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);

  return c.json({
    items: listR.rows,
    total: Number(countR.rows[0]?.total ?? 0),
    page: f.page,
    pageSize: f.pageSize,
  });
});

oppRoutes.get('/:oppCode', async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const oppCode = c.req.param('oppCode');
  const row = await db.queryOne<Record<string, unknown>>(`${SELECT_OPP} WHERE o.opp_code = $1`, [oppCode]);
  if (!row) throw Errors.notFound('案件が見つかりません');

  // 可視性チェック
  const bypass = user.role === 'admin' || user.role === 'hq';
  const visible = await visibleOrgIds(db, user);
  if (!bypass && !visible.has(String(row.org_id))) throw Errors.forbidden();
  if (!bypass && String(row.confidentiality_code) === 'C3' && !(await canViewConfidential(db, user, { owner_id: String(row.owner_id), org_id: String(row.org_id) }))) {
    throw Errors.forbidden('機密案件の閲覧権限がありません');
  }

  const [actions, docLinks, audit, dups, coOwners] = await Promise.all([
    db.query(`SELECT a.id, a.title, a.action_type_id, m.name AS action_type_name, to_char(a.scheduled_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS scheduled_at,
                     to_char(a.done_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS done_at, a.is_done, a.owner_id, u.display_name AS owner_name, a.result, a.next_action, a.next_action_due
              FROM actions a LEFT JOIN masters m ON m.id=a.action_type_id LEFT JOIN users u ON u.id=a.owner_id
              WHERE a.opportunity_id=$1 ORDER BY a.scheduled_at DESC NULLS LAST LIMIT 100`, [row.id]),
    db.query(`SELECT id, doc_type, provider, url, title, version, to_char(confirmed_at,'YYYY-MM-DD') AS confirmed_at, created_at FROM doc_links WHERE opportunity_id=$1 ORDER BY created_at`, [row.id]),
    db.query(`SELECT id, user_name, action, field, old_value, new_value, reason, to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
              FROM audit_logs WHERE entity_type='opportunity' AND entity_id=$1 ORDER BY created_at DESC LIMIT 100`, [row.id]),
    db.query(`SELECT dc.id, dc.score, dc.matched_fields, dc.status, o.opp_code, o.name, o.status AS other_status
              FROM duplicate_candidates dc JOIN opportunities o ON o.id = CASE WHEN dc.opp_a_id = $1 THEN dc.opp_b_id ELSE dc.opp_a_id END
              WHERE (dc.opp_a_id = $1 OR dc.opp_b_id = $1) AND dc.status = 'pending'`, [row.id]),
    db.query(`SELECT u.id, u.display_name, u.email FROM opportunity_members om JOIN users u ON u.id=om.user_id WHERE om.opportunity_id=$1 AND om.role='co'`, [row.id]),
  ]);

  return c.json({ ...row, members: coOwners.rows, actions: actions.rows, doc_links: docLinks.rows, audit: audit.rows, duplicates: dups.rows });
});

// ---- 作成 ----
oppRoutes.post('/', csrfGuard, requireRole('sales', 'manager', 'hq'), zValidator('json', opportunityCreateSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const body = c.req.valid('json');

  // 組織スコープ検証
  const visible = await visibleOrgIds(db, user);
  if (!visible.has(body.org_id)) throw Errors.forbidden('所属組織の範囲外です');

  // 機密区分チェック（C3 は manager 以上 or hq/admin）
  if (body.confidentiality_id) {
    const conf = await db.queryOne<{ code: string }>('SELECT code FROM masters WHERE id=$1', [body.confidentiality_id]);
    if (conf?.code === 'C3' && !['admin', 'hq', 'manager'].includes(user.role)) throw Errors.forbidden('機密案件の作成権限がありません');
  }

  // 採番 + 挿入（競合時は再採番して1回リトライ）
  const doInsert = async (code: string) => {
    const gpRate = body.expected_gross_profit != null && body.expected_amount > 0
      ? Math.round((body.expected_gross_profit / body.expected_amount) * 10000) / 100
      : null;
    return db.query(
      `INSERT INTO opportunities
       (opp_code, name, customer_id, public_private_id, region_id, work_type_id, org_id, owner_id,
        stage_id, probability_id, expected_amount, expected_gross_profit, gross_margin_rate,
        expected_order_date, next_action, next_action_due, status, confidentiality_id, one_drive_url,
        direct_cloud_url, notes, created_by, updated_by)
       VALUES ($1,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::numeric,$12::numeric,$13::numeric,$14::date,$15,$16::date,$17,$18::uuid,$19,$20,$21,$22::uuid,$22::uuid)
       RETURNING id, opp_code`,
      [code, body.name, body.customer_id, body.public_private_id, body.region_id, body.work_type_id,
       body.org_id, body.owner_id, body.stage_id, body.probability_id, body.expected_amount,
       body.expected_gross_profit ?? null, gpRate, body.expected_order_date ?? null, body.next_action ?? null,
       body.next_action_due ?? null, body.status ?? 'in_progress', body.confidentiality_id,
       body.one_drive_url ?? null, body.direct_cloud_url ?? null, body.notes ?? null, user.id],
    );
  };

  const nextCode = async () => {
    const v = await db.queryOne<{ v: number }>("SELECT nextval('opp_code_seq') AS v");
    return `OPP-${String(v!.v).padStart(7, '0')}`;
  };

  let ins: import('../db/client.ts').SqlResult;
  let oppCode = await nextCode();
  try {
    ins = await doInsert(oppCode);
  } catch (e: any) {
    if (!String(e?.message ?? '').includes('duplicate key') && !String(e?.message ?? '').includes('opp_code')) throw e;
    oppCode = await nextCode();
    ins = await doInsert(oppCode); // 再試行（失敗時はそのまま伝播）
  }
  const oppId = String(ins.rows[0]!.id);

  // 共同担当
  if (body.co_owner_ids?.length) {
    for (const uid of body.co_owner_ids) {
      await db.query(`INSERT INTO opportunity_members (opportunity_id, user_id, role) VALUES ($1,$2,'co') ON CONFLICT DO NOTHING`, [oppId, uid]);
    }
  }

  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'opportunity', entity_id: oppId, new_value: JSON.stringify({ opp_code: oppCode, name: body.name, expected_amount: body.expected_amount }), ip: c.req.header('cf-connecting-ip') });

  // 重複候補スキャン（即時）
  const scanTarget = await loadScanTarget(db, oppId);
  const dup = scanTarget ? await scanDuplicatesFor(db, scanTarget) : { candidates: 0 };

  return c.json({ id: oppId, opp_code: oppCode, duplicate_candidates: dup.candidates }, 201);
});

// ---- 更新 ----
oppRoutes.put('/:oppCode', csrfGuard, requireRole('sales', 'manager', 'hq'), zValidator('json', opportunityUpdateSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const oppCode = c.req.param('oppCode');
  const body = c.req.valid('json');

  const cur = await db.queryOne<Record<string, unknown>>(`${SELECT_OPP} WHERE o.opp_code=$1`, [oppCode]);
  if (!cur) throw Errors.notFound('案件が見つかりません');
  if (!(await canUpdateOpportunity(db, user, { id: String(cur.id), owner_id: String(cur.owner_id), org_id: String(cur.org_id) }))) {
    throw Errors.forbidden('この案件を更新する権限がありません');
  }

  // VAL-04: 確度変更は理由必須
  const probChanged = body.probability_id && body.probability_id !== String(cur.probability_id);
  if (probChanged && !body.reason?.trim()) throw Errors.badRequest('確度を変更する場合は変更理由が必須です');
  // VAL-05: 失注時は失注理由必須
  if (body.status === 'lost' && !body.loss_reason_id) throw Errors.badRequest('失注にする場合は失注理由が必須です');
  // 楽観ロック
  const expectedVersion = Number(c.req.query('version') ?? cur.version);
  if (expectedVersion !== Number(cur.version)) throw Errors.conflict('他の更新と競合しました。最新状態を再読込してください');

  // 値組み立て
  const next: Record<string, unknown> = { ...cur };
  const fieldMap: [string, string][] = [
    ['name', 'name'], ['customer_id', 'customer_id'], ['public_private_id', 'public_private_id'],
    ['region_id', 'region_id'], ['work_type_id', 'work_type_id'], ['org_id', 'org_id'], ['owner_id', 'owner_id'],
    ['stage_id', 'stage_id'], ['probability_id', 'probability_id'], ['expected_amount', 'expected_amount'],
    ['expected_gross_profit', 'expected_gross_profit'], ['expected_order_date', 'expected_order_date'],
    ['next_action', 'next_action'], ['next_action_due', 'next_action_due'], ['status', 'status'],
    ['confidentiality_id', 'confidentiality_id'], ['loss_reason_id', 'loss_reason_id'], ['loss_note', 'loss_note'],
    ['one_drive_url', 'one_drive_url'], ['direct_cloud_url', 'direct_cloud_url'], ['notes', 'notes'],
  ];
  const changes: { field: string; old_value: unknown; new_value: unknown }[] = [];
  for (const [key, col] of fieldMap) {
    if (body[key as keyof typeof body] !== undefined) {
      const oldVal = cur[col];
      const newVal = body[key as keyof typeof body] ?? null;
      const norm = (v: unknown) => (v === undefined ? null : v === '' ? null : v);
      if (String(norm(oldVal) ?? '') !== String(norm(newVal) ?? '')) {
        changes.push({ field: col, old_value: norm(oldVal), new_value: norm(newVal) });
        next[col] = norm(newVal);
      }
    }
  }

  // 粗利率再計算
  if ('expected_amount' in next || 'expected_gross_profit' in next) {
    const amount = Number(next.expected_amount ?? 0);
    const gp = next.expected_gross_profit != null ? Number(next.expected_gross_profit) : null;
    next.gross_margin_rate = gp != null && amount > 0 ? Math.round((gp / amount) * 10000) / 100 : null;
  }
  // 状態遷移タイムスタンプ
  if (next.status === 'won' && cur.status !== 'won') next.won_at = new Date().toISOString();
  if (next.status === 'lost' && cur.status !== 'lost') next.lost_at = new Date().toISOString();
  if (next.status !== 'won' && next.status !== 'lost') { next.won_at = null; next.lost_at = null; }
  // 段階・確度変更時刻
  if (changes.some((ch) => ch.field === 'stage_id')) next.stage_changed_at = new Date().toISOString();
  if (changes.some((ch) => ch.field === 'probability_id')) next.probability_changed_at = new Date().toISOString();

  const upd = await db.query(
    `UPDATE opportunities SET
       name=$2, customer_id=$3::uuid, public_private_id=$4::uuid, region_id=$5::uuid, work_type_id=$6::uuid,
       org_id=$7::uuid, owner_id=$8::uuid, stage_id=$9::uuid, probability_id=$10::uuid,
       expected_amount=$11::numeric, expected_gross_profit=$12::numeric, gross_margin_rate=$13::numeric,
       expected_order_date=$14::date, next_action=$15, next_action_due=$16::date, status=$17,
       confidentiality_id=$18::uuid, loss_reason_id=$19::uuid, loss_note=$20, one_drive_url=$21,
       direct_cloud_url=$22, notes=$23, won_at=$24::timestamptz, lost_at=$25::timestamptz,
       stage_changed_at=$26::timestamptz, probability_changed_at=$27::timestamptz,
       last_updated_at=now(), updated_at=now(), updated_by=$28::uuid, version=version+1
     WHERE id=$1::uuid AND version=$29
     RETURNING version`,
    [cur.id, next.name, next.customer_id, next.public_private_id, next.region_id, next.work_type_id,
     next.org_id, next.owner_id, next.stage_id, next.probability_id, next.expected_amount,
     next.expected_gross_profit, next.gross_margin_rate, next.expected_order_date, next.next_action,
     next.next_action_due, next.status, next.confidentiality_id, next.loss_reason_id, next.loss_note,
     next.one_drive_url, next.direct_cloud_url, next.notes, next.won_at, next.lost_at,
     next.stage_changed_at, next.probability_changed_at, user.id, expectedVersion],
  );
  if (upd.rowCount === 0) throw Errors.conflict('他の更新と競合しました。最新状態を再読込してください');

  // 監査ログ
  const reason = body.reason?.trim() ?? null;
  for (const ch of changes) {
    if ((AUDIT_TRACKED_FIELDS as readonly string[]).includes(ch.field)) {
      await writeAudit(db, {
        user_id: user.id, user_name: user.display_name, action: 'update', entity_type: 'opportunity',
        entity_id: String(cur.id), field: ch.field, old_value: auditValue(ch.old_value), new_value: auditValue(ch.new_value),
        reason, ip: c.req.header('cf-connecting-ip'),
      });
    }
  }
  if (changes.length === 0) {
    await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'update', entity_type: 'opportunity', entity_id: String(cur.id), field: null, old_value: null, new_value: null, reason, ip: c.req.header('cf-connecting-ip') });
  }

  // 共同担当更新
  if (body.co_owner_ids) {
    await db.query(`DELETE FROM opportunity_members WHERE opportunity_id=$1 AND role='co'`, [cur.id]);
    for (const uid of body.co_owner_ids) {
      await db.query(`INSERT INTO opportunity_members (opportunity_id, user_id, role) VALUES ($1,$2,'co') ON CONFLICT DO NOTHING`, [cur.id, uid]);
    }
  }

  // 重複候補再スキャン
  const scanTarget = await loadScanTarget(db, String(cur.id));
  if (scanTarget) await scanDuplicatesFor(db, scanTarget);

  return c.json({ ok: true, version: Number(upd.rows[0]?.version ?? expectedVersion + 1) });
});

// ---- 重複候補の判定 ----
const resolveSchema = z.object({ decision: z.enum(['merged', 'separate', 'dismissed']), note: z.string().max(500).optional() });
oppRoutes.post('/:oppCode/duplicates/:candidateId/resolve', csrfGuard, requireRole('manager', 'hq'), zValidator('json', resolveSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const { oppCode, candidateId } = c.req.param();
  const { decision, note } = c.req.valid('json');
  const opp = await db.queryOne<{ id: string }>('SELECT id FROM opportunities WHERE opp_code=$1', [oppCode]);
  if (!opp) throw Errors.notFound('案件が見つかりません');
  const cand = await db.queryOne<{ id: string; opp_a_id: string; opp_b_id: string }>('SELECT id, opp_a_id, opp_b_id FROM duplicate_candidates WHERE id=$1', [candidateId]);
  if (!cand || (cand.opp_a_id !== opp.id && cand.opp_b_id !== opp.id)) throw Errors.notFound('重複候補が見つかりません');
  await db.query(`UPDATE duplicate_candidates SET status=$1, decided_by=$2, decided_at=now() WHERE id=$3`, [decision, user.id, candidateId]);
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: `duplicate_${decision}`, entity_type: 'duplicate_candidate', entity_id: candidateId, new_value: JSON.stringify({ oppCode, note: note ?? null }), ip: c.req.header('cf-connecting-ip') });
  return c.json({ ok: true });
});

// ---- 行動（Action）----
oppRoutes.get('/:oppCode/actions', async (c) => {
  const db = c.get('db');
  const opp = await db.queryOne<{ id: string }>('SELECT id FROM opportunities WHERE opp_code=$1', [c.req.param('oppCode')]);
  if (!opp) throw Errors.notFound();
  const r = await db.query(`SELECT a.id, a.title, a.action_type_id, m.name AS action_type_name, a.scheduled_at, a.done_at, a.is_done, a.owner_id, u.display_name AS owner_name, a.result, a.next_action, a.next_action_due, a.created_at
    FROM actions a LEFT JOIN masters m ON m.id=a.action_type_id LEFT JOIN users u ON u.id=a.owner_id WHERE a.opportunity_id=$1 ORDER BY a.scheduled_at DESC NULLS LAST`, [opp.id]);
  return c.json({ items: r.rows });
});

oppRoutes.post('/:oppCode/actions', csrfGuard, requireRole('sales', 'manager', 'hq'), zValidator('json', actionSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const opp = await db.queryOne<Record<string, unknown>>('SELECT id, opp_code, owner_id, org_id FROM opportunities WHERE opp_code=$1', [c.req.param('oppCode')]);
  if (!opp) throw Errors.notFound();
  if (!(await canUpdateOpportunity(db, user, { id: String(opp.id), owner_id: String(opp.owner_id), org_id: String(opp.org_id) }))) throw Errors.forbidden();
  const body = c.req.valid('json');
  const r = await db.query(
    `INSERT INTO actions (opportunity_id, action_type_id, title, scheduled_at, done_at, is_done, owner_id, result, next_action, next_action_due, created_by)
     VALUES ($1,$2::uuid,$3,$4::timestamptz,$5::timestamptz,$6,$7::uuid,$8,$9,$10::date,$11::uuid) RETURNING id`,
    [opp.id, body.action_type_id, body.title ?? null, body.scheduled_at ?? null, body.done_at ?? null, body.is_done ?? false, body.owner_id ?? user.id, body.result ?? null, body.next_action ?? null, body.next_action_due ?? null, user.id],
  );
  // 案件の次回行動へ反映（行動登録時）
  if (body.next_action && body.next_action_due) {
    await db.query(`UPDATE opportunities SET next_action=$1, next_action_due=$2::date, last_updated_at=now(), updated_by=$3::uuid WHERE id=$4`, [body.next_action, body.next_action_due, user.id, opp.id]);
  }
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'action', entity_id: String(r.rows[0]!.id), new_value: JSON.stringify({ opp_code: opp.opp_code, title: body.title ?? '' }), ip: c.req.header('cf-connecting-ip') });
  return c.json({ id: r.rows[0]!.id }, 201);
});

oppRoutes.put('/:oppCode/actions/:actionId', csrfGuard, requireRole('sales', 'manager', 'hq'), zValidator('json', actionSchema.partial()), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const oppCode = c.req.param('oppCode');
  const actionId = c.req.param('actionId');
  const opp = await db.queryOne<Record<string, unknown>>('SELECT id, opp_code, owner_id, org_id FROM opportunities WHERE opp_code=$1', [oppCode]);
  if (!opp) throw Errors.notFound();
  if (!(await canUpdateOpportunity(db, user, { id: String(opp.id), owner_id: String(opp.owner_id), org_id: String(opp.org_id) }))) throw Errors.forbidden();
  const body = c.req.valid('json');
  const sets: string[] = [];
  const params: unknown[] = [actionId];
  const map: [string, string][] = [
    ['action_type_id', 'action_type_id=$1::uuid'], ['title', 'title=$1'], ['scheduled_at', 'scheduled_at=$1::timestamptz'],
    ['done_at', 'done_at=$1::timestamptz'], ['is_done', 'is_done=$1'], ['owner_id', 'owner_id=$1::uuid'],
    ['result', 'result=$1'], ['next_action', 'next_action=$1'], ['next_action_due', 'next_action_due=$1::date'],
  ];
  for (const [key, sql] of map) {
    if (body[key as keyof typeof body] !== undefined) {
      sets.push(sql.replace('$1', `$${params.length}`));
      params.push(body[key as keyof typeof body] ?? null);
    }
  }
  if (!sets.length) throw Errors.badRequest('更新項目がありません');
  await db.query(`UPDATE actions SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}::uuid`, [...params.slice(1), actionId]);
  await db.query(`UPDATE opportunities SET last_updated_at=now(), updated_by=$1::uuid WHERE id=$2`, [user.id, opp.id]);
  return c.json({ ok: true });
});

oppRoutes.delete('/:oppCode/actions/:actionId', csrfGuard, requireRole('manager', 'hq'), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const oppCode = c.req.param('oppCode');
  const actionId = c.req.param('actionId');
  const opp = await db.queryOne<{ id: string }>('SELECT id FROM opportunities WHERE opp_code=$1', [oppCode]);
  if (!opp) throw Errors.notFound();
  await db.query('DELETE FROM actions WHERE id=$1::uuid AND opportunity_id=$2', [actionId, opp.id]);
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'delete', entity_type: 'action', entity_id: actionId!, ip: c.req.header('cf-connecting-ip') });
  return c.json({ ok: true });
});

// ---- 文書リンク（FR-14,15）----
oppRoutes.get('/:oppCode/doc-links', async (c) => {
  const db = c.get('db');
  const opp = await db.queryOne<{ id: string }>('SELECT id FROM opportunities WHERE opp_code=$1', [c.req.param('oppCode')]);
  if (!opp) throw Errors.notFound();
  const r = await db.query('SELECT id, doc_type, provider, url, title, version, confirmed_at, created_at FROM doc_links WHERE opportunity_id=$1 ORDER BY created_at', [opp.id]);
  return c.json({ items: r.rows });
});

oppRoutes.post('/:oppCode/doc-links', csrfGuard, requireRole('sales', 'manager', 'hq'), zValidator('json', docLinkSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const opp = await db.queryOne<Record<string, unknown>>('SELECT id, opp_code, owner_id, org_id FROM opportunities WHERE opp_code=$1', [c.req.param('oppCode')]);
  if (!opp) throw Errors.notFound();
  if (!(await canUpdateOpportunity(db, user, { id: String(opp.id), owner_id: String(opp.owner_id), org_id: String(opp.org_id) }))) throw Errors.forbidden();
  const body = c.req.valid('json');
  const r = await db.query(
    `INSERT INTO doc_links (opportunity_id, doc_type, provider, url, title, version, confirmed_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8::uuid) RETURNING id`,
    [opp.id, body.doc_type, body.provider, body.url, body.title ?? null, body.version ?? null, body.confirmed_at ?? null, user.id],
  );
  await db.query(`UPDATE opportunities SET last_updated_at=now() WHERE id=$1`, [opp.id]);
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'create', entity_type: 'doc_link', entity_id: String(r.rows[0]!.id), new_value: JSON.stringify({ opp_code: opp.opp_code, url: body.url }), ip: c.req.header('cf-connecting-ip') });
  return c.json({ id: r.rows[0]!.id }, 201);
});

oppRoutes.delete('/:oppCode/doc-links/:linkId', csrfGuard, requireRole('manager', 'hq'), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const oppCode = c.req.param('oppCode');
  const linkId = c.req.param('linkId');
  const opp = await db.queryOne<{ id: string }>('SELECT id FROM opportunities WHERE opp_code=$1', [oppCode]);
  if (!opp) throw Errors.notFound();
  await db.query('DELETE FROM doc_links WHERE id=$1::uuid AND opportunity_id=$2', [linkId, opp.id]);
  await writeAudit(db, { user_id: user.id, user_name: user.display_name, action: 'delete', entity_type: 'doc_link', entity_id: linkId!, ip: c.req.header('cf-connecting-ip') });
  return c.json({ ok: true });
});

/** スキャン対象ロード */
async function loadScanTarget(db: import('../db/client.ts').NeonClient, oppId: string) {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT o.id, o.opp_code, o.name, o.customer_id, c.code AS customer_code, c.name AS customer_name, o.region_id, o.work_type_id, to_char(o.expected_order_date,'YYYY-MM-DD') AS expected_order_date
     FROM opportunities o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=$1`, [oppId]);
  if (!r) return null;
  return {
    id: String(r.id), opp_code: String(r.opp_code), name: String(r.name),
    customer_id: r.customer_id ? String(r.customer_id) : null,
    customer_code: r.customer_code ? String(r.customer_code) : null,
    customer_name: r.customer_name ? String(r.customer_name) : null,
    region_id: r.region_id ? String(r.region_id) : null,
    work_type_id: r.work_type_id ? String(r.work_type_id) : null,
    expected_order_date: r.expected_order_date ? String(r.expected_order_date) : null,
  };
}

export { fetchOrgTree };
