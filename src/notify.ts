/** 通知アウトボックス（詳細仕様設計書 §11 NTF-01〜06） */
import { NeonClient } from './db/client.ts';

export interface NotificationInput {
  userId: string;
  ntype: 'stale' | 'action_overdue' | 'action_remind' | 'duplicate' | 'meeting' | 'system';
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * 通知作成（dedup_key により冪等）。同一ユーザー・種別・対象で既存未読があれば作成しない。
 */
export async function createNotification(db: NeonClient, n: NotificationInput): Promise<boolean> {
  const dedupKey = `${n.userId}:${n.ntype}:${n.entityType ?? ''}:${n.entityId ?? ''}`;
  try {
    const r = await db.query(
      `INSERT INTO notifications (user_id, ntype, title, body, link, entity_type, entity_id, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [n.userId, n.ntype, n.title, n.body ?? null, n.link ?? null, n.entityType ?? null, n.entityId ?? null, dedupKey],
    );
    return r.rowCount > 0;
  } catch {
    return false;
  }
}

/** 通知用リンク（フロントエンドのハッシュルート） */
export function oppLink(oppCode: string): string {
  return `/#/opportunities/${encodeURIComponent(oppCode)}`;
}
