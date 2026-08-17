/**
 * 定期処理（詳細仕様設計書 §16 JOB-01〜06）
 * 日次 cron または /api/internal/cron から実行される。冪等・通知は dedup_key で重複防止。
 */
import { NeonClient } from './db/client.ts';
import { createNotification, oppLink } from './notify.ts';
import { scanDuplicatesFor } from './services/dupscan.ts';
import { createForecastSnapshot } from './snapshots.ts';

async function runJob(db: NeonClient, jobName: string, fn: () => Promise<Record<string, unknown>>) {
  const start = await db.query(`INSERT INTO job_runs (job_name, status) VALUES ($1,'running') RETURNING id`, [jobName]);
  const jobId = String(start.rows[0]!.id);
  try {
    const detail = await fn();
    await db.query(`UPDATE job_runs SET status='ok', detail=$1::jsonb, finished_at=now() WHERE id=$2`, [JSON.stringify(detail), jobId]);
    return { job: jobName, status: 'ok', detail };
  } catch (e: any) {
    await db.query(`UPDATE job_runs SET status='error', detail=$1::jsonb, finished_at=now() WHERE id=$2`, [JSON.stringify({ error: String(e?.message ?? e) }), jobId]);
    console.error(`job ${jobName} failed:`, e);
    return { job: jobName, status: 'error', detail: { error: String(e?.message ?? e) } };
  }
}

/** 通知対象: 主担当 + 共同担当 + 所属組織の manager 以上 */
async function notifyTargets(db: NeonClient, oppId: string, ownerId: string, orgId: string): Promise<string[]> {
  const r = await db.query(
    `SELECT DISTINCT u.id FROM users u
     WHERE u.is_active = true AND (
       u.id = $1::uuid
       OR EXISTS (SELECT 1 FROM opportunity_members om WHERE om.opportunity_id=$2::uuid AND om.user_id=u.id)
       OR (u.org_id = $3::uuid AND u.role IN ('manager','hq','admin'))
     )`,
    [ownerId, oppId, orgId],
  );
  return r.rows.map((row) => String(row.id));
}

async function jobStale(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.owner_id, o.org_id, m_st.name AS stage_name, m_p.name AS probability_name,
            to_char(o.last_updated_at,'YYYY-MM-DD') AS last_updated_at
     FROM opportunities o
     JOIN masters m_st ON m_st.id=o.stage_id JOIN masters m_p ON m_p.id=o.probability_id
     WHERE o.status IN ('in_progress','hold')
       AND o.last_updated_at < now() - make_interval(days => (SELECT COALESCE((value->>'value')::int,14) FROM settings WHERE key='STALE_DAYS'))`,
  );
  let sent = 0;
  for (const row of r.rows) {
    const targets = await notifyTargets(db, String(row.id), String(row.owner_id), String(row.org_id));
    for (const uid of targets) {
      const ok = await createNotification(db, {
        userId: uid, ntype: 'stale',
        title: `【長期未更新】${row.opp_code} ${row.name}`,
        body: `最終更新: ${row.last_updated_at} / 段階: ${row.stage_name} / 確度: ${row.probability_name}`,
        link: oppLink(String(row.opp_code)), entityType: 'opportunity', entityId: String(row.id),
      });
      if (ok) sent++;
    }
  }
  return { stale_count: r.rows.length, notifications: sent };
}

async function jobOverdue(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.owner_id, o.org_id, o.next_action, to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due
     FROM opportunities o
     WHERE o.status IN ('in_progress','hold') AND o.next_action_due IS NOT NULL AND o.next_action_due < current_date`,
  );
  let sent = 0;
  for (const row of r.rows) {
    const targets = await notifyTargets(db, String(row.id), String(row.owner_id), String(row.org_id));
    for (const uid of targets) {
      const ok = await createNotification(db, {
        userId: uid, ntype: 'action_overdue',
        title: `【次回行動 期限超過】${row.opp_code} ${row.name}`,
        body: `期限: ${row.next_action_due} / 内容: ${row.next_action ?? ''}`,
        link: oppLink(String(row.opp_code)), entityType: 'opportunity', entityId: String(row.id),
      });
      if (ok) sent++;
    }
  }
  return { overdue_count: r.rows.length, notifications: sent };
}

