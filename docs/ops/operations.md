# 運用台帳 — 営業パイプライン・受注予測管理

本ドキュメントは運用タスクの**担当・周期・手順・判定基準**を定めます。実施結果は本ファイル末尾の台帳に追記してください。

## 1. 定例運用タスク一覧

### 日次

| # | タスク | 担当 | 手順 | 判定基準 |
|---|---|---|---|---|
| D-01 | 日次ジョブ実行確認 | 運用担当 | `/api/admin/job-runs`（admin）で JOB-01〜06 の status を確認。前日分の実行が無い場合は GitHub Actions の `daily-jobs` ワークフロー状態と Worker の遅延実行（ダッシュボードアクセス）を確認 | 全ジョブ ok。error があれば Worker ログで原因特定 |
| D-02 | エラー数確認 | 運用担当 | Cloudflare Analytics で 5xx / 429 を確認 | 5xx < 1%。異常があれば RUNBOOK §6 |

> **既知事項（リリース時点）**: 新規リポジトリでは GitHub Actions の schedule ワークフロー登録に遅延が発生することがある（`gh api repos/<owner>/<repo>/actions/workflows` で `daily-jobs` が確認できるまで）。登録完了までの間も、ダッシュボードアクセス時の遅延実行（24h以上未実行なら JOB-01〜06 起動）と手動実行（`gh workflow run daily-jobs.yml`）で日次ジョブは代替される。**リリース後 24 時間以内に `daily-jobs` の登録と動作を確認すること**（確認方法: `gh workflow list --all` → `gh workflow run daily-jobs.yml` → 実行ログで `/api/internal/cron` が 200 を返すこと）。

### 週次

| # | タスク | 担当 | 手順 | 判定基準 |
|---|---|---|---|---|
| W-01 | 監査ログ確認 | 管理者 | `/api/audit-logs` で不審な変更・ログインを確認 | 異常なし。疑義があれば利用者へ確認 |
| W-02 | 重複候補の処理 | 管理者 | `/api/health` の重複候補を確認し、判定（統合/別案件/却下） | pending が増え続けない |

### 月次

| # | タスク | 担当 | 手順 | 判定基準 |
|---|---|---|---|---|
| M-01 | 予測スナップショット確認 | 管理者 | 月初に JOB-05 のスナップショットが作成されているか確認 | 前月締めのスナップショットが存在 |
| M-02 | バックアップ（PITR）確認 | 管理者 | [backup.md](backup.md) §4 の復元テスト | 復元成功・件数一致 |
| M-03 | データ品質レポート確認 | 管理者 | JOB-06 の detail（未設定・金額0・粗利欠落等）を確認し改善指示 | 傾向を記録し、主要指標を改善 |

### 四半期

| # | タスク | 担当 | 手順 | 判定基準 |
|---|---|---|---|---|
| Q-01 | Secrets ローテーション | CTO | SESSION_SECRET / CRON_SECRET を再生成し Worker + GitHub を更新 | 更新後ログイン・日次ジョブが正常 |
| Q-02 | 権限棚卸し | 管理者 | [security.md](security.md) §4 | 不要アカウント・過剰ロール 0 |
| Q-03 | 脆弱性・依存・EOL 確認 | CTO | `npm audit` / `npm outdated` / Node EOL 確認 | critical 0。EOL 回避計画 |
| Q-04 | バックアップ・復元の総合訓練 | CTO | 一時ブランチへの復元 + 切替ドライラン | 手順完遂・RTO 4h 以内 |
| Q-05 | 証明書・ドメイン・Secrets 棚卸し | CTO | workers.dev サブドメイン・カスタムドメイン（導入時）・API トークン有効期限 | 期限切れ 0 |

## 2. 判定基準とエスカレーション

- 各タスクの「判定基準」未達は P1（業務影響）または P2（管理面）として記録
- P0（サービス停止・漏えい・破損）は即時で CTO へ報告し、RUNBOOK §6 に沿って対応
- 自動化できるタスクは順次 CI / cron へ移行する（将来課題としてバックログ管理）

## 3. 台帳（実施記録）

| 日付 | タスクID | 実施者 | 結果 | 備考・残課題 |
|---|---|---|---|---|
| 2026-08-17 | REL-001 | CTO（自律エージェント） | 本番リリース | GitHub リポジトリ新規作成・CI 構築・Worker デプロイ（commit 8bfdfc8 由来 b5ca7f44）・スモーク全項目成功・デモアカウント 6 件のパスワードローテーション（新パスワードは社内限定ファイル `MIRAI成功本部技術部/msp-initial-admin-credentials.txt` に保管） | 残課題: GitHub Actions schedule ワークフロー（daily-jobs）の登録確認（リリース後24h以内）、ブランチ保護（プラン制限で未設定）、カスタムドメイン、Workers Paid 化 |
| 2026-08-21 | REL-002 | CTO（自律エージェント） | MVP 公開デモ対応 + 障害修正リリース（PR #11, #12） | 内容: ①MVP 認証バイパス（AUTH_BYPASS=true・ENVIRONMENT=mvp のみ有効・production では無効の安全装置）②**Critical 修正**: requireRole が 'admin' を含むロール指定で認可チェックをスキップする脆弱性（ユーザー作成/パスワードリセット/監査ログ閲覧が viewer/sales から可能）③**High 修正**: Neon HTTP SQL が numeric を文字列で返し画面クラッシュ（toFixed TypeError）④**High 修正**: daily-jobs が Cloudflare Access の 302 を成功と誤判定し日次ジョブ未実行（8/18〜8/20 失敗の真因）⑤**High 修正**: cron が Workers サブリクエスト上限（50/呼び出し）超過で 500（バッチ化で解消）⑥新規案件登録ルート誤解釈修正。検証: lint/typecheck/unit(31)/integration(23)/build 全 pass、空DB Migration+Seed 再実行成功、MVP E2E（登録→詳細→一覧 15 件→CSV）成功、本番 healthz/cron 200 | 残課題: ブランチ保護（プラン制限で未設定）、Workers Paid 化、PBKDF2 イテレーション強化（60,000→600,000）、Cloudflare Access Service Token 設定（daily-jobs は workers.dev 経由で代替中）、desknet's NEO/OneDrive/DirectCloud 実連携（環境確認後に確定） |

## 4. 変更履歴

| 日付 | 変更内容 |
|---|---|
| 2026-08-17 | 初版作成（本番リリース時） |
| 2026-08-17 | 環境3構成へ変更: 本番 `msp.mirai-dx-platform.com` / MVP `msp-mvp.mirai-dx-platform.com`（Worker `mirai-sales-pipeline-mvp`・テストブランチ DB）/ 開発 `mirai-sales-pipeline.kensan1969.workers.dev`。MSP_WORKER_URL を本番カスタムドメインへ更新 |
| 2026-08-17 | UI 刷新: Open Design プロトタイプのデザインを本番UIへ適用（PR #9）。3環境へデプロイ・スモーク確認（ログイン200・DB ok） |
| 2026-08-21 | MVP 公開デモ対応（PR #11）: AUTH_BYPASS 導入・requireRole 認可バイパス修正・画面クラッシュ修正・daily-jobs サイレント失敗修正・CSP/favicon 修正。リポジトリ**デフォルトブランチを main へ変更**（旧: feature/production-ready。schedule ワークフローが旧定義を参照し続けていたため） |
| 2026-08-21 | 障害修正（main 直接 push + PR #12）: cron のサブリクエスト上限超過による 500 をジョブバッチ化で修正（daily-jobs 8/18〜20 失敗の真因）。新規案件登録ルート誤解釈を修正し、MVP で E2E 検証完了 |
