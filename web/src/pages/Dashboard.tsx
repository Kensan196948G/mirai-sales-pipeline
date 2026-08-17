/** 営業ダッシュボード（新デザイン + /api/dashboard 結線） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Dashboard } from '../types.ts';
import { yenUnit, yenShort, dateJa } from '../format.ts';
import { Icon } from '../icons.tsx';

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [fy, setFy] = useState(new Date().getFullYear());
  const [error, setError] = useState('');
  const [skeleton, setSkeleton] = useState(true);

  useEffect(() => {
    setError('');
    setSkeleton(true);
    api.get<Dashboard>(`/api/dashboard?fiscal_year=${fy}`)
      .then((d) => {
        setData(d);
        // 原型のスケルトン演出（650ms）を維持
        setTimeout(() => setSkeleton(false), 650);
      })
      .catch((e) => {
        setError(e.message);
        setSkeleton(false);
      });
  }, [fy]);

  if (error) {
    return (
      <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div>
    );
  }

  if (skeleton || !data) {
    return (
      <div id="dash-skeleton" aria-hidden="true">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}><span className="skeleton" style={{ width: 130, height: 34 }} /></div>
        <div className="stat-grid">
          <span className="skeleton" style={{ height: 106 }} /><span className="skeleton" style={{ height: 106 }} /><span className="skeleton" style={{ height: 106 }} /><span className="skeleton" style={{ height: 106 }} /><span className="skeleton" style={{ height: 106 }} />
        </div>
        <div className="health-grid" style={{ marginBottom: 18 }}>
          <span className="skeleton" style={{ height: 98 }} /><span className="skeleton" style={{ height: 98 }} /><span className="skeleton" style={{ height: 98 }} /><span className="skeleton" style={{ height: 98 }} />
        </div>
        <div className="grid-2">
          <span className="skeleton" style={{ height: 300 }} /><span className="skeleton" style={{ height: 300 }} />
        </div>
      </div>
    );
  }

  const plan = yenUnit(data.plan.target_amount);
  const simple = yenUnit(data.forecast.simple);
  const weighted = yenUnit(data.forecast.weighted);
  const variance = yenUnit(data.forecast.variance);
  const maxStage = Math.max(1, ...data.pipeline_by_stage.map((s) => s.amount));
  const maxMonth = Math.max(1, ...data.by_month.map((m) => m.amount));

  const stat = (label: string, chip: string, value: string, unit: string, sub: string, tone?: string) => (
    <div className="stat">
      <div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-chip${chip ? ` ${chip}` : ''}`}><Icon name={chip === 'teal' ? 'target' : chip === 'red' ? 'trend-down' : chip === 'green' ? 'check-circle' : 'trend-up'} /></span></div>
      <div className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}{unit ? <span className="unit">{unit}</span> : null}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );

  return (
    <div id="dash-content">
      <div className="page-toolbar">
        <div className="muted small">進行中・保留案件 {data.forecast.count} 件を集計（{data.fiscal_year} 年度）</div>
        <div className="year-select" style={{ cursor: 'pointer' }}>
          <select
            value={fy}
            onChange={(e) => setFy(Number(e.target.value))}
            style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer', outline: 'none' }}
            aria-label="年度選択"
          >
            {[new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
              <option key={y} value={y}>{y} 年度</option>
            ))}
          </select>
          <Icon name="chev-d" />
        </div>
      </div>

      <div className="stat-grid">
        {stat('年間計画額', 'teal', plan.value, plan.unit, '全社・目標受注額')}
        {stat('単純積上げ見込', '', simple.value, simple.unit, `${data.forecast.count} 件`)}
        {stat('加重見込（確度考慮）', 'green', weighted.value, weighted.unit, '確度重みを掛けた見込')}
        {stat('計画差異', 'red', variance.value, variance.unit, '加重見込 − 計画', 'danger')}
        {stat('計画達成見込率', 'teal', data.forecast.achievement_rate == null ? '-' : data.forecast.achievement_rate.toFixed(1), '%', '見込 ÷ 計画')}
      </div>

      <div className="health-grid">
        <div className="health-tile warn">
          <span className="ht-ico"><Icon name="clock" /></span>
          <div className="ht-num num">{data.alerts.stale}</div>
          <div className="ht-label">停滞・未更新</div>
          <a href="#/health">確認する <Icon name="chev-r" /></a>
        </div>
        <div className="health-tile danger">
          <span className="ht-ico"><Icon name="alert" /></span>
          <div className="ht-num num">{data.alerts.overdue}</div>
          <div className="ht-label">次回行動 期限超過</div>
          <a href="#/health">確認する <Icon name="chev-r" /></a>
        </div>
        <div className="health-tile warn">
          <span className="ht-ico"><Icon name="copy" /></span>
          <div className="ht-num num">{data.alerts.duplicates}</div>
          <div className="ht-label">重複候補</div>
          <a href="#/health">確認する <Icon name="chev-r" /></a>
        </div>
        <div className="health-tile info">
          <span className="ht-ico"><Icon name="calendar" /></span>
          <div className="ht-num num">{data.alerts.no_action}</div>
          <div className="ht-label">次回行動未設定</div>
          <a href="#/health">確認する <Icon name="chev-r" /></a>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h2>段階別パイプライン</h2><span className="meta">予定受注額・進行中/保留</span></div>
          <div className="hbars">
            {data.pipeline_by_stage.map((s) => (
              <div className="hbar" key={s.stage_name}>
                <div className="hbar-label">{s.stage_name}</div>
                <div className="hbar-track"><div className="hbar-fill" style={{ width: `${Math.max(2, (s.amount / maxStage) * 100)}%` }} /></div>
                <div className="hbar-val">{yenShort(s.amount)}</div>
                <div className="hbar-count">{s.cnt}件</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>確度別パイプライン</h2><span className="meta">加重見込</span></div>
          <table className="tbl">
            <thead><tr><th>確度</th><th className="num">件数</th><th className="num">予定受注額</th><th className="num">加重見込</th></tr></thead>
            <tbody>
              {data.pipeline_by_probability.map((p) => (
                <tr key={p.probability_name}>
                  <td><span className="badge gray">{p.probability_name}</span></td>
                  <td className="num">{p.cnt}</td>
                  <td className="num">{yenShort(p.amount)}</td>
                  <td className="num"><b>{yenShort(p.amount * (p.weight ?? 0))}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>受注予定月別集計</h2><span className="meta">予定受注額</span></div>
          {data.by_month.length === 0 ? (
            <div className="empty">受注予定のある案件がありません</div>
          ) : (
            <div className="vcols">
              {data.by_month.map((m) => (
                <div className="vcol" key={m.ym}>
                  <div className="vbar" style={{ height: `${Math.max(4, (m.amount / maxMonth) * 100)}%` }}><span className="vval">{yenShort(m.amount)}</span></div>
                  <div className="vlabel">{Number(m.ym.slice(-2))}月</div>
                  <div className="vcap">{m.cnt}件</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>直近の次回行動</h2><a href="#/opportunities" className="small" style={{ fontWeight: 700 }}>すべて見る →</a></div>
          {data.upcoming.length === 0 ? (
            <div className="empty">予定はありません</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>期限</th><th>案件</th><th>担当</th></tr></thead>
              <tbody>
                {data.upcoming.map((u) => (
                  <tr key={u.opp_code}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{dateJa(u.next_action_due)}</td>
                    <td><a href={`#/opportunities/${u.opp_code}`}>{u.name}</a><div className="sub">{u.next_action ?? ''}</div></td>
                    <td>{u.owner_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
