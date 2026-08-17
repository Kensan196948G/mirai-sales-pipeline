-- =====================================================================
-- 001_initial.sql — 営業パイプライン・受注予測管理 初期スキーマ
-- 適用: scripts/migrate.ts (冪等)
-- 設計根拠: 詳細仕様設計書 v1.0 §4 データモデル / §5 主要データ項目定義
-- =====================================================================

BEGIN;

-- 拡張
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================================
-- 組織 (Organization) — 営業本部 / 部 / 支店
-- =====================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  parent_id   uuid REFERENCES organizations(id) ON DELETE SET NULL,
  org_type    text NOT NULL DEFAULT 'department' CHECK (org_type IN ('hq','department','branch')),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- ユーザー (User)
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  display_name  text NOT NULL,
  password_hash text NOT NULL,             -- PBKDF2: iterations:salt:hash (hex)
  role          text NOT NULL DEFAULT 'sales' CHECK (role IN ('admin','hq','manager','sales','viewer')),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =====================================================================
-- セッション (Session)
-- =====================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id            text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,      -- SHA-256 hex
  expires_at    timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- =====================================================================
-- マスター (Master) — 地域/工種/段階/確度/失注理由/機密区分/行動種別/官民区分
-- =====================================================================
CREATE TABLE IF NOT EXISTS masters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mtype       text NOT NULL CHECK (mtype IN ('region','work_type','stage','probability','loss_reason','confidentiality','action_type','public_private')),
  code        text NOT NULL,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  weight      numeric(6,4),                -- 確度の予測重み (0〜1)
  meta        jsonb NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mtype, code)
);
CREATE INDEX IF NOT EXISTS idx_masters_type ON masters(mtype, is_active, sort_order);

-- =====================================================================
-- 顧客・発注者マスター (Customer/Issuer)
-- =====================================================================
CREATE TABLE IF NOT EXISTS customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'both' CHECK (kind IN ('customer','issuer','both')),
  region_id   uuid REFERENCES masters(id),
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING gin (name gin_trgm_ops);

-- =====================================================================
-- 営業案件 (Opportunity)
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS opp_code_seq START 1001;

