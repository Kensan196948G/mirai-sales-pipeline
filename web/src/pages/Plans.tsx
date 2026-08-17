/** 年間受注計画（新デザイン + /api/plans 結線: 計画差異サマリ・登録・改定） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { yenShort, pct, dateTimeJa } from '../format.ts';
import { Icon } from '../icons.tsx';
import { useAuth } from '../auth.tsx';

interface PlanSummary {
  fiscal_year: number;
  items: {
    org_id: string; org_code: string; org_name: string; status: string;
    target_amount: number; forecast_simple: number; forecast_weighted: number;
    variance: number; achievement_rate: number | null; count: number;
  }[];
  totals: { target_amount: number; forecast_simple: number; forecast_weighted: number; variance: number; achievement_rate: number | null; count: number };
}

interface PlanRow {
  id: string; fiscal_year: number; org_id: string; org_code: string; org_name: string;
  target_amount: number; target_gross_profit: number | null; revision: number; status: string;
  public_private_name: string | null; region_name: string | null; work_type_name: string | null; updated_at: string;
}

export function PlansPage() {
  const { user } = useAuth();
  const canEdit = ['hq', 'admin', 'manager'].includes(user?.role ?? '');
  const [fy, setFy] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get<PlanSummary>(`/api/plans/summary?fiscal_year=${fy}`).then(setSummary).catch((e) => setError(e.message));
    api.get<{ items: PlanRow[] }>(`/api/plans?fiscal_year=${fy}`).then((r) => setPlans(r.items)).catch((e) => setError(e.message));
  };
  useEffect(load, [fy]);

  if (error) return <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div>;
  if (!summary) return <div className="empty">読み込み中…</div>;

  const diffColor = (v: number) => ({ color: v < 0 ? 'var(--danger)' : 'var(--success)' });

  return (
    <div>
      <div className="page-toolbar">
        <div className="muted small">計画差異は「加重見込 − 目標受注額」で算出</div>
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

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>計画差異サマリ</h2></div>
        <table className="tbl">
          <thead><tr><th>組織</th><th className="num">目標受注額</th><th className="num">積上げ見込</th><th className="num">加重見込</th><th className="num">差異</th><th className="num">達成見込率</th><th className="num">件数</th></tr></thead>
          <tbody>
            {summary.items.map((it) => (
              <tr key={it.org_id}>
                <td>{it.org_name}</td>
                <td className="num">{yenShort(it.target_amount)}</td>
                <td className="num">{yenShort(it.forecast_simple)}</td>
                <td className="num">{yenShort(it.forecast_weighted)}</td>
                <td className="num" style={diffColor(it.variance)}>{yenShort(it.variance)}</td>
                <td className="num">{it.achievement_rate == null ? '-' : pct(it.achievement_rate)}</td>
                <td className="num">{it.count}</td>
              </tr>
            ))}
            <tr className="tbl-row-total">
              <td>全社</td>
              <td className="num">{yenShort(summary.totals.target_amount)}</td>
              <td className="num">{yenShort(summary.totals.forecast_simple)}</td>
              <td className="num">{yenShort(summary.totals.forecast_weighted)}</td>
              <td className="num" style={diffColor(summary.totals.variance)}>{yenShort(summary.totals.variance)}</td>
              <td className="num">{summary.totals.achievement_rate == null ? '-' : pct(summary.totals.achievement_rate)}</td>
              <td className="num">{summary.totals.count}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}><h2>計画登録・改定</h2></div>
          {plans.length === 0 ? (
            <div className="empty">計画が未登録です</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>組織</th><th>区分</th><th className="num">目標受注額</th><th className="num">目標粗利</th><th>版</th><th>状態</th><th>更新日時</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>{p.org_name}</td>
                    <td className="small">{[p.public_private_name, p.region_name, p.work_type_name].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="num">{yenShort(p.target_amount)}</td>
                    <td className="num">{p.target_gross_profit != null ? yenShort(p.target_gross_profit) : '-'}</td>
                    <td>v{p.revision}</td>
                    <td><span className={`badge ${p.status === 'approved' ? 'green' : 'gray'}`}>{p.status === 'approved' ? '承認済' : '下書き'}</span></td>
                    <td className="small">{dateTimeJa(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canEdit ? <PlanForm fy={fy} onSaved={load} /> : null}
      </div>
    </div>
  );
}

function PlanForm({ fy, onSaved }: { fy: number; onSaved: () => void }) {
  const [orgId, setOrgId] = useState('');
  const [amount, setAmount] = useState('');
  const [gp, setGp] = useState('');
  const [error, setError] = useState('');
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get<{ organizations: { id: string; name: string }[] }>('/api/meta').then((m) => setOrgs(m.organizations)).catch(() => {});
  }, []);

  const submit = async () => {
    setError('');
    try {
      await api.post('/api/plans', {
        fiscal_year: fy, org_id: orgId, target_amount: Number(amount),
        target_gross_profit: gp ? Number(gp) : null, status: 'approved',
      });
      setAmount(''); setGp(''); setOrgId('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登録に失敗しました');
    }
  };

  return (
    <div className="card">
      <div className="card-head"><h2>新規計画の登録</h2></div>
      {error ? <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div> : null}
      <div className="form-grid">
        <div className="field"><label className="req">組織</label>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">選択してください</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="field"><label className="req">目標受注額（円）</label><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
        <div className="field"><label>目標粗利額（円）</label><input type="number" min={0} value={gp} onChange={(e) => setGp(e.target.value)} placeholder="0" /></div>
      </div>
      <div className="actions"><button className="btn primary" onClick={submit}>登録</button></div>
    </div>
  );
}
