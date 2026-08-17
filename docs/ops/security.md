# セキュリティ設計・Secrets 管理 — 営業パイプライン・受注予測管理

## 1. 認証・認可

| 項目 | 実装 |
|---|---|
| パスワード保存 | PBKDF2(SHA-256, 60,000回) + 16バイト salt（Workers WebCrypto） |
| セッション | ランダム 64 hex トークンを Cookie（HttpOnly + Secure + SameSite=Lax）で保持。DB には SHA-256 ハッシュのみ保存。期限は設定 `SESSION_TTL_HOURS`（既定 168h） |
| ログアウト | セッション失効（revoked_at 設定）+ Cookie 削除 |
| RBAC | admin / hq / manager / sales / viewer（`ROLE_RANK` で階層判定）+ 組織スコープ + 機密区分（C3）による閲覧制御 |
| CSRF | 変更系 API の Origin 検証（同一ホストのみ許可） |
| レート制限 | ログイン 10 回/分/IP（isolate 内メモリ） |
| 楽観ロック | 案件更新は `version` 照合。競合時 409 |

## 2. 主要リスク対策

- **XSS**: React によるエスケープ + CSP（`script-src 'self'`）+ `X-Content-Type-Options: nosniff`
- **クリックジャッキング**: `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
- **情報漏えい**: 機密(C3)案件の閲覧制御、CSV 出力の権限チェック + 監査記録
- **キャッシュ**: API 応答は `Cache-Control: no-store`
- **SQL インジェクション**: 全クエリがパラメータバインド（Neon HTTP SQL の `$1...`）
- **秘密値の漏えい防止**: `.env` は Git 管理外、Worker Secrets で管理。ログ・監査・テスト・Issue/PR に秘密値を出力しない

## 3. 管理すべき Secrets

| Secret | 用途 | 保管場所 | ローテーション |
|---|---|---|---|
| `DATABASE_URL` | Neon 接続文字列 | Cloudflare Worker Secrets（本番）/ `.env`（ローカル） | 接続文字列変更時。Neon ロールパスワード変更時 |
| `SESSION_SECRET` | セッショントークン署名 | 同上 | **四半期ごと**（`openssl rand -hex 32` で再生成 → Cloudflare 更新 → 既存セッションは失効するため利用者に告知） |
| `CRON_SECRET` | 日次ジョブ呼び出し | 同上 + GitHub Actions Secret `MSP_CRON_SECRET` | **四半期ごと**。Worker と GitHub の両方を同時更新 |
| `CLOUDFLARE_API_TOKEN` | デプロイ | `.env`（ローカル）/ GitHub Actions Secret（デプロイ CI 導入時） | 権限見直し時。Workers Scripts: Edit に限定 |
| `NEON_DATABASE_URL` | CI 統合テスト用（テストブランチ） | GitHub Actions Secret | テストブランチ再作成時 |
| `MSP_WORKER_URL` | 日次ジョブの宛先（本番: `https://msp.mirai-dx-platform.com`） | GitHub Actions Secret | Worker の URL 変更時 |

**秘密候補・値は報告しない**（影響とローテーション方法のみ本ドキュメントに記載）。

## 4. 権限棚卸し（四半期）

- [ ] ユーザー一覧（`/api/admin/users`）で退職者・異動者のアカウント無効化を確認
- [ ] ロール（admin/hq/manager）の過剰付与がないか確認
- [ ] 非アクティブユーザーのセッション失効（is_active=false で自動失効済み）を確認
- [ ] GitHub コラボレータ・Secrets の棚卸し

## 5. 脆弱性・依存関係管理（四半期）

```bash
npm audit                 # 依存関係の脆弱性チェック（critical 0 を維持）
npm outdated              # メジャー更新の確認
npx wrangler deploy --dry-run 2>/dev/null # Worker 設定の妥当性確認
```

- **critical / high 脆弱性 0** を維持する（AGENTS.md §4 STABLE 判定）
- Node.js の EOL 確認（現在 engines: >=22.12.0。Node 22 は LTS）
- ライセンス: UNLICENSED（社内専用）。依存ライセンスは `npm ls` / license-checker で監査

## 6. 監査ログ

- 重要項目（確度・金額・段階・担当・状態・組織・機密区分等）の変更は理由付きで `audit_logs` に記録（`AUDIT_TRACKED_FIELDS`）
- ログイン・ログアウト・CSV 出力・ユーザー管理・設定変更・スナップショット作成も記録
- 監査ログは hq/admin のみ閲覧可（`/api/audit-logs`）。改ざん検知は四半期の棚卸しで確認

## 7. インシデント対応

- P0（認証突破・漏えい・破損）: 即時で Worker 停止 or ロールバック → RUNBOOK §6 へ
- 報告: GitHub Issue（`incident` ラベル）+ 運用台帳への記録。再発防止策を 1 週間以内に PR
