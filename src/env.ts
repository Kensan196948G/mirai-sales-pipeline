/**
 * Environment bindings for the Worker.
 */
export interface Env {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  CRON_SECRET: string;
  ENVIRONMENT?: string;
  /** MVP 公開デモ用のログイン認証バイパス（'true' で有効）。production では無視される。 */
  AUTH_BYPASS?: string;
  /** バイパス時に成りすますユーザーの email。未指定なら在籍中の admin を1件採用 */
  AUTH_BYPASS_EMAIL?: string;
  APP_NAME?: string;
  ASSETS?: Fetcher; // Cloudflare Workers static assets binding (optional)
  [key: string]: unknown;
}
