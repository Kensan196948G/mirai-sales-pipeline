/**
 * 定期処理（詳細仕様設計書 §16 JOB-01〜06）
 * 日次 cron または /api/internal/cron から実行される。冪等・通知は dedup_key で重複防止。
 */
import { NeonClient } from './db/client.ts';
import { oppLink, type NotificationInput } from './notify.ts';
import { scanDuplicatesBatch, type OppScanInput } from './services/dupscan.ts';
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

/** 通知対象: 主担当 + 共同担当 + 所属組織の manager 以上（バッチ版: 複数案件の対象を一括取得） */
async function notifyTargetsBatch(db: NeonClient, oppIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (oppIds.length === 0) return map;
  const r = await db.query(
    `SELECT o.id AS opp_id, u.id AS user_id
     FROM opportunities o
     CROSS JOIN LATERAL (
       SELECT u.id FROM users u
       WHERE u.is_active = true AND (
         u.id = o.owner_id
         OR EXISTS (SELECT 1 FROM opportunity_members om WHERE om.opportunity_id = o.id AND om.user_id = u.id)
         OR (u.org_id = o.org_id AND u.role IN ('manager','hq','admin'))
       )
     ) u
     WHERE o.id = ANY($1::uuid[])`,
    [oppIds],
  );
  for (const row of r.rows) {
    const oppId = String(row.opp_id);
    const list = map.get(oppId) ?? [];
    list.push(String(row.user_id));
    map.set(oppId, list);
  }
  return map;
}

/** 通知を一括作成（UNNEST + jsonb で単一クエリ投入。dedup_key により冪等。サブリクエスト削減） */
async function createNotificationsBatch(db: NeonClient, items: { userId: string; ntype: NotificationInput['ntype']; title: string; body?: string; link?: string; entityType?: string; entityId?: string }[]): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((n) => ({
    user_id: n.userId,
    ntype: n.ntype,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
    entity_type: n.entityType ?? null,
    entity_id: n.entityId ?? null,
    dedup_key: `${n.userId}:${n.ntype}:${n.entityType ?? ''}:${n.entityId ?? ''}`,
  }));
  const r = await db.query(
    `INSERT INTO notifications (user_id, ntype, title, body, link, entity_type, entity_id, dedup_key)
     SELECT (e->>'user_id')::uuid, e->>'ntype', e->>'title', e->>'body', e->>'link', e->>'entity_type', e->>'entity_id', e->>'dedup_key'
     FROM jsonb_array_elements($1::jsonb) AS e
     ON CONFLICT (dedup_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
  return r.rowCount;
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
  const targets = await notifyTargetsBatch(db, r.rows.map((row) => String(row.id)));
  const items: Parameters<typeof createNotificationsBatch>[1] = [];
  for (const row of r.rows) {
    for (const uid of targets.get(String(row.id)) ?? []) {
      items.push({
        userId: uid, ntype: 'stale',
        title: `【長期未更新】${row.opp_code} ${row.name}`,
        body: `最終更新: ${row.last_updated_at} / 段階: ${row.stage_name} / 確度: ${row.probability_name}`,
        link: oppLink(String(row.opp_code)), entityType: 'opportunity', entityId: String(row.id),
      });
    }
  }
  const sent = await createNotificationsBatch(db, items);
  return { stale_count: r.rows.length, notifications: sent };
}

async function jobOverdue(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.owner_id, o.org_id, o.next_action, to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due
     FROM opportunities o
     WHERE o.status IN ('in_progress','hold') AND o.next_action_due IS NOT NULL AND o.next_action_due < current_date`,
  );
  const targets = await notifyTargetsBatch(db, r.rows.map((row) => String(row.id)));
  const items: Parameters<typeof createNotificationsBatch>[1] = [];
  for (const row of r.rows) {
    for (const uid of targets.get(String(row.id)) ?? []) {
      items.push({
        userId: uid, ntype: 'action_overdue',
        title: `【次回行動 期限超過】${row.opp_code} ${row.name}`,
        body: `期限: ${row.next_action_due} / 内容: ${row.next_action ?? ''}`,
        link: oppLink(String(row.opp_code)), entityType: 'opportunity', entityId: String(row.id),
      });
    }
  }
  const sent = await createNotificationsBatch(db, items);
  return { overdue_count: r.rows.length, notifications: sent };
}

async function jobRemind(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.owner_id, o.org_id, o.next_action, to_char(o.next_action_due,'YYYY-MM-DD') AS next_action_due
     FROM opportunities o
     WHERE o.status IN ('in_progress','hold') AND o.next_action_due IS NOT NULL
       AND o.next_action_due BETWEEN current_date AND current_date + make_interval(days => (SELECT COALESCE((value->>'value')::int,3) FROM settings WHERE key='ACTION_REMIND_DAYS'))`,
  );
  const targets = await notifyTargetsBatch(db, r.rows.map((row) => String(row.id)));
  const items: Parameters<typeof createNotificationsBatch>[1] = [];
  for (const row of r.rows) {
    for (const uid of targets.get(String(row.id)) ?? []) {
      items.push({
        userId: uid, ntype: 'action_remind',
        title: `【次回行動 期限前】${row.opp_code} ${row.name}`,
        body: `期限: ${row.next_action_due} / 内容: ${row.next_action ?? ''}`,
        link: oppLink(String(row.opp_code)), entityType: 'opportunity', entityId: String(row.id),
      });
    }
  }
  const sent = await createNotificationsBatch(db, items);
  return { remind_count: r.rows.length, notifications: sent };
}

async function jobDuplicates(db: NeonClient): Promise<Record<string, unknown>> {
  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.customer_id, c.code AS customer_code, c.name AS customer_name,
            o.region_id, o.work_type_id, to_char(o.expected_order_date,'YYYY-MM-DD') AS expected_order_date
     FROM opportunities o LEFT JOIN customers c ON c.id=o.customer_id
     WHERE o.status IN ('in_progress','hold') AND o.last_updated_at > now() - interval '30 days'`,
  );
  const targets = r.rows as unknown as OppScanInput[];
  const res = await scanDuplicatesBatch(db, targets);
  return { scanned: targets.length, candidates: res.candidates };
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
