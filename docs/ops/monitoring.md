# 監視・SLI/SLO — 営業パイプライン・受注予測管理

## 1. 監視の仕組み

| 手段 | 内容 | 確認方法 |
|---|---|---|
| ヘルスチェック | `GET /api/internal/healthz`（公開・DB 接続検証込み） | curl / 外部監視（UptimeRobot 等） |
| Worker ログ | Cloudflare Dashboard > Workers > mirai-sales-pipeline > Logs（observability 有効） | Dashboard / Logpull API |
| ジョブ実行履歴 | `job_runs` テーブル（status: running/ok/error） | `/api/admin/job-runs`（admin） |
| 監査ログ | `audit_logs` テーブル（変更・ログイン・CSV 出力） | `/api/audit-logs`（hq/admin） |
| データ品質 | JOB-06 が `job_runs.detail` に品質メトリクスを保存 | `/api/admin/job-runs` |

## 2. ヘルスチェック仕様

```
GET /api/internal/healthz
{
  "ok": true,                       # DB 接続成功 = true
  "app": "mirai-sales-pipeline",
  "environment": "production",
  "database": "ok" | "error",
  "postgres": "PostgreSQL 18.4 (…)",
  "time": "2026-08-17T01:25:48.180Z"
}
```

- HTTP 200 / `ok:true` を正常とする
- `database:error` または 5xx が 5 分以上継続したらアラート

## 3. SLI / SLO（目標値・初期値）

| SLI | 定義 | 目標（初期） |
|---|---|---|
| 可用性 | healthz が正常応答する時間割合（月間） | 99.5%（計画停止除く） |
| 主要 API エラー率 | `/api/*` の 5xx 応答率（月間） | < 1% |
| 日次ジョブ成功率 | `job_runs` の ok 率（直近 30 日） | >= 95% |
| ログイン成功率 | ログイン試行に対する成功割合（異常スパイク検知用） | モニタリング（基準は運用開始後 30 日で設定） |

初期はモニタリング中心とし、運用データ蓄積後に SLO を正式化する。

## 4. アラート

現状は手動確認ベース。外部監視（UptimeRobot / Cloudflare Health Checks）導入を推奨:

- **URL**: `https://msp.mirai-dx-platform.com/api/internal/healthz`
- **期待**: HTTP 200 かつ `"ok":true`
- **通知先**: 開発・運用責任者（メール / Slack）

## 5. エラーレート監視

Cloudflare Dashboard > Analytics > Workers でリクエスト数・エラー率を確認できる。

- 5xx 急増（>1%）: Worker ログでスタックトレース確認 → RUNBOOK §6 へ
- 429 急増: レート制限（ログイン 10回/分/IP）の誤検知 or 攻撃 → Cloudflare 側のレート制限ルール追加を検討

## 6. ログ・監査データの保存とマスキング

- **ログ**: Cloudflare Workers Logs（persist 有効）。個人情報・パスワード・トークンはコード上ログ出力しない（監査ログへは IP のみ記録）
- **監査ログ**: DB の `audit_logs` に保存（変更 before/after、理由、IP）。パスワードハッシュ・セッショントークン等の秘密値は記録しない
- **マスキング**: API 応答には秘密値を含めない。CSV 出力は権限チェック + 監査記録済み

## 7. 運用開始後の推奨事項（バックログ）

- [ ] 外部監視（UptimeRobot 等）の導入
- [ ] アラート通知（Slack/メール）の設定
- [ ] SLO の正式化（30 日間の実測値ベース）
- [ ] Worker ログの Logpush（R2 / 外部 SIEM）連携
