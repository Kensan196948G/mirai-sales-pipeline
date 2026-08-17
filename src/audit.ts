/** 監査ログ書き込みヘルパー（詳細仕様設計書 §15） */
import { NeonClient } from './db/client.ts';

export interface AuditEntry {
  user_id?: string | null;
  user_name?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  reason?: string | null;
  ip?: string | null;
}

export async function writeAudit(db: NeonClient, entry: AuditEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, field, old_value, new_value, reason, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        entry.user_id ?? null,
        entry.user_name ?? null,
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.field ?? null,
        entry.old_value ?? null,
        entry.new_value ?? null,
        entry.reason ?? null,
        entry.ip ?? null,
      ],
    );
  } catch (e) {
    // 監査ログの失敗で業務処理を止めない（記録漏れは job/quality で検知）
    console.error('audit write failed:', e);
  }
}

/** 値を監査用文字列へ */
export function auditValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
