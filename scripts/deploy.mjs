/**
 * Cloudflare Workers デプロイスクリプト（Cloudflare REST API 直接呼び出し）
 *
 *   使い方:
 *     node scripts/deploy.mjs                # 通常デプロイ（.env の CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN）
 *     node scripts/deploy.mjs --secrets      # シークレット（DATABASE_URL/SESSION_SECRET/CRON_SECRET）も .env から設定
 *     node scripts/deploy.mjs --crons        # cron トリガーも更新
 *     node scripts/deploy.mjs --dry-run      # アップロードせず検証のみ
 *
 *   API トークンは環境変数 CLOUDFLARE_API_TOKEN（または .env）から取得する。
 *   事前に `npm run build:all` で worker-build/worker.mjs を生成しておくこと。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const withSecrets = args.includes('--secrets');
const withCrons = args.includes('--crons');

function loadEnv() {
  const envFile = join(root, '.env');
  const out = {};
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] && m[2] !== undefined) out[m[1]] = m[2];
    }
  }
  // 環境変数を優先（CI や複数環境デプロイ時に .env を上書き可能）
  for (const key of Object.keys(out)) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'WORKER_NAME', 'APP_NAME', 'DATABASE_URL', 'SESSION_SECRET', 'CRON_SECRET', 'ENVIRONMENT']) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  return out;
}

const env = loadEnv();
const ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = env.CLOUDFLARE_API_TOKEN;
const WORKER_NAME = env.WORKER_NAME ?? 'mirai-sales-pipeline';
const APP_NAME = env.APP_NAME ?? WORKER_NAME;
const CF_API = 'https://api.cloudflare.com/client/v4';

if (!ACCOUNT_ID) {
  console.error('CLOUDFLARE_ACCOUNT_ID が設定されていません（.env または環境変数）');
  process.exit(1);
}
if (!API_TOKEN) {
  console.error(
    'CLOUDFLARE_API_TOKEN が設定されていません。\n' +
    '  Cloudflare Dashboard > My Profile > API Tokens で "Workers Scripts: Edit" 権限のトークンを作成し、\n' +
    '  .env の CLOUDFLARE_API_TOKEN に設定してください（Git 管理外）。',
  );
  process.exit(1);
}

async function cf(path, options = {}) {
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    throw new Error(`Cloudflare API ${options.method ?? 'GET'} ${path} -> ${res.status}: ${json?.errors?.[0]?.message ?? text.slice(0, 300)}`);
  }
  return json;
}

// ---- 1. 成果物チェック ----
const bundlePath = join(root, 'worker-build', 'worker.mjs');
if (!existsSync(bundlePath)) {
  console.error('worker-build/worker.mjs がありません。先に npm run build:all を実行してください');
  process.exit(1);
}
const bundle = readFileSync(bundlePath, 'utf8');
const manifestPath = join(root, 'worker-build', 'assets-manifest.json');
const assets = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const assetCount = Object.keys(assets).length;
console.log(`worker.mjs: ${(bundle.length / 1024).toFixed(1)} KB / インラインアセット ${assetCount} 件`);

// ---- 2. メタデータ ----
const bindings = [
  { type: 'plain_text', name: 'APP_NAME', text: APP_NAME },
  { type: 'plain_text', name: 'ENVIRONMENT', text: env.ENVIRONMENT ?? 'production' },
];
const metadata = {
  main_module: 'worker.mjs',
  compatibility_date: '2026-08-16',
  bindings,
};

if (dryRun) {
  console.log('[dry-run] デプロイ検証のみ（アップロードしません）');
  console.log(`[dry-run] worker: ${WORKER_NAME} / account: ${ACCOUNT_ID}`);
  console.log(`[dry-run] bindings: ${bindings.map((b) => b.name).join(', ')}`);
  process.exit(0);
}

// ---- 3. スクリプトアップロード（multipart）----
// 形式: 公式ドキュメント（multipart-upload-metadata）に準拠。
//   - metadata パート: Content-Type: application/json
//   - モジュール パート: filename 付き・Content-Type: application/javascript+module
const boundary = `----msp${Date.now()}`;
const metaPart = `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
const modulePart =
  `--${boundary}\r\nContent-Disposition: form-data; name="worker.mjs"; filename="worker.mjs"\r\n` +
  `Content-Type: application/javascript+module\r\n\r\n${bundle}\r\n--${boundary}--\r\n`;
const body = metaPart + modulePart;

console.log(`> PUT /accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`);
const up = await cf(`/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`, {
  method: 'PUT',
  headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body,
});
console.log(`スクリプト更新: ${up.result?.id ?? WORKER_NAME} (${up.success ? 'success' : 'failed'})`);

// ---- 4. シークレット（--secrets 時のみ。既存シークレットを上書きしない方針）----
if (withSecrets) {
  const secrets = [
    ['DATABASE_URL', env.DATABASE_URL],
    ['SESSION_SECRET', env.SESSION_SECRET],
    ['CRON_SECRET', env.CRON_SECRET],
  ];
  for (const [name, value] of secrets) {
    if (!value) {
      console.warn(`skip secret ${name}（.env に値がありません）`);
      continue;
    }
    await cf(`/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/secrets`, {
      method: 'PUT',
      body: JSON.stringify({ name, type: 'secret_text', text: value }),
    });
    console.log(`secret ${name}: set`);
  }
}

// ---- 5. cron トリガー（--crons 時のみ）----
// 注意: Workers 無料プランは cron 上限 5 件/アカウント。上限到達時は API が 10072 を返す。
// 日次ジョブは GitHub Actions（daily-jobs.yml）と dashboard の遅延実行で代替される。
if (withCrons) {
  const crons = [{ cron: '30 0 * * *' }]; // 毎日 00:30 UTC = 09:30 JST
  await cf(`/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/schedules`, {
    method: 'PUT',
    body: JSON.stringify(crons),
  });
  console.log(`cron triggers: ${crons.map((c) => c.cron).join(', ')}`);
}

console.log('デプロイ完了。稼働確認:');
console.log(`  curl -s https://${WORKER_NAME}.<account-subdomain>.workers.dev/api/internal/healthz`);
