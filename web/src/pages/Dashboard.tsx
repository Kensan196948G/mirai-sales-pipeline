/** 営業ダッシュボード（SCR-01） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Dashboard } from '../types.ts';
import { yen, yenShort, pct, dateJa } from '../format.ts';
import { PageHeader, StatCard, Bar, Empty, Alert } from './ui.tsx';

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [fy, setFy] = useState(new Date().getFullYear());
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get<Dashboard>(`/api/dashboard?fiscal_year=${fy}`).then(setData).catch((e) => setError(e.message));
  }, [fy]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <div className="empty">読み込み中…</div>;

  const varianceTone = data.forecast.variance >= 0 ? 'pos' : 'neg';
  const maxStageAmount = Math.max(1, ...data.pipeline_by_stage.map((s) => s.amount));

  return (
    <div>
      <PageHeader
        title={`営業ダッシュボード（${data.fiscal_year}年度）`}
        actions={
          <select value={fy} onChange={(e) => setFy(Number(e.target.value))}>
            {[new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
              <option key={y} value={y}>{y}年度</option>
            ))}
          </select>
        }
      />

      <div className="kpis">
        <StatCard label="年間計画額" value={yen(data.plan.target_amount)} />
        <StatCard label="単純積上げ見込" value={yen(data.forecast.simple)} sub={`${data.forecast.count} 件`} />
        <StatCard label="加重見込（確度考慮）" value={yen(data.forecast.weighted)} />
        <StatCard label="計画差異" value={yen(data.forecast.variance)} tone={varianceTone} />
        <StatCard label="計画達成見込率" value={data.forecast.achievement_rate == null ? '-' : pct(data.forecast.achievement_rate)} sub="見込 ÷ 計画" tone={varianceTone} />
      </div>

      <div className="kpis">
        <StatCard label="停滞・未更新" value={data.alerts.stale} tone={data.alerts.stale > 0 ? 'warn' : undefined} sub="要確認" />
        <StatCard label="次回行動 期限超過" value={data.alerts.overdue} tone={data.alerts.overdue > 0 ? 'neg' : undefined} />
        <StatCard label="重複候補" value={data.alerts.duplicates} tone={data.alerts.duplicates > 0 ? 'warn' : undefined} />
        <StatCard label="次回行動未設定" value={data.alerts.no_action} tone={data.alerts.no_action > 0 ? 'warn' : undefined} />
      </div>

      <div className="flex spread" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1 }}>
          <h2>段階別パイプライン</h2>
          <table className="grid">
            <thead><tr><th>段階</th><th className="num">件数</th><th className="num">予定受注額</th><th>構成比</th></tr></thead>
            <tbody>
              {data.pipeline_by_stage.map((s) => (
                <tr key={s.stage_name}>
                  <td>{s.stage_name}</td>
                  <td className="num">{s.cnt}</td>
                  <td className="num">{yenShort(s.amount)}</td>
                  <td style={{ width: 180 }}><Bar value={s.amount} max={maxStageAmount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h2>確度別パイプライン</h2>
          <table className="grid">
            <thead><tr><th>確度</th><th className="num">件数</th><th className="num">予定受注額</th><th className="num">加重見込</th></tr></thead>
            <tbody>
              {data.pipeline_by_probability.map((p) => (
                <tr key={p.probability_name}>
                  <td>{p.probability_name}</td>
                  <td className="num">{p.cnt}</td>
                  <td className="num">{yenShort(p.amount)}</td>
                  <td className="num">{yenShort((p.amount * (p.weight ?? 0)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex spread" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1 }}>
          <h2>受注予定月別集計</h2>
          {data.by_month.length === 0 ? <Empty message="受注予定のある案件がありません" /> : (
            <table className="grid">
              <thead><tr><th>年月</th><th className="num">件数</th><th className="num">予定受注額</th></tr></thead>
              <tbody>
                {data.by_month.map((m) => (
                  <tr key={m.ym}>
                    <td>{m.ym}</td>
                    <td className="num">{m.cnt}</td>
                    <td className="num">{yenShort(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h2>直近の次回行動</h2>
          {data.upcoming.length === 0 ? <Empty message="予定はありません" /> : (
            <table className="grid">
              <thead><tr><th>期限</th><th>案件</th><th>担当</th></tr></thead>
              <tbody>
                {data.upcoming.map((u) => (
                  <tr key={u.opp_code}>
                    <td>{dateJa(u.next_action_due)}</td>
                    <td>
                      <a href={`#/opportunities/${u.opp_code}`}>{u.opp_code} {u.name}</a>
                      <div className="muted small">{u.next_action}</div>
                    </td>
                    <td>{u.owner_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>アラート</h2>
        <div className="flex">
          <a className="btn sm" href="#/health">🩺 案件健全性へ（停滞 {data.alerts.stale} / 期限超過 {data.alerts.overdue} / 重複 {data.alerts.duplicates}）</a>
        </div>
      </div>
    </div>
  );
}
