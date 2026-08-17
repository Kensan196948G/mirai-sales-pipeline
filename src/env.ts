/**
 * Environment bindings for the Worker.
 */
export interface Env {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  CRON_SECRET: string;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  ASSETS?: Fetcher; // Cloudflare Workers static assets binding (optional)
  [key: string]: unknown;
}
