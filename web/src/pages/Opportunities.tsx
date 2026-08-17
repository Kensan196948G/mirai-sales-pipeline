/** 案件一覧（SCR-02） */
import { useEffect, useState } from 'react';
import { api, downloadCsv } from '../api.ts';
import type { Meta, Opportunity } from '../types.ts';
import { yenShort, dateJa, STATUS_LABEL } from '../format.ts';
import { PageHeader, Badge, Empty } from './ui.tsx';

interface Filters {
  q: string;
  status: string;
  stage_id: string;
  probability_id: string;
  region_id: string;
  work_type_id: string;
  org_id: string;
  my: boolean;
  stale: boolean;
  overdue: boolean;
}

const EMPTY_F: Filters = { q: '', status: 'in_progress', stage_id: '', probability_id: '', region_id: '', work_type_id: '', org_id: '', my: false, stale: false, overdue: false };

export function OpportunitiesPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [f, setF] = useState<Filters>(EMPTY_F);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Meta>('/api/meta').then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (f.q) params.set('q', f.q);
    if (f.status) params.set('status', f.status);
    if (f.stage_id) params.set('stage_id', f.stage_id);
    if (f.probability_id) params.set('probability_id', f.probability_id);
    if (f.region_id) params.set('region_id', f.region_id);
    if (f.work_type_id) params.set('work_type_id', f.work_type_id);
    if (f.org_id) params.set('org_id', f.org_id);
    if (f.my) params.set('my', 'true');
    if (f.stale) params.set('stale', 'true');
    if (f.overdue) params.set('overdue', 'true');
    params.set('page', String(page));
    params.set('pageSize', '30');
    api.get<{ items: Opportunity[]; total: number }>(`/api/opportunities?${params}`).then((r) => {
      setItems(r.items);
      setTotal(r.total);
    }).finally(() => setLoading(false));
  }, [f, page]);

  const masters = (t: string) => meta?.masters[t] ?? [];
  const statusTone = (s: string) => (s === 'won' ? 'green' : s === 'lost' ? 'red' : s === 'hold' ? 'orange' : 'gray');

  return (
    <div>
      <PageHeader
        title={`案件一覧（${total} 件）`}
        actions={
          <>
            <button className="btn" onClick={() => downloadCsv(`/api/csv/opportunities?${new URLSearchParams({ status: f.status || '', q: f.q })}`)}>CSV出力</button>
            <button className="btn primary" onClick={() => (window.location.hash = '#/opportunities/new')}>＋ 新規案件登録</button>
          </>
        }
      />

      <div className="filters">
        <input type="search" placeholder="案件名・コード・顧客で検索" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} />
        <select value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(1); }}>
          <option value="">状態: すべて</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.stage_id} onChange={(e) => { setF({ ...f, stage_id: e.target.value }); setPage(1); }}>
          <option value="">段階: すべて</option>
          {masters('stage').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={f.probability_id} onChange={(e) => { setF({ ...f, probability_id: e.target.value }); setPage(1); }}>
          <option value="">確度: すべて</option>
          {masters('probability').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={f.region_id} onChange={(e) => { setF({ ...f, region_id: e.target.value }); setPage(1); }}>
          <option value="">地域: すべて</option>
          {masters('region').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={f.work_type_id} onChange={(e) => { setF({ ...f, work_type_id: e.target.value }); setPage(1); }}>
          <option value="">工種: すべて</option>
          {masters('work_type').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={f.org_id} onChange={(e) => { setF({ ...f, org_id: e.target.value }); setPage(1); }}>
          <option value="">組織: すべて</option>
          {meta?.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label className="small"><input type="checkbox" checked={f.my} onChange={(e) => { setF({ ...f, my: e.target.checked }); setPage(1); }} /> 自分の担当</label>
        <label className="small"><input type="checkbox" checked={f.stale} onChange={(e) => { setF({ ...f, stale: e.target.checked }); setPage(1); }} /> 未更新</label>
        <label className="small"><input type="checkbox" checked={f.overdue} onChange={(e) => { setF({ ...f, overdue: e.target.checked }); setPage(1); }} /> 期限超過</label>
      </div>

      {loading && items.length === 0 ? (
        <Empty message="読み込み中…" />
      ) : items.length === 0 ? (
        <Empty message="該当する案件がありません" />
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>案件コード</th><th>案件名</th><th>顧客/発注者</th><th>組織</th><th>担当</th>
              <th>段階</th><th>確度</th><th className="num">予定受注額</th><th>受注予定日</th><th>次回行動期限</th><th>状態</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td><a href={`#/opportunities/${o.opp_code}`}>{o.opp_code}</a></td>
                <td>
                  <a href={`#/opportunities/${o.opp_code}`}>{o.name}</a>
                  {o.confidentiality_code === 'C3' ? <Badge tone="red">機密</Badge> : null}
                </td>
                <td>{o.customer_name ?? '-'}</td>
                <td>{o.org_name}</td>
                <td>{o.owner_name}</td>
                <td>{o.stage_name}</td>
                <td>{o.probability_name}</td>
                <td className="num">{yenShort(o.expected_amount)}</td>
                <td>{dateJa(o.expected_order_date)}</td>
                <td>{dateJa(o.next_action_due)}</td>
                <td><Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status] ?? o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← 前へ</button>
        <span className="small">ページ {page} / 全 {Math.max(1, Math.ceil(total / 30))}</span>
        <button className="btn sm" disabled={page * 30 >= total} onClick={() => setPage(page + 1)}>次へ →</button>
      </div>
    </div>
  );
}