CREATE TABLE IF NOT EXISTS opportunities (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opp_code              text NOT NULL UNIQUE,            -- OPP-0001001 形式
  name                  text NOT NULL,
  customer_id           uuid REFERENCES customers(id),
  public_private_id     uuid REFERENCES masters(id),     -- 官民区分
  region_id             uuid REFERENCES masters(id),     -- 地域
  work_type_id          uuid REFERENCES masters(id),     -- 工種
  org_id                uuid NOT NULL REFERENCES organizations(id),  -- 主管組織
  owner_id              uuid NOT NULL REFERENCES users(id),          -- 主担当
  stage_id              uuid NOT NULL REFERENCES masters(id),        -- 案件段階
  probability_id        uuid NOT NULL REFERENCES masters(id),        -- 確度
  expected_amount       numeric(15,0) NOT NULL DEFAULT 0 CHECK (expected_amount >= 0),
  expected_gross_profit numeric(15,0),
  gross_margin_rate     numeric(6,2),                    -- % (算出)
  expected_order_date   date,
  next_action           text,
  next_action_due       date,
  status                text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','won','lost','hold','cancelled')),
  confidentiality_id    uuid NOT NULL REFERENCES masters(id),
  loss_reason_id        uuid REFERENCES masters(id),
  loss_note             text,
  won_at                timestamptz,
  lost_at               timestamptz,
  one_drive_url         text,
  direct_cloud_url      text,
  notes                 text,
  stage_changed_at      timestamptz,
  probability_changed_at timestamptz,
  last_updated_at       timestamptz NOT NULL DEFAULT now(),   -- 停滞判定基準
  version               integer NOT NULL DEFAULT 1,           -- 楽観ロック
  created_by            uuid REFERENCES users(id),
  updated_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opps_org ON opportunities(org_id);
CREATE INDEX IF NOT EXISTS idx_opps_owner ON opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_opps_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opps_order_date ON opportunities(expected_order_date);
CREATE INDEX IF NOT EXISTS idx_opps_stage ON opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_opps_prob ON opportunities(probability_id);
CREATE INDEX IF NOT EXISTS idx_opps_updated ON opportunities(last_updated_at);
CREATE INDEX IF NOT EXISTS idx_opps_region ON opportunities(region_id);
CREATE INDEX IF NOT EXISTS idx_opps_worktype ON opportunities(work_type_id);
CREATE INDEX IF NOT EXISTS idx_opps_name ON opportunities USING gin (name gin_trgm_ops);

-- 共同担当 (Opportunity members)
CREATE TABLE IF NOT EXISTS opportunity_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'co' CHECK (role IN ('owner','co')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_opp_members_user ON opportunity_members(user_id);

-- =====================================================================
-- 営業行動・次回アクション (Action)
-- =====================================================================
CREATE TABLE IF NOT EXISTS actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id    uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  action_type_id    uuid REFERENCES masters(id),     -- 訪問/電話/提案/照会/会議
  title             text,
  scheduled_at      timestamptz,                     -- 予定日時
  done_at           timestamptz,                     -- 実施日時
  is_done           boolean NOT NULL DEFAULT false,
  owner_id          uuid REFERENCES users(id),
  result            text,                            -- 実施内容・要点
  next_action       text,
  next_action_due   date,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_opp ON actions(opportunity_id, done_at);

-- =====================================================================
-- 文書参照 (DocumentLink) — OneDrive作業版 / DirectCloud正本
-- =====================================================================
CREATE TABLE IF NOT EXISTS doc_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN ('working','final')),
  provider        text NOT NULL DEFAULT 'other' CHECK (provider IN ('onedrive','directcloud','other')),
  url             text NOT NULL,
  title           text,
  version         text,
  confirmed_at    date,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doclinks_opp ON doc_links(opportunity_id);

-- =====================================================================
-- 年間受注計画 (SalesPlan)
-- =====================================================================
CREATE TABLE IF NOT EXISTS sales_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year        integer NOT NULL,
  org_id             uuid NOT NULL REFERENCES organizations(id),
  public_private_id  uuid REFERENCES masters(id),
  region_id          uuid REFERENCES masters(id),
  work_type_id       uuid REFERENCES masters(id),
  target_amount      numeric(15,0) NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  target_gross_profit numeric(15,0),
  revision           integer NOT NULL DEFAULT 1,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  created_by         uuid REFERENCES users(id),
  updated_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_year_org ON sales_plans(fiscal_year, org_id);

-- =====================================================================
-- 予測スナップショット (ForecastSnapshot) + 明細
-- =====================================================================
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  label         text NOT NULL,
  fiscal_year   integer NOT NULL,
  month         integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  totals        jsonb NOT NULL DEFAULT '{}',
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON forecast_snapshots(snapshot_date DESC);

CREATE TABLE IF NOT EXISTS forecast_snapshot_details (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id           uuid NOT NULL REFERENCES forecast_snapshots(id) ON DELETE CASCADE,
  opportunity_id        uuid NOT NULL REFERENCES opportunities(id),
  org_id                uuid,
  region_id             uuid,
  work_type_id          uuid,
  stage_id              uuid,
  probability_id        uuid,
  probability_weight    numeric(6,4),
  status                text,
  expected_amount       numeric(15,0) NOT NULL DEFAULT 0,
  weighted_amount       numeric(15,0) NOT NULL DEFAULT 0,
  expected_gross_profit numeric(15,0),
  expected_order_month  integer,                 -- YYYYMM
  UNIQUE (snapshot_id, opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_snapdet_snapshot ON forecast_snapshot_details(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_snapdet_org ON forecast_snapshot_details(org_id);

-- =====================================================================
-- 監査ログ (AuditLog)
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid,
  user_name   text,
  action      text NOT NULL,          -- create/update/status_change/export/login/...
  entity_type text NOT NULL,          -- opportunity/plan/master/user/...
  entity_id   text NOT NULL,
  field       text,
  old_value   text,
  new_value   text,
  reason      text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

-- =====================================================================
-- 通知 (Notification) — アプリ内通知アウトボックス
-- =====================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ntype       text NOT NULL CHECK (ntype IN ('stale','action_overdue','action_remind','duplicate','meeting','system')),
  title       text NOT NULL,
  body        text,
  link        text,
  entity_type text,
  entity_id   text,
  dedup_key   text NOT NULL UNIQUE,   -- user:ntype:entityType:entityId（冪等作成用）
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, created_at DESC);

-- =====================================================================
-- 重複候補 (DuplicateCandidate)
-- =====================================================================
CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opp_a_id       uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  opp_b_id       uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  score          numeric(6,2) NOT NULL,
  matched_fields jsonb NOT NULL DEFAULT '[]',
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','merged','separate','dismissed')),
  decided_by     uuid REFERENCES users(id),
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opp_a_id, opp_b_id)
);
CREATE INDEX IF NOT EXISTS idx_dups_status ON duplicate_candidates(status);

-- =====================================================================
-- 設定 (Setting) / ジョブ実行履歴 (JobRun)
-- =====================================================================
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('running','ok','error')),
  detail      jsonb NOT NULL DEFAULT '{}',
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_jobruns_name ON job_runs(job_name, started_at DESC);

-- =====================================================================
-- 初期設定値（設計書 §19 設定パラメータ）
-- =====================================================================
INSERT INTO settings (key, value, description) VALUES
  ('STALE_DAYS', '{"value": 14}', '長期未更新判定日数（最終更新からN日で未更新候補）'),
  ('STAGE_STALE_DAYS', '{"value": 30}', '同一段階停滞判定日数'),
  ('ACTION_REMIND_DAYS', '{"value": 3}', '次回行動の事前通知日数'),
  ('DUPLICATE_THRESHOLD', '{"value": 0.6}', '重複候補判定しきい値（0〜1）'),
  ('FORECAST_SNAPSHOT_DAY', '{"value": 1}', '予測スナップショット締め日（月初1日に前月分を確定）'),
  ('FORECAST_WEIGHT_MODE', '{"value": true}', '確度加重見込の使用有無'),
  ('SESSION_TTL_HOURS', '{"value": 168}', 'セッション有効時間（時間）')
ON CONFLICT (key) DO NOTHING;

COMMIT;
