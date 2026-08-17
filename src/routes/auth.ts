/** 認証ルート */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { loginSchema } from '../validation.ts';
import { verifyPassword, generateSessionToken, hashToken } from '../auth.ts';
import { Errors } from '../errors.ts';
import { rateLimit, SESSION_COOKIE } from '../middleware.ts';
import { writeAudit } from '../audit.ts';
import type { AppEnv, AuthUser } from '../types.ts';
import { generateRandomHex } from '../auth.ts';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', rateLimit(10, 60, 'login'), zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const db = c.get('db');
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT u.id, u.email, u.display_name, u.role, u.org_id, u.password_hash, u.is_active,
            o.code AS org_code, o.name AS org_name, o.org_type
     FROM users u JOIN organizations o ON o.id = u.org_id
     WHERE u.email = $1`,
    [email.toLowerCase()],
  );
  if (!row || !row.is_active) throw Errors.unauthorized('メールアドレスまたはパスワードが違います');
  const ok = await verifyPassword(password, String(row.password_hash));
  if (!ok) throw Errors.unauthorized('メールアドレスまたはパスワードが違います');

  const token = generateSessionToken();
  const tokenHash = await hashToken(token);
  const ttl = await getSessionTtl(db);
  const sessionId = generateRandomHex(16);
  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(hours => $4))`,
    [sessionId, row.id, tokenHash, ttl],
  );
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
  await writeAudit(db, { user_id: String(row.id), user_name: String(row.display_name), action: 'login', entity_type: 'user', entity_id: String(row.id), ip: c.req.header('cf-connecting-ip') });

  const secure = c.req.url.startsWith('https://');
  c.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${ttl * 3600}`);
  return c.json({ user: toAuthUser(row) });
});

authRoutes.post('/logout', async (c) => {
  const token = c.req.header('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (token) {
    const tokenHash = await hashToken(decodeURIComponent(token));
    await c.get('db').query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1', [tokenHash]).catch(() => {});
  }
  c.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) throw Errors.unauthorized();
  return c.json({ user });
});

export function toAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: String(row.display_name),
    role: String(row.role),
    org_id: String(row.org_id),
    org_code: String(row.org_code),
    org_name: String(row.org_name),
    org_type: String(row.org_type),
  };
}

export async function getSessionTtl(db: import('../db/client.ts').NeonClient): Promise<number> {
  const s = await db.queryOne<{ value: unknown }>(`SELECT value FROM settings WHERE key='SESSION_TTL_HOURS'`);
  const ttl = Number((s?.value as any)?.value ?? 168);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 168;
}
