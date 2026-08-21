# 営業パイプライン・受注予測管理（Mirai Sales Pipeline）

営業案件を組織横断で一意の案件コードと管理ルールで可視化し、部・支店・全社単位の受注見込を迅速に集計するシステムです。
案件の重複・長期停滞・更新漏れ・確度変更根拠不明を減らし、案件会議・提案資料・確定文書まで追跡できます。

- **技術スタック**: Cloudflare Workers (Hono) / Neon PostgreSQL (HTTP SQL) / React + Vite + TypeScript / node --test / GitHub Actions
- **基盤方針**: 要件定義書・詳細仕様設計書（v1.0 Draft）に従う。独自開発を最小化し既存基盤（AppSuite / desknet's NEO / OneDrive / DirectCloud）は参照・連携

## 環境と URL

| 環境 | URL | Worker | DB |
|---|---|---|---|
| **本番** | https://msp.mirai-dx-platform.com | `mirai-sales-pipeline` | Neon 本番ブランチ |
| **MVP プロトタイプ** | https://msp-mvp.mirai-dx-platform.com | `mirai-sales-pipeline-mvp` | Neon テストブランチ（`test`） |
| **開発** | https://mirai-sales-pipeline.kensan1969.workers.dev | `mirai-sales-pipeline` | ローカル/検証用 |

> 本番と MVP は同じバンドル（単一リポジトリ）からデプロイされ、`WORKER_NAME` / `DATABASE_URL` / シークレットを環境ごとに切り替えます（`scripts/deploy.mjs` は環境変数優先）。MVP はプロトタイプ・デモ用のため、本番データには接続しません。

## 機能概要

| 機能 | 内容 |
|---|---|
| 案件管理 | 一意コード（OPP-XXXXXXXX）採番、段階・確度・予定受注額・粗利・受注予定日・次回行動・機密区分・失注理由、楽観ロック更新、変更理由必須（確度変更） |
| 組織・権限 | admin / hq / manager / sales / viewer の RBAC、組織ツリー（本部・部・支店）スコープ、機密(C3)案件の閲覧制御 |
| 集計 | 単純積上げ・確度加重見込、計画差異・達成率、段階別/確度別/月別パイプライン、組織別集計 |
| 計画 | 年度別受注計画（リビジョン管理・承認状態） |
| 予測スナップショット | 月次締めで予測を固定保存し、前回との差分比較（FR-18 / JOB-05） |
| 案件健全性 | 長期未更新・次回行動期限超過・未設定・重複候補の検出（JOB-01〜03, 06） |
| 重複検知 | 顧客コード・案件名類似（CJK対応）・地域・工種・時期によるスコアリング。判定は人が実施 |
| 通知 | アプリ内通知（停滞・期限超過・期限前リマインド）。dedup_key で冪等 |
| 監査 | 重要項目変更の before/after と理由・IP を監査ログへ記録（§15） |
| CSV 出力 | UTF-8 BOM 付き・権限チェック・監査記録（FR-19） |
| 認証 | PBKDF2(SHA-256, 60,000回) パスワードハッシュ、セッショントークンは DB に SHA-256 ハッシュ保存、HttpOnly + Secure + SameSite=Lax Cookie |

## 技術構成

```
web/          React SPA（Vite + TypeScript）
src/          Worker 本体（Hono + Neon HTTP SQL クライアント）
src/routes/   API ルート（auth / opportunities / plans / misc / csv / internal）
migrations/   SQL マイグレーション（冪等・上から順に適用）
scripts/      ビルド・マイグレーション・シード・デプロイスクリプト
tests/        node --test（unit / integration）
.github/      CI（lint/typecheck/test/build）、日次ジョブ（GitHub Actions cron の安全網）
```

## ローカル開発

前提: Node.js >= 22、psql（migration 適用用）

```bash
npm install
cp .env.example .env   # DATABASE_URL / SESSION_SECRET / CRON_SECRET を設定
npm run db:migrate     # migrations/*.sql を未適用分のみ適用
npm run db:seed        # マスター・組織・デモユーザー投入（--demo-opportunities でサンプル案件も）
npm run dev            # Vite (5173) + API サーバー (8787)
```

デモログイン（ローカル開発のみ）: `admin@mirai.local` / 初期パスワード（seed 実行時に `SEED_DEMO_PASSWORD` 未設定かつ非本番環境なら `Mirai#2026`。本番環境では `SEED_DEMO_PASSWORD` の設定が必須で、未設定なら seed は失敗する）。

## 検証コマンド

```bash
npm run lint          # ESLint（0 警告で成功）
npm run typecheck     # TypeScript 型チェック（server + web）
npm run test:unit     # 単体テスト
npm run test:integration  # 統合テスト（要 DATABASE_URL_TEST。未設定時は DATABASE_URL を使用）
npm run build:all     # web ビルド + Worker バンドル生成（worker-build/worker.mjs）
```

統合テストは `DATABASE_URL_TEST`（テスト専用 Neon ブランチ）を優先して使用します。**本番 DB を直接テスト対象にしないでください。**

## デプロイ

```bash
npm run build:all
node scripts/deploy.mjs          # 本番 Worker を更新（要 CLOUDFLARE_API_TOKEN）
node scripts/deploy.mjs --secrets # シークレットも .env から設定（初回のみ）
node scripts/deploy.mjs --crons   # cron トリガーも更新（初回のみ・要 Workers Paid）
```

