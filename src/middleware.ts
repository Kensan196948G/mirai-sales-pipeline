/** Hono ミドルウェア: 認証 / RBAC / CSRF / レート制限 / エラーハンドリング */
import { Hono, type Context, type Next } from 'hono';
import { NeonClient } from './db/client.ts';
import { hashToken } from './auth.ts';
import { Errors, AppError } from './errors.ts';
import { ROLE_RANK } from './config.ts';
import type { AuthUser, AppEnv } from './types.ts';

export const SESSION_COOKIE = 'msp_session';

/** DB クライアント注入 */
export function dbProvider() {
  return async (c: Context<AppEnv>, next: Next) => {
    if (!c.get('db')) {
      const db = new NeonClient(c.env.DATABASE_URL);
      c.set('db', db);
    }
    await next();
  };
}

/** セッション認証（失敗時は user=null。要ログインは requireRole で判定） */
export async function sessionAuth(c: Context<AppEnv>, next: Next) {
  c.set('user', null);
  const token = c.req.header('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (token) {
    try {
      const tokenHash = await hashToken(decodeURIComponent(token));
      const row = await c.get('db').queryOne<Record<string, unknown>>(
        `SELECT u.id, u.email, u.display_name, u.role, u.org_id, o.code AS org_code, o.name AS org_name, o.org_type,
                s.expires_at, s.id AS session_id
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN organizations o ON o.id = u.org_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active = true`,
        [tokenHash],
      );
      if (row) {
        c.set('user', {
          id: row.id,
          email: row.email,
          display_name: row.display_name,
          role: row.role,
          org_id: row.org_id,
          org_code: row.org_code,
          org_name: row.org_name,
          org_type: row.org_type,
        } as AuthUser);
        // セッション延長
        await c.get('db').query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]).catch(() => {});
      }
    } catch {
      c.set('user', null);
    }
  }
  await next();
}

/** ロール要件（指定ロール以上のみ許可） */
export function requireRole(...roles: string[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user');
    if (!user) throw Errors.unauthorized();
    if (roles.length > 0 && !roles.includes(user.role) && !roles.includes('admin')) {
      // admin は常に許可
      if (user.role !== 'admin' && !roles.some((r) => (ROLE_RANK[user.role] ?? 0) >= (ROLE_RANK[r] ?? 0))) {
        throw Errors.forbidden();
      }
    }
    await next();
  };
}

/** 管理ロール（hq/admin） */
export function requireHQ() {
  return requireRole('hq', 'admin');
}

/** CSRF 対策: 変更系リクエストの Origin 検証（同一オリジンのみ許可） */
export async function csrfGuard(c: Context<AppEnv>, next: Next) {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const origin = c.req.header('origin');
  if (origin) {
    const host = c.req.header('host');
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      throw Errors.badRequest('Origin が不正です');
    }
    if (originHost !== host) {
      throw new AppError(403, 'オリジンが一致しません', 'CSRF');
    }
  }
  await next();
}

/** 簡易レート制限（isolate 内メモリ。ログイン等に使用） */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(limit: number, windowSec: number, keyPrefix: string) {
  return async (c: Context<AppEnv>, next: Next) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    } else if (bucket.count >= limit) {
      throw Errors.tooMany();
    } else {
      bucket.count++;
    }
    await next();
  };
}

/** エラーハンドラー */
export function errorHandler(err: unknown, c: Context<AppEnv>) {
  const e = err as AppError;
  if (e instanceof AppError) {
    return c.json({ error: { code: e.code, message: e.message } }, e.status as never);
  }
  console.error('unhandled error:', err);
  return c.json({ error: { code: 'INTERNAL', message: 'サーバー内部でエラーが発生しました' } }, 500);
}

/** 404 */
export function notFoundHandler(c: Context<AppEnv>) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'リソースが見つかりません' } }, 404);
}

/** セキュリティヘッダー（API 応答） */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // API 応答は個人情報・営業情報を含むためキャッシュさせない
  'Cache-Control': 'no-store',
} as const;

/** 静的アセット（SPA HTML/JS/CSS）用のセキュリティヘッダー */
export const STATIC_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
} as const;

/** セキュリティヘッダー */
export async function securityHeaders(c: Context<AppEnv>, next: Next) {
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    c.header(k, v);
  }
}

export { Hono };
