/** 案件一覧（新デザイン + /api/opportunities 結線: 検索・フィルタ・ページング） */
import { useCallback, useEffect, useState } from 'react';
import { api, downloadCsv } from '../api.ts';
import type { Meta, Master, Opportunity } from '../types.ts';
import { yenShort, dateJa, STATUS_LABEL } from '../format.ts';
import { Icon } from '../icons.tsx';
import { navigate } from '../router.tsx';

const STATUS_BADGE: Record<string, string> = { in_progress: 'gray', won: 'green', lost: 'red', hold: 'orange', cancelled: 'gray' };

interface ListResp { items: Opportunity[]; total: number; page: number; pageSize: number }

export function OpportunitiesPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [stageId, setStageId] = useState('');
  const [probId, setProbId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [workTypeId, setWorkTypeId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [my, setMy] = useState(false);
  const [stale, setStale] = useState(false);
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    api.get<Meta>('/api/meta').then(setMeta).catch(() => {});
  }, []);

  const load = useCallback((p: number) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (stageId) params.set('stage_id', stageId);
    if (probId) params.set('probability_id', probId);
    if (regionId) params.set('region_id', regionId);
    if (workTypeId) params.set('work_type_id', workTypeId);
    if (orgId) params.set('org_id', orgId);
    if (my) params.set('my', 'true');
    if (stale) params.set('stale', 'true');
    if (overdue) params.set('overdue', 'true');
    api.get<ListResp>(`/api/opportunities?${params.toString()}`)
      .then((r) => { setItems(r.items); setTotal(r.total); setPage(r.page); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, status, stageId, probId, regionId, workTypeId, orgId, my, stale, overdue]);

  useEffect(() => { load(1); }, [load]);

  const mtype = (t: string) => (meta?.masters[t] ?? []) as Master[];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="page-toolbar" style={{ justifyContent: 'flex-end' }}>
        <div className="toolbar-actions">
          <button className="btn" onClick={() => downloadCsv('/api/csv/opportunities')}><Icon name="download" />CSV出力</button>
          <button className="btn primary" onClick={() => navigate('/opportunities/new')}><Icon name="plus" />新規案件登録</button>
        </div>
      </div>

      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" />
          <input
            type="search"
            aria-label="案件を検索"
            placeholder="案件名・コード・顧客で検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(1); }}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="状態">
          <option value="">状態: すべて</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="段階">
          <option value="">段階: すべて</option>
          {mtype('stage').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={probId} onChange={(e) => setProbId(e.target.value)} aria-label="確度">
          <option value="">確度: すべて</option>
          {mtype('probability').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="地域">
          <option value="">地域: すべて</option>
          {mtype('region').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={workTypeId} onChange={(e) => setWorkTypeId(e.target.value)} aria-label="工種">
          <option value="">工種: すべて</option>
          {mtype('work_type').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-label="組織">
          <option value="">組織: すべて</option>
          {(meta?.organizations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label className="chk"><input type="checkbox" checked={my} onChange={(e) => setMy(e.target.checked)} /> 自分の担当</label>
        <label className="chk"><input type="checkbox" checked={stale} onChange={(e) => setStale(e.target.checked)} /> 未更新</label>
        <label className="chk"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> 期限超過</label>
      </div>

      {error ? <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div> : null}

      {!loading && items.length === 0 ? (
        <div className="card">
          <div className="empty">
            <span className="empty-ic"><Icon name="search" /></span>
            <b>{q.trim() ? `「${q.trim()}」に一致する案件はありません` : '条件に一致する案件はありません'}</b>
            <p>キーワードやフィルタ条件を変更して、もう一度お試しください。</p>
            <button className="btn" onClick={() => { setQ(''); setStatus(''); setStageId(''); setProbId(''); setRegionId(''); setWorkTypeId(''); setOrgId(''); setMy(false); setStale(false); setOverdue(false); }}>条件をクリア</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>案件コード</th><th>案件名</th><th>顧客/発注者</th><th>組織</th><th>担当</th><th>段階</th><th>確度</th><th className="num">予定受注額</th><th>受注予定日</th><th className="num">次回行動期限</th><th>状態</th>
            </tr></thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td className="code"><a href={`#/opportunities/${o.opp_code}`}>{o.opp_code}</a></td>
                  <td><a href={`#/opportunities/${o.opp_code}`}>{o.name}</a></td>
                  <td>{o.customer_name ?? '-'}</td>
                  <td>{o.org_name}</td>
                  <td>{o.owner_name}</td>
                  <td>{o.stage_name}</td>
                  <td>{o.probability_name}</td>
                  <td className="num">{yenShort(o.expected_amount)}</td>
                  <td>{dateJa(o.expected_order_date)}</td>
                  <td className="num">{dateJa(o.next_action_due)}</td>
                  <td><span className={`badge ${STATUS_BADGE[o.status] ?? 'gray'}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button className="btn sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}><Icon name="chev-l" />前へ</button>
        <span className="pg-info">{page} / {totalPages} ページ ・ 全 {total} 件</span>
        <button className="btn sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>次へ<Icon name="chev-r" /></button>
      </div>
    </div>
  );
}
