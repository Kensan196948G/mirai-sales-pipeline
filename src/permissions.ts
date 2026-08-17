/** 権限・組織スコープ（詳細仕様設計書 §14 権限・セキュリティ） */
import { NeonClient } from './db/client.ts';
import { ROLE_RANK } from './config.ts';
import type { AuthUser } from './types.ts';

export interface OrgNode {
  id: string;
  code: string;
  name: string;
  org_type: string;
  parent_id: string | null;
}

/** 組織ツリー取得 */
export async function fetchOrgTree(db: NeonClient): Promise<OrgNode[]> {
  const r = await db.query('SELECT id, code, name, org_type, parent_id FROM organizations WHERE is_active = true ORDER BY sort_order');
  return r.rows as unknown as OrgNode[];
}

/** 指定組織の配下（自身含む）の id 集合 */
export function orgDescendants(tree: OrgNode[], rootId: string): Set<string> {
  const result = new Set<string>([rootId]);
  const byParent = new Map<string, string[]>();
  for (const n of tree) {
    if (n.parent_id) {
      const arr = byParent.get(n.parent_id) ?? [];
      arr.push(n.id);
      byParent.set(n.parent_id, arr);
    }
  }
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of byParent.get(cur) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}

/** ユーザーの閲覧可能な組織 id 集合（admin/hq は全組織） */
export async function visibleOrgIds(db: NeonClient, user: AuthUser): Promise<Set<string>> {
  if (user.role === 'admin' || user.role === 'hq') {
    const tree = await fetchOrgTree(db);
    return new Set(tree.map((n) => n.id));
  }
  const tree = await fetchOrgTree(db);
  return orgDescendants(tree, user.org_id);
}

/**
 * 機密(C3)案件の閲覧可否。
 * owner / co-owner / 同一組織のmanager以上 / hq / admin のみ可。
 */
export async function canViewConfidential(db: NeonClient, user: AuthUser, opp: { owner_id: string; org_id: string }): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'hq') return true;
  if (user.id === opp.owner_id) return true;
  const member = await db.queryOne('SELECT 1 FROM opportunity_members WHERE opportunity_id = (SELECT id FROM opportunities WHERE id = $2) AND user_id = $1', [user.id, opp.org_id]);
  // 同一組織の manager 以上
  const isManager = (ROLE_RANK[user.role] ?? 0) >= (ROLE_RANK.manager ?? 0);
  const sameOrg = user.org_id === opp.org_id || (await isWithinOrg(db, opp.org_id, user.org_id));
  return Boolean(member) || (isManager && sameOrg);
}

/** opp の組織が user の組織の配下か（user 側から見た可視範囲） */
export async function isWithinOrg(db: NeonClient, targetOrgId: string, userOrgId: string): Promise<boolean> {
  const tree = await fetchOrgTree(db);
  return orgDescendants(tree, userOrgId).has(targetOrgId);
}

/**
 * 案件更新可否。
 * - admin / hq: 可
 * - manager: 自組織配下の案件 可
 * - sales/viewer: owner / co-owner のみ可（viewer は別途書込禁止レイヤで弾く）
 */
export async function canUpdateOpportunity(db: NeonClient, user: AuthUser, opp: { id: string; owner_id: string; org_id: string }): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'hq') return true;
  if (user.role === 'manager') return isWithinOrg(db, opp.org_id, user.org_id);
  if (user.id === opp.owner_id) return true;
  const member = await db.queryOne('SELECT 1 FROM opportunity_members WHERE opportunity_id = $1 AND user_id = $2', [opp.id, user.id]);
  return Boolean(member);
}

/** 組織配下 id リストを SQL 配列リテラルに変換 */
export function idsToSqlArray(ids: Set<string>): string {
  return '{' + [...ids].map((id) => `"${id}"`).join(',') + '}';
}
