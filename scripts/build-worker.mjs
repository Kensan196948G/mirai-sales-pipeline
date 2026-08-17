/**
 * Worker バンドルビルド + SPA アセットのインライン化（プレーンJS）
 *   node scripts/build-worker.mjs
 * 成果物: worker-build/worker.mjs（API + SPA 静的配信、単一ファイル）
 *         worker-build/assets-manifest.json（アセット一覧: デプロイ検証用）
 * 手順: 1) src/generated/assets.ts 生成 → 2) esbuild バンドル
 */
import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'web', 'dist');
const outDir = join(root, 'worker-build');
mkdirSync(outDir, { recursive: true });

// ---- 1. SPA アセットを Worker へインライン化（KV 不要の単一デプロイ）----
if (!existsSync(distDir)) {
  console.error('web/dist がありません。先に npm run build:web を実行してください');
  process.exit(1);
}
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};
const assets = {};
function walk(dir, base) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, f.name);
    const rel = join(base, f.name).replace(/\\/g, '/');
    if (f.isDirectory()) walk(full, rel);
    else {
      const buf = readFileSync(full);
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      assets[rel] = { key: rel, contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream', content: buf.toString('utf8') };
    }
  }
}
walk(distDir, '');
// 生成モジュール（JSON.stringify で安全に文字列化）
const genPath = join(root, 'src', 'generated', 'assets.ts');
const lines = [
  '/** 生成ファイル: ビルド時に web/dist の内容をインライン化（build-worker.mjs が生成・再生成） */',
  'export const INLINE_ASSETS: Record<string, { content: string; contentType: string }> = {',
];
for (const [k, v] of Object.entries(assets)) {
  lines.push(`  ${JSON.stringify(k)}: { content: ${JSON.stringify(v.content)}, contentType: ${JSON.stringify(v.contentType)} },`);
}
lines.push('};', '');
writeFileSync(genPath, lines.join('\n'));
console.log(`generated assets.ts: ${Object.keys(assets).length} files (${(readFileSync(genPath, 'utf8').length / 1024).toFixed(1)} KB)`);
// マニフェストも保存（デプロイ検証用）
writeFileSync(join(outDir, 'assets-manifest.json'), JSON.stringify(Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, { key: v.key, contentType: v.contentType, size: v.content.length }])), null, 2));

// ---- 2. Worker バンドル ----
await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  outfile: join(outDir, 'worker.mjs'),
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: '/* mirai-sales-pipeline worker */' },
});

const workerRaw = readFileSync(join(outDir, 'worker.mjs'), 'utf8');
console.log(`worker.mjs: ${(workerRaw.length / 1024).toFixed(1)} KB (raw)`);