async function jobRemind(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.owner_id, o.org_id, o.next_action, to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due
     FROM opportunities o
     WHERE o.status IN ('in_progress','hold') AND o.next_action_due IS NOT NULL
       AND o.next_action_due BETWEEN current_date AND current_date + make_interval(days => (SELECT COALESCE((value->>'value')::int,3) FROM settings WHERE key='ACTION_REMIND_DAYS'))`,
  );
  let sent = 0;
  for (const row of r.rows) {
    const targets = await notifyTargets(db, String(row.id), String(row.owner_id), String(row.org_id));
    for (const uid of targets) {
      const ok = await createNotification(db, {
        userId: uid, ntype: 'action_remind',
        title: `【次回行動 期限前】${row.opp_code} ${row.name}`,
        body: `期限: ${row.next_action_due} / 内容: ${row.next_action ?? ''}`,
        link: oppLink(String(row.opp_code)), entityType: 'opportunity', entityId: String(row.id),
      });
      if (ok) sent++;
    }
  }
  return { remind_count: r.rows.length, notifications: sent };
}

async function jobDuplicates(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.customer_id, c.code AS customer_code, c.name AS customer_name,
            o.region_id, o.work_type_id, to_char(o.expected_order_date,'YYYY-MM-DD') AS expected_order_date
     FROM opportunities o LEFT JOIN customers c ON c.id=o.customer_id
     WHERE o.status IN ('in_progress','hold') AND o.last_updated_at > now() - interval '30 days'`,
  );
  let candidates = 0;
  for (const row of r.rows) {
    const res = await scanDuplicatesFor(db, {
      id: String(row.id), opp_code: String(row.opp_code), name: String(row.name),
      customer_id: row.customer_id ? String(row.customer_id) : null,
      customer_code: row.customer_code ? String(row.customer_code) : null,
      customer_name: row.customer_name ? String(row.customer_name) : null,
      region_id: row.region_id ? String(row.region_id) : null,
      work_type_id: row.work_type_id ? String(row.work_type_id) : null,
      expected_order_date: row.expected_order_date ? String(row.expected_order_date) : null,
    });
    candidates += res.candidates;
  }
  return { scanned: r.rows.length, candidates };
}

async function jobSnapshot(db: NeonClient): Promise<Record<string, unknown>> {
  const dayRow = await db.queryOne<{ value: unknown }>(`SELECT value FROM settings WHERE key='FORECAST_SNAPSHOT_DAY'`);
  const day = Number((dayRow?.value as any)?.value ?? 1);
  const today = new Date();
  if (today.getDate() !== day) return { skipped: `today is not snapshot day (${day})` };
  // 前月締め
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  const snapshotDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  const existing = await db.queryOne('SELECT id FROM forecast_snapshots WHERE snapshot_date=$1', [snapshotDate]);
  if (existing) return { skipped: 'already exists', snapshot_date: snapshotDate };
  // スナップショット自動作成（created_by はシステム実行のため NULL）
  const snapId = await createForecastSnapshot(db, snapshotDate, null);
  if (!snapId) return { skipped: 'already exists (race)', snapshot_date: snapshotDate };
  return { created: true, snapshot_date: snapshotDate, snapshot_id: snapId };
}

async function jobQuality(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT
      (SELECT COUNT(*)::int FROM opportunities WHERE status IN ('in_progress','hold') AND next_action_due IS NULL) AS no_action,
      (SELECT COUNT(*)::int FROM opportunities WHERE status IN ('in_progress','hold') AND expected_amount <= 0) AS zero_amount,
      (SELECT COUNT(*)::int FROM opportunities WHERE expected_amount > 0 AND expected_gross_profit IS NULL AND status IN ('in_progress','hold')) AS no_gp,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.one_drive_url IS NOT NULL AND o.one_drive_url !~ '^https?://') AS bad_onedrive,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.direct_cloud_url IS NOT NULL AND o.direct_cloud_url !~ '^https?://') AS bad_directcloud,
      (SELECT COUNT(*)::int FROM opportunities o WHERE o.name IS NULL OR o.name = '') AS missing_name`,
  );
  return { quality: r.rows[0] };
}

/** 日次ジョブ一式 */
export async function runDailyJobs(db: NeonClient): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  results.stale = await runJob(db, 'JOB-01_stale', () => jobStale(db));
  results.overdue = await runJob(db, 'JOB-02_overdue', () => jobOverdue(db));
  results.remind = await runJob(db, 'JOB-02b_remind', () => jobRemind(db));
  results.duplicates = await runJob(db, 'JOB-03_duplicates', () => jobDuplicates(db));
  results.snapshot = await runJob(db, 'JOB-05_snapshot', () => jobSnapshot(db));
  results.quality = await runJob(db, 'JOB-06_quality', () => jobQuality(db));
  return results;
}
