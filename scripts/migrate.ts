/**
 * DB マイグレーション適用スクリプト
 *   node --import tsx scripts/migrate.ts [--dry-run]
 * .env の DATABASE_URL を参照し、migrations/*.sql を未適用分のみ psql で適用する。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NeonClient } from '../src/db/client.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnv(): Record<string, string> {
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) {
    console.error('.env が見つかりません');
    process.exit(1);
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const url = env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL がありません');
    process.exit(1);
  }
  const db = new NeonClient(url);

  // 適用済み管理テーブル
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const appliedRows = await db.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.rows.map((r) => String(r.filename)));

  const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip    ${file} (already applied)`);
      continue;
    }
    console.log(`apply   ${file}${dryRun ? ' [dry-run]' : ''}`);
    if (!dryRun) {
      execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'migrations', file)], {
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    }
    count++;
  }
  console.log(dryRun ? `[dry-run] ${count} 件を適用予定` : `${count} 件を適用しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
