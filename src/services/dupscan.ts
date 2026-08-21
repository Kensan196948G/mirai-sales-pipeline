/** 重複候補スキャン（作成・更新・定期処理で使用） */
import { NeonClient } from '../db/client.ts';
import { scoreDuplicates, isDuplicateCandidate } from '../duplicates.ts';

export interface OppScanInput {
  id: string;
  opp_code: string;
  name: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  region_id: string | null;
  work_type_id: string | null;
  expected_order_date: string | null;
}

/**
 * 指定案件と、その他進行中・保留案件を比較し、閾値以上の重複候補を記録する。
 * 既存候補（opp_a/opp_b 双方向）は upsert。誤検知は人が判定（自動削除しない）。
 */
export async function scanDuplicatesFor(db: NeonClient, target: OppScanInput): Promise<{ candidates: number }> {
  const thresholdRow = await db.queryOne<{ value: unknown }>(`SELECT value FROM settings WHERE key='DUPLICATE_THRESHOLD'`);
  const threshold = Number((thresholdRow?.value as any)?.value ?? 0.6);

  const r = await db.query(
    `SELECT o.id, o.opp_code, o.name, o.customer_id, c.code AS customer_code, c.name AS customer_name,
            o.region_id, o.work_type_id, to_char(o.expected_order_date, 'YYYY-MM-DD') AS expected_order_date
     FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.status IN ('in_progress','hold') AND o.id <> $1`,
    [target.id],
  );
  let candidates = 0;
  for (const row of r.rows) {
    const other = row as unknown as OppScanInput;
    const { score, matched } = scoreDuplicates(
      {
        customerCode: target.customer_code ?? null,
        customerName: target.customer_name ?? null,
        name: target.name,
        regionId: target.region_id,
        workTypeId: target.work_type_id,
        expectedOrderDate: target.expected_order_date,
      },
      {
        customerCode: other.customer_code ?? null,
        customerName: other.customer_name ?? null,
        name: other.name,
        regionId: other.region_id,
        workTypeId: other.work_type_id,
        expectedOrderDate: other.expected_order_date,
      },
    );
    if (isDuplicateCandidate({ score, matched }, threshold)) {
      const [a, b] = [target.id, other.id].sort();
      await db.query(
        `INSERT INTO duplicate_candidates (opp_a_id, opp_b_id, score, matched_fields)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (opp_a_id, opp_b_id) DO UPDATE SET score=EXCLUDED.score, matched_fields=EXCLUDED.matched_fields,
           status=CASE WHEN duplicate_candidates.status='merged' THEN 'merged' ELSE 'pending' END`,
        [a, b, score, JSON.stringify(matched)],
      );
      candidates++;
    }
  }
  return { candidates };
}

/**
 * 複数案件を相互比較して重複候補を一括記録する（日次ジョブ JOB-03 用）。
 * スコアリングはメモリ内で完結し、INSERT は UNNEST + jsonb の単一クエリで実行する。
 * これにより Cloudflare Workers のサブリクエスト上限（無料プラン 50/呼び出し）を超えない。
 */
export async function scanDuplicatesBatch(db: NeonClient, targets: OppScanInput[]): Promise<{ candidates: number }> {
  if (targets.length < 2) return { candidates: 0 };
  const thresholdRow = await db.queryOne<{ value: unknown }>(`SELECT value FROM settings WHERE key='DUPLICATE_THRESHOLD'`);
  const threshold = Number((thresholdRow?.value as any)?.value ?? 0.6);

  const rows: { opp_a: string; opp_b: string; score: number; matched: string[] }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i]!;
      const b = targets[j]!;
      if (!a.id || !b.id) continue;
      const { score, matched } = scoreDuplicates(
        {
          customerCode: a.customer_code ?? null,
          customerName: a.customer_name ?? null,
          name: a.name,
          regionId: a.region_id,
          workTypeId: a.work_type_id,
          expectedOrderDate: a.expected_order_date,
        },
        {
          customerCode: b.customer_code ?? null,
          customerName: b.customer_name ?? null,
          name: b.name,
          regionId: b.region_id,
          workTypeId: b.work_type_id,
          expectedOrderDate: b.expected_order_date,
        },
      );
      if (!isDuplicateCandidate({ score, matched }, threshold)) continue;
      if (!a.id || !b.id) continue;
      const sorted = [a.id, b.id].sort();
      const x = sorted[0]!;
      const y = sorted[1]!;
      const key = `${x}:${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ opp_a: x, opp_b: y, score, matched });
    }
  }
  if (rows.length > 0) {
    await db.query(
      `INSERT INTO duplicate_candidates (opp_a_id, opp_b_id, score, matched_fields)
       SELECT (e->>'opp_a')::uuid, (e->>'opp_b')::uuid, (e->>'score')::float8, COALESCE(e->'matched', '[]'::jsonb)
       FROM jsonb_array_elements($1::jsonb) AS e
       ON CONFLICT (opp_a_id, opp_b_id) DO UPDATE SET score=EXCLUDED.score, matched_fields=EXCLUDED.matched_fields,
         status=CASE WHEN duplicate_candidates.status='merged' THEN 'merged' ELSE 'pending' END`,
      [JSON.stringify(rows)],
    );
  }
  return { candidates: rows.length };
}
