-- =====================================================================
-- 002_seed_masters.sql — 組織・マスター初期データ
-- 適用: scripts/migrate.ts / seed.ts（冪等: ON CONFLICT DO NOTHING / DO UPDATE）
-- 設計根拠: 詳細仕様設計書 v1.0 §6 案件状態・確度設計 / §19 設定パラメータ
-- =====================================================================

BEGIN;

-- ---- 組織 ----
INSERT INTO organizations (code, name, org_type, sort_order, parent_id) VALUES
  ('HQ', '営業本部', 'hq', 0, NULL),
  ('D1', '第一営業部', 'department', 10, (SELECT id FROM organizations WHERE code = 'HQ')),
  ('D2', '第二営業部', 'department', 20, (SELECT id FROM organizations WHERE code = 'HQ')),
  ('B1', '東京支店営業部', 'branch', 30, (SELECT id FROM organizations WHERE code = 'HQ')),
  ('B2', '大阪支店営業部', 'branch', 40, (SELECT id FROM organizations WHERE code = 'HQ'))
ON CONFLICT (code) DO NOTHING;

-- ---- 官民区分 ----
INSERT INTO masters (mtype, code, name, sort_order) VALUES
  ('public_private', 'PUBLIC',  '公共', 10),
  ('public_private', 'PRIVATE', '民間', 20)
ON CONFLICT (mtype, code) DO NOTHING;

-- ---- 地域 ----
INSERT INTO masters (mtype, code, name, sort_order) VALUES
  ('region', 'HOKKAIDO', '北海道', 10),
  ('region', 'TOHOKU',   '東北',   20),
  ('region', 'KANTO',    '関東',   30),
  ('region', 'CHUBU',    '中部',   40),
  ('region', 'KINKI',    '近畿',   50),
  ('region', 'CHUGOKU',  '中国',   60),
  ('region', 'SHIKOKU',  '四国',   70),
  ('region', 'KYUSHU',   '九州',   80),
  ('region', 'OKINAWA',  '沖縄',   90)
ON CONFLICT (mtype, code) DO NOTHING;

-- ---- 工種 ----
INSERT INTO masters (mtype, code, name, sort_order) VALUES
  ('work_type', 'CIVIL',      '土木',       10),
  ('work_type', 'ARCH',       '建築',       20),
  ('work_type', 'EQUIP',      '設備',       30),
  ('work_type', 'MAINT',      '維持管理',   40),
  ('work_type', 'SURVEY',     '調査・測量', 50),
  ('work_type', 'DESIGN',     '設計',       60),
  ('work_type', 'OTHER',      'その他',     99)
ON CONFLICT (mtype, code) DO NOTHING;

-- ---- 案件段階（詳細仕様設計書 §6.1 初期候補）----
INSERT INTO masters (mtype, code, name, sort_order) VALUES
  ('stage', 'INQUIRY',     '引合い',       10),
  ('stage', 'FORECAST',    '発注見通し',   20),
  ('stage', 'ANNOUNCE',    '公告予定',     30),
  ('stage', 'PROPOSAL',    '提案/準備',    40),
  ('stage', 'BID',         '応札',         50),
  ('stage', 'AWAITING',    '結果待ち',     60)
ON CONFLICT (mtype, code) DO NOTHING;

-- ---- 確度（予測重み付き）----
INSERT INTO masters (mtype, code, name, sort_order, weight, meta) VALUES
  ('probability', 'P10', '極めて低い', 10, 0.10, '{"definition":"情報収集段階。根拠となる確約なし"}'),
  ('probability', 'P30', '低い',       20, 0.30, '{"definition":"発注見通しが具体化しつつある"}'),
  ('probability', 'P50', '五分',       30, 0.50, '{"definition":"提案・見積提示済み。競合あり"}'),
  ('probability', 'P70', '高い',       40, 0.70, '{"definition":"優先度が高い。受注の可能性大"}'),
  ('probability', 'P90', '極めて高い', 50, 0.90, '{"definition":"結果待ち・内示あり"}'),
  ('probability', 'P100','受注確定',   60, 1.00, '{"definition":"受注確定済み"}')
ON CONFLICT (mtype, code) DO NOTHING;

-- ---- 失注理由 ----
INSERT INTO masters (mtype, code, name, sort_order) VALUES
  ('loss_reason', 'PRICE',     '価格競争力不足', 10),
  ('loss_reason', 'TECH',      '技術提案不足',   20),
  ('loss_reason', 'NOT_INVITE','指名外',         30),
  ('loss_reason', 'TIMING',    '予算・時期ズレ', 40),
  ('loss_reason', 'CUSTOMER',  '顧客都合',       50),
  ('loss_reason', 'OTHER',     'その他',         99)
ON CONFLICT (mtype, code) DO NOTHING;

-- ---- 機密区分 ----
INSERT INTO masters (mtype, code, name, sort_order) VALUES
  ('confidentiality', 'C1', '一般（通常）', 10),
  ('confidentiality', 'C2', '要管理',       20),
  ('confidentiality', 'C3', '機密（限定）', 30)
ON CONFLICT (mtype, code) DO NOTHING;

-- ---- 行動種別 ----
INSERT INTO masters (mtype, code, name, sort_order) VALUES
  ('action_type', 'VISIT',   '訪問',   10),
  ('action_type', 'CALL',    '電話',   20),
  ('action_type', 'PROPOSE', '提案',   30),
  ('action_type', 'INQUIRY', '照会',   40),
  ('action_type', 'MEETING', '会議',   50),
  ('action_type', 'BID',     '入札',   60),
  ('action_type', 'OTHER',   'その他', 99)
ON CONFLICT (mtype, code) DO NOTHING;

COMMIT;
