# 運用 Runbook — 営業パイプライン・受注予測管理

本番環境（Cloudflare Workers + Neon PostgreSQL）の運用・障害対応手順書です。

## 1. システム概要と接続先

| 項目 | 値 |
|---|---|
| 本番 URL | https://msp.mirai-dx-platform.com（カスタムドメイン） |
| MVP プロトタイプ URL | https://msp-mvp.mirai-dx-platform.com（Worker: `mirai-sales-pipeline-mvp`、DB: Neon テストブランチ） |
| 開発 URL | https://mirai-sales-pipeline.kensan1969.workers.dev（本番 Worker の workers.dev） |
| Worker（本番） | `mirai-sales-pipeline`（Cloudflare アカウント: Kensan1969@gmail.com's Account） |
| DB | Neon プロジェクト `mirai-sales-pipeline`（プロジェクトID: tiny-cake-63492081, PostgreSQL 18, aws-us-east-1） |
| リポジトリ | https://github.com/Kensan196948G/mirai-sales-pipeline（private） |
| CI | GitHub Actions（`.github/workflows/ci.yml`） |
| 日次ジョブ | GitHub Actions `daily-jobs.yml`（09:30 JST）が本番 `/api/internal/cron` を実行 + ダッシュボード遅延実行の安全網 |

## 2. 稼働確認（スモークテスト）

```bash
# ヘルスチェック（DB 接続含む）
curl -s https://msp.mirai-dx-platform.com/api/internal/healthz

# 期待値
# {"ok":true,"app":"mirai-sales-pipeline","environment":"production","database":"ok","postgres":"PostgreSQL 18.x (…)",...}
```

- `ok: false` または `database: error` → DB 接続・Worker 環境変数（DATABASE_URL）を確認
- HTTP 5xx → Worker のログ（Cloudflare Dashboard > Workers > mirai-sales-pipeline > Logs）でスタックトレース確認

## 3. デプロイ手順（正規フロー）

```bash
# 1. ローカルで全検証（CI と同等）
npm ci
npm run lint && npm run typecheck && npm run test:unit && npm run build:all

# 2. main ブランチの確定 commit からデプロイ（PR 経由でマージ済みであること）
git checkout main && git pull
npm run build:all
node scripts/deploy.mjs          # Worker 更新（要 CLOUDFLARE_API_TOKEN）
#   必要時のみ: node scripts/deploy.mjs --secrets / --crons

# 3. スモーク
curl -s https://msp.mirai-dx-platform.com/api/internal/healthz
# 主要機能: ログイン / 案件一覧 / ダッシュボード / CSV 出力 を画面で確認
```

**デプロイ前チェックリスト**
- [ ] main の確定 commit と検証済み commit が一致している（CI green の commit）
- [ ] P0 / 高リスクの未解決 issue がない
- [ ] DB migration がある場合は §4 の手順を先に実施・検証済み
- [ ] デプロイ後に healthz / スモークで稼働確認する

## 4. DB マイグレーション

```bash
# 適用（ローカル or CI。psql が必要）
npm run db:migrate              # 未適用の migrations/*.sql のみ適用
npm run db:migrate -- --dry-run # 適用予定の確認

# 本番スキーマ変更の推奨フロー（AGENTS.md §6）
# 1. Neon で一時ブランチを作成し、そこで migration を適用・動作検証
# 2. 影響をレビュー（ロック・テーブル書き換えの有無）
# 3. 本番適用前にバックアップ（PITR 設定済みなら不要な場合あり）を確認
# 4. 本番 DB に適用し、healthz と主要機能を確認
# 5. 問題があれば rollback（§6）
```

## 5. ロールバック

### Worker ロールバック

Cloudflare Dashboard > Workers > mirai-sales-pipeline > Deployments から前バージョンにロールバック。

```bash
# CLI の場合
npx wrangler rollback --name mirai-sales-pipeline
```

ロールバック後は必ず healthz とスモークテストを実施する。

### DB ロールバック

- **DDL 変更（テーブル・カラム追加等）**: 原則として前方互換マイグレーション（add column のみ等）を採用し、ロールバックは後続 migration で打ち消す。破壊的変更（drop column 等）は本番適用前に必ず一時ブランチで検証する。
- **データ破損・誤更新**: Neon の Point-in-Time Recovery（PITR）で復元（[docs/ops/backup.md](backup.md) 参照）。復元は別ブランチへの復元 → 検証 → 切替の順で行う。

## 6. 障害対応フロー

| 症状 | 初動 | エスカレーション |
|---|---|---|
| サイト全体が 5xx | healthz 確認 → Worker ログ確認 → 前バージョンへ rollback | CTO / 開発担当 |
| ログインできない | Worker ログ・DB 接続確認 → SESSION_SECRET の整合確認 | CTO |
| DB エラー | Neon コンソールで compute 状態・リソース確認 → 該当クエリを pg_stat_statements で調査 | CTO |
| 日次ジョブが動かない | job_runs テーブルで status 確認 → cron / CRON_SECRET 確認 → 手動で `/api/internal/cron` 実行 | 開発担当 |
| 案件データの誤り | 監査ログ（/api/audit-logs）で変更履歴を確認 → 必要なら DB 修正（要承認） | CTO |

### 重大障害の判断基準（要ロールバック）
- 認証・認可の突破（P0）
- データ漏えい・破損（P0）
- 主要業務（案件登録・閲覧・集計）が全ユーザーで不能（P0/P1）

## 7. 定例運用

| 頻度 | 作業 | 担当 | 手順書 |
|---|---|---|---|
| 日次 | ジョブ実行確認（job_runs）、エラー数確認 | 運用担当 | [operations.md](operations.md) |
| 週次 | 監査ログ確認、未処理の重複候補確認 | 管理者 | [operations.md](operations.md) |
| 月次 | スナップショット締め確認、バックアップ（PITR）確認 | 管理者 | [backup.md](backup.md) / [operations.md](operations.md) |
| 四半期 | Secrets ローテーション、権限棚卸し、依存関係・EOL・脆弱性確認 | CTO / 管理者 | [security.md](security.md) / [operations.md](operations.md) |

## 8. 緊急連絡先

- 開発・運用責任者（CTO 相当）: リポジトリ管理者（Kensan196948G）
- 障害報告は GitHub Issue（要ラベル: `bug` / `incident`）と運用台帳（operations.md）に記録する
