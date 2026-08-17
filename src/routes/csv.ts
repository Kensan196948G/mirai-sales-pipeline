/** CSV 出力（FR-19）— UTF-8 BOM 付き・監査ログ記録 */
import { Hono } from 'hono';
import { requireRole } from '../middleware.ts';
import { writeAudit } from '../audit.ts';
import { visibleOrgIds, idsToSqlArray } from '../permissions.ts';
import { OPP_STATUSES, OPP_STATUS_LABEL } from '../config.ts';
import type { AppEnv } from '../types.ts';

export const csvRoutes = new Hono<AppEnv>();

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n');
}

csvRoutes.get('/opportunities', requireRole('sales', 'manager', 'hq'), async (c) => {
  const db = c.get('db');
  const user = c.get('user')!;
  const q = c.req.query();

  const bypass = user.role === 'admin' || user.role === 'hq';
  const visible = await visibleOrgIds(db, user);
  const where: string[] = [];
  const params: unknown[] = [];

  if (!bypass) {
    params.push(idsToSqlArray(visible), user.id, user.id, user.id);
    where.push(`o.org_id = ANY($${params.length - 3}::uuid[]) AND (
      (SELECT code FROM masters WHERE id = o.confidentiality_id) <> 'C3'
      OR o.owner_id = $${params.length - 2}
      OR EXISTS (SELECT 1 FROM opportunity_members om WHERE om.opportunity_id=o.id AND om.user_id=$${params.length - 1})
      OR (SELECT role FROM users WHERE id = $${params.length}) IN ('manager','hq','admin'))`);
  }
  if (q.status) {
    const statuses = q.status.split(',').filter((s) => (OPP_STATUSES as readonly string[]).includes(s));
    if (statuses.length) { params.push(statuses); where.push(`o.status = ANY($${params.length}::text[])`); }
  }
  if (q.org_id) { params.push(q.org_id); where.push(`o.org_id = $${params.length}::uuid`); }
  if (q.q) { params.push(`%${q.q}%`); where.push(`(o.name ILIKE $${params.length} OR o.opp_code ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
  if (q.region_id) { params.push(q.region_id); where.push(`o.region_id = $${params.length}::uuid`); }
  if (q.work_type_id) { params.push(q.work_type_id); where.push(`o.work_type_id = $${params.length}::uuid`); }

  const r = await db.query(
    `SELECT o.opp_code, o.name, c.code AS customer_code, c.name AS customer_name,
            m_pp.name AS public_private, m_r.name AS region, m_wt.name AS work_type,
            oo.code AS org_code, oo.name AS org_name, u.display_name AS owner,
            m_st.name AS stage, m_p.name AS probability, m_p.weight AS probability_weight,
            o.expected_amount, o.expected_gross_profit, o.gross_margin_rate,
            to_char(o.expected_order_date,'YYYY-MM-DD') AS expected_order_date,
            o.next_action, to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due, o.status,
            m_c.name AS confidentiality, m_lr.name AS loss_reason,
            to_char(o.last_updated_at,'YYYY-MM-DD HH24:MI') AS last_updated
     FROM opportunities o
     LEFT JOIN customers c ON c.id=o.customer_id
     LEFT JOIN masters m_pp ON m_pp.id=o.public_private_id
     LEFT JOIN masters m_r ON m_r.id=o.region_id
     LEFT JOIN masters m_wt ON m_wt.id=o.work_type_id
     LEFT JOIN masters m_st ON m_st.id=o.stage_id
     LEFT JOIN masters m_p ON m_p.id=o.probability_id
     LEFT JOIN masters m_c ON m_c.id=o.confidentiality_id
     LEFT JOIN masters m_lr ON m_lr.id=o.loss_reason_id
     LEFT JOIN organizations oo ON oo.id=o.org_id
     LEFT JOIN users u ON u.id=o.owner_id
     WHERE ${where.length ? where.join(' AND ') : 'TRUE'} ORDER BY o.opp_code LIMIT 10000`,
    params,
  );

  const headers = ['案件コード', '案件名', '顧客コード', '顧客名', '官民区分', '地域', '工種', '組織コード', '組織名', '主担当', '段階', '確度', '確度重み', '予定受注額', '予定粗利額', '予定粗利率(%)', '受注予定日', '次回行動', '次回行動期限', '状態', '機密区分', '失注理由', '最終更新'];
  const rows = r.rows.map((x: any) => [
    x.opp_code, x.name, x.customer_code, x.customer_name, x.public_private, x.region, x.work_type,
    x.org_code, x.org_name, x.owner, x.stage, x.probability, x.probability_weight,
    x.expected_amount, x.expected_gross_profit, x.gross_margin_rate, x.expected_order_date,
    x.next_action, x.next_action_due, OPP_STATUS_LABEL[x.status] ?? x.status, x.confidentiality, x.loss_reason, x.last_updated,
  ]);
  const csv = toCsv(headers, rows);
  // UTF-8 BOM（Excel 互換）はバイト列で付与（Response は文字列先頭の U+FEFF を除去するため）
  const encoder = new TextEncoder();
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode(csv)]);

  await writeAudit(db, {
    user_id: user.id, user_name: user.display_name, action: 'csv_export', entity_type: 'opportunity',
    entity_id: 'bulk', new_value: JSON.stringify({ rows: r.rows.length, filters: q }), ip: c.req.header('cf-connecting-ip'),
  });

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="opportunities-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
