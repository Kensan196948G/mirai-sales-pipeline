/** Cloudflare Worker エントリポイント */
import { createApp } from './app.ts';
import { NeonClient } from './db/client.ts';
import { runDailyJobs } from './jobs.ts';
import { INLINE_ASSETS } from './generated/assets.ts';
import { STATIC_SECURITY_HEADERS } from './middleware.ts';

export interface Env {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  CRON_SECRET: string;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  ASSETS_KV?: KVNamespace; // 本番: SPA 静的アセット
  [key: string]: unknown;
}

const app = createApp();

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** 静的アセット応答にセキュリティヘッダーを付与 */
function withStaticSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

async function serveFromKV(env: Env, pathname: string): Promise<Response | null> {
  if (!env.ASSETS_KV) return null;
  const key = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (key.includes('..')) return null;
  const value = await env.ASSETS_KV.get(key);
  if (value !== null) {
    return withStaticSecurityHeaders(new Response(value, {
      headers: {
        'Content-Type': contentTypeFor(key),
        'Cache-Control': key === 'index.html' ? 'no-cache' : 'public, max-age=3600',
      },
    }));
  }
  // SPA ルートフォールバック（拡張子なしパス）
  if (!pathname.includes('.')) {
    const index = await env.ASSETS_KV.get('index.html');
    if (index !== null) {
      return withStaticSecurityHeaders(new Response(index, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } }));
    }
  }
  return null;
}

function serveFromInline(pathname: string): Response | null {
  if (!INLINE_ASSETS || Object.keys(INLINE_ASSETS).length === 0) return null;
  const key = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (key.includes('..')) return null;
  let asset = INLINE_ASSETS[key];
  if (!asset && !key.includes('.')) asset = INLINE_ASSETS['index.html'];
  if (!asset) return null;
  return withStaticSecurityHeaders(new Response(asset.content, {
    headers: { 'Content-Type': asset.contentType, 'Cache-Control': key === 'index.html' ? 'no-cache' : 'public, max-age=3600' },
  }));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env as never, ctx);
    }

    // 静的アセット（KV → インラインの順）
    const kvRes = await serveFromKV(env, url.pathname);
    if (kvRes) return kvRes;
    const inlineRes = serveFromInline(url.pathname);
    if (inlineRes) return inlineRes;

    return new Response('Not Found', { status: 404 });
  },

  /** Cron トリガー: 日次ジョブ（JOB-01〜06） */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new NeonClient(env.DATABASE_URL);
    ctx.waitUntil(
      runDailyJobs(db).catch((e) => console.error('scheduled job failed:', e)),
    );
  },
};
