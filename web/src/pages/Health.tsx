/** 案件健全性（新デザイン + /api/health 結線: 未更新・期限超過・未設定・重複） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { dateJa, dateTimeJa } from '../format.ts';
import { Icon } from '../icons.tsx';

interface HealthData {
  stale: any[];
  overdue: any[];
  no_action: any[];
  duplicates: any[];
}

export function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null);

  useEffect(() => {
    api.get<HealthData>('/api/health').then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="empty">読み込み中…</div>;
  const total = data.stale.length + data.overdue.length + data.no_action.length + data.duplicates.length;

  return (
    <div>
      <div className="health-grid" style={{ marginBottom: 20 }}>
        <div className="health-tile warn"><span className="ht-ico"><Icon name="clock" /></span><div className="ht-num num">{data.stale.length}</div><div className="ht-label">長期未更新</div></div>
        <div className="health-tile danger"><span className="ht-ico"><Icon name="alert" /></span><div className="ht-num num">{data.overdue.length}</div><div className="ht-label">次回行動 期限超過</div></div>
        <div className="health-tile info"><span className="ht-ico"><Icon name="calendar" /></span><div className="ht-num num">{data.no_action.length}</div><div className="ht-label">次回行動 未設定</div></div>
        <div className="health-tile warn"><span className="ht-ico"><Icon name="copy" /></span><div className="ht-num num">{data.duplicates.length}</div><div className="ht-label">重複候補</div></div>
      </div>

      {total === 0 ? <div className="card"><div className="empty">健全です。未更新・期限超過・重複候補はありません</div></div> : null}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>長期未更新（{data.stale.length} 件）</h2><span className="meta">最終更新から 14 日以上</span></div>
        {data.stale.length === 0 ? <div className="empty">該当なし</div> : (
          <table className="tbl">
            <thead><tr><th>案件コード</th><th>案件名</th><th>組織</th><th>担当</th><th>段階 / 確度</th><th>最終更新</th><th className="num">未更新日数</th></tr></thead>
            <tbody>
              {data.stale.map((s) => (
                <tr key={s.id}>
                  <td className="code"><a href={`#/opportunities/${s.opp_code}`}>{s.opp_code}</a></td>
                  <td><a href={`#/opportunities/${s.opp_code}`}>{s.name}</a></td>
                  <td>{s.org_name}</td><td>{s.owner_name}</td>
                  <td>{s.stage_name} / {s.probability_name}</td>
                  <td className="small">{dateTimeJa(s.last_updated_at)}</td>
                  <td className="num"><span className="badge orange">{s.days_since_update} 日</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>次回行動 期限超過（{data.overdue.length} 件）</h2></div>
        {data.overdue.length === 0 ? <div className="empty">該当なし</div> : (
          <table className="tbl">
            <thead><tr><th>案件コード</th><th>案件名</th><th>組織</th><th>担当</th><th>次回行動</th><th>期限</th><th className="num">遅延</th></tr></thead>
            <tbody>
              {data.overdue.map((o) => (
                <tr key={o.id}>
                  <td className="code"><a href={`#/opportunities/${o.opp_code}`}>{o.opp_code}</a></td>
                  <td><a href={`#/opportunities/${o.opp_code}`}>{o.name}</a></td>
                  <td>{o.org_name}</td><td>{o.owner_name}</td>
                  <td className="small">{o.next_action}</td>
                  <td className="small">{dateJa(o.next_action_due)}</td>
                  <td className="num" style={{ color: 'var(--danger)' }}><b>{o.delay_days} 日超過</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>次回行動 未設定（{data.no_action.length} 件）</h2></div>
        {data.no_action.length === 0 ? <div className="empty">該当なし</div> : (
          <table className="tbl">
            <thead><tr><th>案件コード</th><th>案件名</th><th>組織</th><th>担当</th><th>段階 / 確度</th><th>最終更新</th></tr></thead>
            <tbody>
              {data.no_action.map((n) => (
                <tr key={n.id}>
                  <td className="code"><a href={`#/opportunities/${n.opp_code}`}>{n.opp_code}</a></td>
                  <td><a href={`#/opportunities/${n.opp_code}`}>{n.name}</a></td>
                  <td>{n.org_name}</td><td>{n.owner_name}</td>
                  <td>{n.stage_name} / {n.probability_name}</td>
                  <td className="small">{dateTimeJa(n.last_updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>重複候補（{data.duplicates.length} 件）</h2><span className="meta">判定は管理者が実施</span></div>
        {data.duplicates.length === 0 ? <div className="empty">該当なし</div> : (
          <table className="tbl">
            <thead><tr><th>案件コード</th><th>案件名</th><th>相手コード</th><th>相手案件名</th><th className="num">スコア</th><th>一致要素</th></tr></thead>
            <tbody>
              {data.duplicates.map((d) => (
                <tr key={d.id}>
                  <td className="code"><a href={`#/opportunities/${d.a_code}`}>{d.a_code}</a></td>
                  <td><a href={`#/opportunities/${d.a_code}`}>{d.a_name}</a></td>
                  <td className="code"><a href={`#/opportunities/${d.b_code}`}>{d.b_code}</a></td>
                  <td><a href={`#/opportunities/${d.b_code}`}>{d.b_name}</a></td>
                  <td className="num"><b>{Math.round(Number(d.score) * 100)}%</b></td>
                  <td className="small">{(d.matched_fields ?? []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
