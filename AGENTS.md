# 営業パイプライン・受注予測管理 — プロジェクト運用ポリシー

## 0. 適用範囲

本ファイルはリポジトリルートの `AGENTS.md` として配置するプロジェクト単位の運用ポリシーです。
グローバル設定の運用方針を継承しつつ、本プロジェクト固有の方針を定義します。

## 1. プロジェクト情報

| 項目 | 内容 |
|---|---|
| プロジェクト名 | 営業パイプライン・受注予測管理 (Mirai Sales Pipeline) |
| 目的 | 営業案件を組織横断で一意の案件コードと管理ルールで可視化し、部・支店・全社単位の受注見込を迅速に集計する。案件の重複・長期停滞・更新漏れ・確度変更根拠不明を減らし、案件会議・提案資料・確定文書まで追跡可能にする |
| 主な利用者 | 営業担当、営業管理者（部長・支店管理者）、営業本部、関係部門参照、システム管理 |
| 技術スタック | Cloudflare Workers (Hono) / Neon PostgreSQL / React + Vite + TypeScript / node --test / GitHub Actions |
| 基盤方針 | 要件定義書・詳細仕様設計書（v1.0 Draft）に従う。独自開発を最小化し既存基盤優先（AppSuite/desknet's NEO/OneDrive/DirectCloud は本システムから参照・連携。実環境 API は環境確認後に確定） |
| リポジトリ | github.com/Kensan196948G/mirai-sales-pipeline (private) |

## 2. 言語と対応

- 日本語で対応・解説する
- コード内コメントは英語可、UI 表示は日本語

## 3. 運用ループ

`Monitor -> Build -> Verify -> Improve` の順で進める。
ループ判定は時間ではなく現在の主作業内容で行い、優先順位は `Verify > Build > Monitor > Improve`。
小変更なら `Monitor -> Build -> Verify` のみでもよい。大変更のときだけ Improve と複数エージェントを厚く使う。

## 4. STABLE 判定

以下をすべて満たした場合のみ STABLE とする。

- test success
- lint success
- typecheck success
- build success
- CI success
- error 0（本番ログ）
- security critical issue 0

STABLE 未達は merge / deploy 禁止。

## 5. Git / GitHub ルール

- main 直接 push 禁止
- branch または WorkTree 必須
- PR 必須
- CI 成功のみ merge 許可
- 論理単位で commit（1 コミット＝1 論理変更）
- 秘密情報（.env、トークン、接続文字列）を commit しない

## 6. DB / マイグレーション

- migration は `migrations/` 配下の SQL で管理し、上から順に冪等に適用する
- 本番 schema 変更は一時 branch で検証後、rollback 手順（docs/ops/RUNBOOK.md）に沿って適用
- 外部キー・制約・インデックス・監査列（created_at/updated_at/created_by/updated_by）を必ず設ける
- 重要変更（確度・金額・段階・担当・状態）は audit_logs へ理由付きで記録する

## 7. セキュリティ

- セッションは httpOnly + Secure + SameSite=Lax Cookie、トークンは DB にハッシュ保存
- パスワードは PBKDF2（Workers WebCrypto）でハッシュ化
- RBAC（admin/hq/manager/sales/viewer）+ 組織スコープ + 機密区分による案件閲覧制御
- 変更系 API は Origin 検証（CSRF 対策）、ログインはレート制限
- 出力（CSV）は権限チェックし監査ログに記録

## 8. 本番デプロイ

- `npm run deploy`（= `npm run build:all && node scripts/deploy.mjs`）を CI または承認済み手順で実行
  - 要 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`（.env・Git 管理外）
  - 初回のみ `node scripts/deploy.mjs --secrets --crons`（シークレット・cron 設定）
- デプロイ後に `GET /api/internal/healthz` とスモークテストで稼働確認
- 重大異常時は前バージョンへ rollback（docs/ops/RUNBOOK.md）
