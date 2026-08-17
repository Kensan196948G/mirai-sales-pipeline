/** ローカル環境変数ローダー（.env 読み込み） */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadLocalEnv(): Record<string, string> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const envFile = join(root, '.env');
  const out: Record<string, string> = {};
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2];
    }
  }
  for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'CRON_SECRET']) {
    if (process.env[key]) out[key] = process.env[key]!;
  }
  return out;
}
