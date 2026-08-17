/**
 * 予測スナップショット作成（FR-18 / SCR-07 / 詳細仕様設計書 §16 JOB-05）
 * 手動 API（routes/misc.ts）と日次ジョブ（jobs.ts）で共用する。
 */
import { NeonClient } from './db/client.ts';

export interface SnapshotTotals {
  by_org: Record<string, { code: string; amount: number; weighted: number; count: number }>;
  total: { amount: number; weighted: number; count: number };
}

/**
 * 指定締め日のスナップショットを作成する（冪等: 同日既存なら null を返す）。
 * @returns 作成したスナップショット id。既存の場合は null。
 */
export async function createForecastSnapshot(db: NeonClient, snapshotDate: string, createdBy: string | null): Promise<string | null> {
  const d = new Date(`${snapshotDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error('snapshot_date の形式が不正です');
  const fy = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const month = d.getUTCMonth() + 1;
  const label = `${d.getUTCFullYear()}年${month}月 締め`;

  const existing = await db.queryOne('SELECT id FROM forecast_snapshots WHERE snapshot_date=$1', [snapshotDate]);
  if (existing) return null;

  // 締め時点の案件を明細化（進行中・保留・FY内受注予定）
  const opps = await db.query(
    `SELECT o.id, o.org_id, o.region_id, o.work_type_id, o.stage_id, o.probability_id, m_p.weight AS probability_weight,
            o.status, o.expected_amount, o.expected_gross_profit, to_char(o.expected_order_date,'YYYYMM') AS ym
     FROM opportunities o JOIN masters m_p ON m_p.id = o.probability_id
     WHERE o.status IN ('in_progress','hold') AND o.expected_order_date >= $1::date AND o.expected_order_date <= $2::date`,
    [`${fy}-04-01`, `${fy + 1}-03-31`],
  );

  const byOrg = new Map<string, { code: string; amount: number; weighted: number; count: number }>();
  const orgCodes = new Map<string, string>();
  const orgR = await db.query('SELECT id, code FROM organizations');
  for (const o of orgR.rows) orgCodes.set(String(o.id), String(o.code));

  const insertR = await db.query(
    `INSERT INTO forecast_snapshots (snapshot_date, label, fiscal_year, month, created_by) VALUES ($1,$2,$3,$4,$5::uuid) RETURNING id`,
    [snapshotDate, label, fy, month, createdBy],
  );
  const snapId = String(insertR.rows[0]!.id);

  for (const o of opps.rows) {
    const amount = Number(o.expected_amount ?? 0);
    const weighted = Math.round(amount * Number(o.probability_weight ?? 0));
    const orgId = String(o.org_id);
    const t = byOrg.get(orgId) ?? { code: orgCodes.get(orgId) ?? '', amount: 0, weighted: 0, count: 0 };
    t.amount += amount;
    t.weighted += weighted;
    t.count++;
    byOrg.set(orgId, t);
    await db.query(
      `INSERT INTO forecast_snapshot_details
       (snapshot_id, opportunity_id, org_id, region_id, work_type_id, stage_id, probability_id, probability_weight, status, expected_amount, weighted_amount, expected_gross_profit, expected_order_month)
       VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::numeric,$9,$10::numeric,$11::numeric,$12::numeric,$13)`,
      [snapId, o.id, o.org_id, o.region_id, o.work_type_id, o.stage_id, o.probability_id, o.probability_weight, o.status, amount, weighted, o.expected_gross_profit ?? null, o.ym ? Number(o.ym) : null],
    );
  }
  const totals: SnapshotTotals = {
    by_org: Object.fromEntries(byOrg),
    total: {
      amount: [...byOrg.values()].reduce((s, t) => s + t.amount, 0),
      weighted: [...byOrg.values()].reduce((s, t) => s + t.weighted, 0),
      count: [...byOrg.values()].reduce((s, t) => s + t.count, 0),
    },
  };
  await db.query(`UPDATE forecast_snapshots SET totals=$1::jsonb WHERE id=$2`, [JSON.stringify(totals), snapId]);
  return snapId;
}
