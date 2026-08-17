import type { NeonClient } from './db/client.ts';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  org_id: string;
  org_code: string;
  org_name: string;
  org_type: string;
}

export interface AppEnv {
  Bindings: {
    DATABASE_URL: string;
    SESSION_SECRET: string;
    CRON_SECRET: string;
    ENVIRONMENT?: string;
    ASSETS?: Fetcher;
    [key: string]: unknown;
  };
  Variables: {
    db: NeonClient;
    user: AuthUser | null;
    requestId: string;
  };
}

export interface OpportunityRow {
  id: string;
  opp_code: string;
  name: string;
  [key: string]: unknown;
}