環境変数で `.env` を上書きして複数環境へデプロイできます（`scripts/deploy.mjs` は環境変数優先）:

```bash
# MVP プロトタイプへデプロイ（例）
WORKER_NAME=mirai-sales-pipeline-mvp \
APP_NAME=mirai-sales-pipeline-mvp \
DATABASE_URL=postgresql://...@<test-branch>-pooler.../neondb \
SESSION_SECRET=$(openssl rand -hex 32) \
CRON_SECRET=$(openssl rand -hex 32) \
ENVIRONMENT=production \
node scripts/deploy.mjs --secrets
```

または `npx wrangler deploy`（wrangler.toml 参照、要 wrangler 認証）。

デプロイ後の稼働確認:

```bash
curl -s https://msp.mirai-dx-platform.com/api/internal/healthz
# {"ok":true,"database":"ok","postgres":"PostgreSQL 18.x",...}
```

本番 DB スキーマ変更は「一時ブランチで検証 → 承認 → 適用 → rollback 手順確認」の順で実施（[docs/ops/RUNBOOK.md](docs/ops/RUNBOOK.md)）。

## 環境変数

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL 接続文字列（pooler / HTTP SQL 対応ホスト） |
| `DATABASE_URL_TEST` | 統合テスト専用 DB（Neon テストブランチ） |
| `SESSION_SECRET` | セッション署名用秘密鍵（`openssl rand -hex 32`） |
| `CRON_SECRET` | 定期処理呼び出し用共通秘密鍵（`x-cron-secret` ヘッダー） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API トークン（Workers Scripts: Edit 権限。Git 管理外） |
| `WORKER_NAME` | Worker 名（既定: mirai-sales-pipeline） |
| `ENVIRONMENT` | 環境名（production / test / development / mvp） |
| `AUTH_BYPASS` | MVP 公開デモ用のログイン認証バイパス（`'true'` で有効。**production では無効化**される安全装置） |
| `AUTH_BYPASS_EMAIL` | バイパス時に成りすますユーザーの email（未指定なら在籍中の admin） |
| `SEED_DEMO_PASSWORD` | シード実行時のデモユーザー初期パスワード（本番では必須） |

本番の `DATABASE_URL` / `SESSION_SECRET` / `CRON_SECRET` は Cloudflare Worker Secrets（`.env` は Git 管理外、コミット禁止）。

## 定期処理

| ジョブ | 内容 | 実行 |
|---|---|---|
| JOB-01 | 長期未更新案件の通知 | 日次 cron |
| JOB-02 | 次回行動期限超過の通知 | 日次 cron |
| JOB-02b | 期限前リマインド通知 | 日次 cron |
| JOB-03 | 重複候補スキャン | 日次 cron |
| JOB-05 | 予測スナップショット自動確定（前月締め、月初1日） | 日次 cron |
| JOB-06 | データ品質レポート | 日次 cron |

日次ジョブは **GitHub Actions**（`.github/workflows/daily-jobs.yml`）が毎日 09:30 JST に `/api/internal/cron`（`x-cron-secret` 認証）を実行します。本アカウントは Workers 無料プランの cron 上限（5件/アカウント）のため Worker cron は未設定ですが、ダッシュボードアクセス時の遅延実行（24時間以上未実行なら起動）も多重保険として機能します。Workers Paid へのアップグレード後は `wrangler.toml` の `[triggers]` で cron を追加できます。

## 運用・監視・バックアップ

- [docs/ops/RUNBOOK.md](docs/ops/RUNBOOK.md) — デプロイ・ロールバック・障害対応手順
- [docs/ops/monitoring.md](docs/ops/monitoring.md) — ヘルスチェック・SLI/SLO・アラート
- [docs/ops/backup.md](docs/ops/backup.md) — Neon バックアップ（PITR）・復元手順
- [docs/ops/security.md](docs/ops/security.md) — セキュリティ設計・Secrets 管理・ローテーション
- [docs/ops/operations.md](docs/ops/operations.md) — 日次〜四半期の運用台帳

## 既知の残存リスク（2026-08-21 現在）

| リスク | 深刻度 | 現状・対応 |
|---|---|---|
| ブランチ保護未設定 | Medium | GitHub 無料プラン制限により main への PR 必須チェックが未強制。運用ルール（AGENTS.md §5）で main 直接 push 禁止を順守 |
| Workers 無料プランの制限 | Medium | cron トリガー上限（5件/アカウント）のため日次ジョブは GitHub Actions 経由。サブリクエスト上限（50/呼び出し）はジョブのバッチ化で対応済み |
| PBKDF2 イテレーション 60,000 回 | Medium | OWASP 推奨（600,000 回）の 1/10。パスワード再ハッシュ化を伴うため別途マイグレーションが必要 |
| Cloudflare Access Service Token 未設定 | Low | 本番カスタムドメインは Access 保護。日次ジョブは workers.dev エンドポイント（同一 Worker・Access 非対象）経由で代替 |
| desknet's NEO / OneDrive / DirectCloud 実連携 | Low | 要件・設計書の「環境確認後に確定」事項。現在はリンク管理のみ（FR-12〜15 の連携部分は未実装） |
| 本番ログの Workers Observability | Low | 無料プランではログ取得が限定的。エラー率は healthz / cron / スモークで代替確認 |

## ライセンス

UNLICENSED（社内専用。外部公開・再配布禁止）
