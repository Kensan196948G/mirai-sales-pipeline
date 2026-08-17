/** 案件健全性（SCR-06）: 未更新・期限超過・次回行動なし・重複候補 */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { dateJa, dateTimeJa } from '../format.ts';
import { PageHeader, Empty } from './ui.tsx';

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
      <PageHeader title={`案件健全性（${total} 件）`} />
      {total === 0 ? <Empty message="健全です。未更新・期限超過・重複候補はありません" /> : null}

      <Section title={`長期未更新（${data.stale.length} 件）`} tone="orange">
        {data.stale.map((s) => (
          <tr key={s.id}>
            <td><a href={`#/opportunities/${s.opp_code}`}>{s.opp_code}</a></td>
            <td>{s.name}</td>
            <td>{s.org_name}</td>
            <td>{s.owner_name}</td>
            <td>{s.stage_name} / {s.probability_name}</td>
            <td>{dateTimeJa(s.last_updated_at)}</td>
            <td className="num">{s.days_since_update} 日</td>
          </tr>
        ))}
      </Section>

      <Section title={`次回行動 期限超過（${data.overdue.length} 件）`} tone="red">
        {data.overdue.map((o) => (
          <tr key={o.id}>
            <td><a href={`#/opportunities/${o.opp_code}`}>{o.opp_code}</a></td>
            <td>{o.name}</td>
            <td>{o.org_name}</td>
            <td>{o.owner_name}</td>
            <td className="small">{o.next_action}</td>
            <td>{dateJa(o.next_action_due)}</td>
            <td className="num" style={{ color: 'var(--danger)' }}>{o.delay_days} 日超過</td>
          </tr>
        ))}
      </Section>

      <Section title={`次回行動 未設定（${data.no_action.length} 件）`} tone="gray">
        {data.no_action.map((n) => (
          <tr key={n.id}>
            <td><a href={`#/opportunities/${n.opp_code}`}>{n.opp_code}</a></td>
            <td>{n.name}</td>
            <td>{n.org_name}</td>
            <td>{n.owner_name}</td>
            <td>{n.stage_name} / {n.probability_name}</td>
            <td>{dateTimeJa(n.last_updated_at)}</td>
          </tr>
        ))}
      </Section>

      <Section title={`重複候補（${data.duplicates.length} 件）`} tone="blue">
        {data.duplicates.map((d) => (
          <tr key={d.id}>
            <td><a href={`#/opportunities/${d.a_code}`}>{d.a_code}</a></td>
            <td>{d.a_name}</td>
            <td><a href={`#/opportunities/${d.b_code}`}>{d.b_code}</a></td>
            <td>{d.b_name}</td>
            <td className="num">{Math.round(Number(d.score) * 100)}%</td>
            <td className="small">{(d.matched_fields ?? []).join(', ')}</td>
          </tr>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: string; children: any }) {
  const rows: any[] = children?.length ? children : [];
  return (
    <div className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? <Empty message="該当なし" /> : (
        <table className="grid">
          <thead>
            <tr>
              <th>案件コード</th><th>案件名</th><th>組織</th><th>担当</th>
              {tone === 'red' ? <th>次回行動</th> : tone === 'blue' ? <th>相手コード</th> : null}
              {tone === 'blue' ? <th>相手案件名</th> : null}
              {tone === 'gray' ? <th>段階 / 確度</th> : null}
              {tone === 'orange' ? <th>段階 / 確度</th> : null}
              {tone === 'orange' ? <th>最終更新</th> : tone === 'red' ? <th>期限</th> : tone === 'gray' ? <th>最終更新</th> : tone === 'blue' ? <th className="num">スコア</th> : null}
              {tone === 'orange' ? <th className="num">未更新日数</th> : tone === 'red' ? <th className="num">遅延</th> : tone === 'blue' ? <th>一致要素</th> : null}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      )}
    </div>
  );
}
