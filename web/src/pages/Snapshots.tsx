/** 予測スナップショット（新デザイン + /api/snapshots 結線: 作成・一覧・比較・明細） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { yenShort, dateJa, ymLabel } from '../format.ts';
import { Icon } from '../icons.tsx';
import { useAuth } from '../auth.tsx';

interface Snap {
  id: string; snapshot_date: string; label: string; fiscal_year: number; month: number;
  totals: { total?: { amount: number; weighted: number; count: number }; by_org?: Record<string, { code: string; amount: number; weighted: number; count: number }> };
  created_at: string;
}

export function SnapshotsPage() {
  const { user } = useAuth();
  const canCreate = ['hq', 'admin'].includes(user?.role ?? '');
  const [items, setItems] = useState<Snap[]>([]);
  const [detail, setDetail] = useState<{ id: string; summary: any[]; details: any[] } | null>(null);
  const [diff, setDiff] = useState<{ current_snapshot: string; previous_snapshot: string | null; items: any[] } | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = () => {
    api.get<{ items: Snap[] }>('/api/snapshots').then((r) => setItems(r.items)).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const open = async (id: string) => {
    setDetail(null);
    setDiff(null);
    const [d, df] = await Promise.all([
      api.get<{ summary: any[]; details: any[] }>(`/api/snapshots/${id}`),
      api.get<{ current_snapshot: string; previous_snapshot: string | null; items: any[] }>(`/api/snapshots/${id}/diff`).catch(() => null),
    ]);
    setDetail({ id, summary: d.summary, details: d.details });
    setDiff(df);
  };

  const create = async () => {
    setError('');
    try {
      await api.post('/api/snapshots', { snapshot_date: date });
      setNote('スナップショットを作成しました');
      setTimeout(() => setNote(''), 2500);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました');
    }
  };

  return (
    <div>
      {note ? <div className="alert success" role="status"><Icon name="check-circle" /><span>{note}</span></div> : null}
      {error ? <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div> : null}

      {canCreate ? (
        <div className="card">
          <div className="form-sec-title"><Icon name="camera" />締めの作成</div>
          <div className="flex wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 180 }}><label>締め日</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><button className="btn primary" style={{ marginBottom: 1 }} onClick={create}>スナップショット作成</button></div>
          </div>
          <p className="muted small" style={{ margin: '12px 0 0' }}>作成時点の進行中・保留案件の見込（単純・加重）を保存します。後日の上書きで過去予測は失われません。</p>
        </div>
      ) : null}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>スナップショット一覧</h2></div>
        {items.length === 0 ? (
          <div className="empty">スナップショットはありません</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>締め日</th><th>ラベル</th><th className="num">案件数</th><th className="num">単純見込</th><th className="num">加重見込</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>{dateJa(s.snapshot_date)}</td>
                  <td>{s.label}</td>
                  <td className="num">{s.totals?.total?.count ?? '-'}</td>
                  <td className="num">{s.totals?.total?.amount != null ? yenShort(s.totals.total.amount) : '-'}</td>
                  <td className="num">{s.totals?.total?.weighted != null ? yenShort(s.totals.total.weighted) : '-'}</td>
                  <td><button className="btn sm ghost" onClick={() => open(s.id)}>表示・比較</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail ? (
        <div className="grid-2">
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>組織別集計</h2><span className="meta">{detail.id.slice(0, 8)}</span></div>
            <table className="tbl">
              <thead><tr><th>組織</th><th className="num">件数</th><th className="num">単純見込</th><th className="num">加重見込</th></tr></thead>
              <tbody>
                {detail.summary.map((r) => (
                  <tr key={r.org_code}>
                    <td>{r.org_name}</td>
                    <td className="num">{r.cnt}</td>
                    <td className="num">{yenShort(r.amount)}</td>
                    <td className="num">{yenShort(r.weighted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {diff ? (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>前回との比較</h2><span className="meta">{diff.previous_snapshot ? '前回あり' : '初回'}</span></div>
              <table className="tbl">
                <thead><tr><th>組織</th><th className="num">今回 見込</th><th className="num">前回 見込</th><th className="num">差額</th></tr></thead>
                <tbody>
                  {diff.items.map((d) => (
                    <tr key={d.org_id}>
                      <td>{d.org_name}</td>
                      <td className="num">{yenShort(d.current.amount)}</td>
                      <td className="num">{yenShort(d.previous.amount)}</td>
                      <td className="num" style={{ color: d.diff_amount < 0 ? 'var(--danger)' : 'var(--success)' }}>{yenShort(d.diff_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>明細（予定受注額順）</h2></div>
            <table className="tbl">
              <thead><tr><th>案件</th><th>段階</th><th>確度</th><th className="num">予定受注額</th><th className="num">加重見込</th><th>受注予定月</th></tr></thead>
              <tbody>
                {detail.details.map((d) => (
                  <tr key={d.opportunity_id}>
                    <td><a href={`#/opportunities/${d.opp_code}`}>{d.opp_code} {d.name}</a></td>
                    <td>{d.stage_name}</td>
                    <td>{d.probability_name}</td>
                    <td className="num">{yenShort(d.expected_amount)}</td>
                    <td className="num">{yenShort(d.weighted_amount)}</td>
                    <td>{ymLabel(d.expected_order_month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
