/** 案件詳細（SCR-03）: 基本情報 / 行動 / 文書 / 履歴 / 重複候補 */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Action, AuditEntry, DocLink, Opportunity } from '../types.ts';
import { yen, pct, dateJa, dateTimeJa, STATUS_LABEL, DOC_TYPE_LABEL, PROVIDER_LABEL } from '../format.ts';
import { PageHeader, Badge, Empty, Alert, Field, Select, Input, TextArea } from './ui.tsx';
import { navigate } from '../router.tsx';

type Tab = 'basic' | 'actions' | 'docs' | 'audit' | 'dups';

export function OpportunityDetailPage({ params }: { params: Record<string, string> }) {
  const oppCode = params.oppCode!;
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [tab, setTab] = useState<Tab>('basic');
  const [error, setError] = useState('');

  const load = () => {
    api.get<Opportunity>(`/api/opportunities/${oppCode}`).then(setOpp).catch((e) => setError(e.message));
  };
  useEffect(load, [oppCode]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!opp) return <div className="empty">読み込み中…</div>;

  const statusTone = opp.status === 'won' ? 'green' : opp.status === 'lost' ? 'red' : opp.status === 'hold' ? 'orange' : 'gray';

  return (
    <div>
      <PageHeader
        title={`${opp.opp_code} ${opp.name}`}
        actions={
          <>
            <Badge tone={statusTone}>{STATUS_LABEL[opp.status] ?? opp.status}</Badge>
            <button className="btn" onClick={() => navigate(`/opportunities/${oppCode}/edit`)}>編集</button>
          </>
        }
      />

      <div className="tabs">
        <button className={tab === 'basic' ? 'active' : ''} onClick={() => setTab('basic')}>基本情報</button>
        <button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>行動 ({opp.actions?.length ?? 0})</button>
        <button className={tab === 'docs' ? 'active' : ''} onClick={() => setTab('docs')}>文書 ({opp.doc_links?.length ?? 0})</button>
        <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>変更履歴 ({opp.audit?.length ?? 0})</button>
        <button className={tab === 'dups' ? 'active' : ''} onClick={() => setTab('dups')}>重複候補 ({opp.duplicates?.length ?? 0})</button>
      </div>

      {tab === 'basic' ? <BasicTab opp={opp} /> : null}
      {tab === 'actions' ? <ActionsTab opp={opp} onChanged={load} /> : null}
      {tab === 'docs' ? <DocsTab opp={opp} onChanged={load} /> : null}
      {tab === 'audit' ? <AuditTab opp={opp} /> : null}
      {tab === 'dups' ? <DupsTab opp={opp} onChanged={load} /> : null}
    </div>
  );
}

function BasicTab({ opp }: { opp: Opportunity }) {
  return (
    <div className="card">
      <div className="detail-grid">
        <div className="item"><div className="k">案件コード</div><div className="v">{opp.opp_code}</div></div>
        <div className="item"><div className="k">顧客/発注者</div><div className="v">{opp.customer_name ?? '-'}</div></div>
        <div className="item"><div className="k">官民区分</div><div className="v">{opp.public_private_name ?? '-'}</div></div>
        <div className="item"><div className="k">地域</div><div className="v">{opp.region_name ?? '-'}</div></div>
        <div className="item"><div className="k">工種</div><div className="v">{opp.work_type_name ?? '-'}</div></div>
        <div className="item"><div className="k">主管組織</div><div className="v">{opp.org_name}</div></div>
        <div className="item"><div className="k">主担当</div><div className="v">{opp.owner_name}</div></div>
        <div className="item"><div className="k">共同担当</div><div className="v">{opp.members?.map((m: any) => m.display_name).join(', ') || '-'}</div></div>
        <div className="item"><div className="k">案件段階</div><div className="v">{opp.stage_name}</div></div>
        <div className="item"><div className="k">確度</div><div className="v">{opp.probability_name}</div></div>
        <div className="item"><div className="k">機密区分</div><div className="v">{opp.confidentiality_name}</div></div>
        <div className="item"><div className="k">最終更新</div><div className="v">{dateTimeJa(opp.last_updated_at)}</div></div>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '16px 0' }} />
      <div className="detail-grid">
        <div className="item"><div className="k">予定受注額</div><div className="v">{yen(opp.expected_amount)}</div></div>
        <div className="item"><div className="k">予定粗利額</div><div className="v">{yen(opp.expected_gross_profit)}</div></div>
        <div className="item"><div className="k">予定粗利率</div><div className="v">{pct(opp.gross_margin_rate)}</div></div>
        <div className="item"><div className="k">受注予定日</div><div className="v">{dateJa(opp.expected_order_date)}</div></div>
        <div className="item"><div className="k">次回行動</div><div className="v">{opp.next_action ?? '-'}</div></div>
        <div className="item"><div className="k">次回行動期限</div><div className="v">{dateJa(opp.next_action_due)}</div></div>
      </div>
      {opp.one_drive_url ? <p className="small">OneDrive: <a href={opp.one_drive_url} target="_blank" rel="noreferrer">作業版リンク</a></p> : null}
      {opp.direct_cloud_url ? <p className="small">DirectCloud: <a href={opp.direct_cloud_url} target="_blank" rel="noreferrer">正本リンク</a></p> : null}
      {opp.notes ? <p><b>備考:</b> {opp.notes}</p> : null}
      {opp.loss_reason_name ? <p><b>失注理由:</b> {opp.loss_reason_name} {opp.loss_note ? `(${opp.loss_note})` : ''}</p> : null}
    </div>
  );
}

function ActionsTab({ opp, onChanged }: { opp: Opportunity; onChanged: () => void }) {
  const [form, setForm] = useState<Partial<Action>>({ is_done: false });
  const [meta, setMeta] = useState<{ action_type: { id: string; name: string }[] } | null>(null);

  useEffect(() => {
    api.get<any>('/api/meta').then((m) => setMeta({ action_type: m.masters.action_type ?? [] })).catch(() => {});
  }, []);

  const submit = async () => {
    try {
      await api.post(`/api/opportunities/${opp.opp_code}/actions`, {
        action_type_id: form.action_type_id ?? null,
        title: form.title ?? '',
        scheduled_at: form.scheduled_at ?? null,
        done_at: form.done_at ?? null,
        is_done: form.is_done ?? false,
        result: form.result ?? null,
        next_action: form.next_action ?? null,
        next_action_due: form.next_action_due ?? null,
      });
      setForm({ is_done: false });
      onChanged();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="card">
      <h2>行動の登録</h2>
      <div className="form-grid">
        <Field label="行動種別">
          <Select options={(meta?.action_type ?? []).map((m) => ({ value: m.id, label: m.name }))} value={form.action_type_id ?? ''} onChange={(e) => setForm({ ...form, action_type_id: e.target.value })} />
        </Field>
        <Field label="タイトル"><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="予定日時"><Input type="datetime-local" value={form.scheduled_at ?? ''} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Field>
        <Field label="実施日時"><Input type="datetime-local" value={form.done_at ?? ''} onChange={(e) => setForm({ ...form, done_at: e.target.value })} /></Field>
        <Field label="結果・要点" className="full"><TextArea value={form.result ?? ''} onChange={(e) => setForm({ ...form, result: e.target.value })} /></Field>
        <Field label="次回行動"><Input value={form.next_action ?? ''} onChange={(e) => setForm({ ...form, next_action: e.target.value })} /></Field>
        <Field label="次回行動期限"><Input type="date" value={form.next_action_due ?? ''} onChange={(e) => setForm({ ...form, next_action_due: e.target.value })} /></Field>
      </div>
      <div className="actions"><button className="btn primary" onClick={submit}>登録</button></div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '18px 0' }} />
      <h2>行動履歴</h2>
      {(opp.actions ?? []).length === 0 ? <Empty message="行動はありません" /> : (
        <table className="grid">
          <thead><tr><th>予定日時</th><th>種別</th><th>タイトル</th><th>担当</th><th>実施日時</th><th>結果</th></tr></thead>
          <tbody>
            {(opp.actions ?? []).map((a) => (
              <tr key={a.id}>
                <td>{dateTimeJa(a.scheduled_at)}</td>
                <td>{a.action_type_name ?? '-'}</td>
                <td>{a.title ?? '-'}</td>
                <td>{a.owner_name ?? '-'}</td>
                <td>{dateTimeJa(a.done_at)}</td>
                <td className="small">{a.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DocsTab({ opp, onChanged }: { opp: Opportunity; onChanged: () => void }) {
  const [form, setForm] = useState<Partial<DocLink>>({ doc_type: 'working', provider: 'onedrive' });

  const submit = async () => {
    if (!form.url) return alert('URL を入力してください');
    try {
      await api.post(`/api/opportunities/${opp.opp_code}/doc-links`, form);
      setForm({ doc_type: 'working', provider: 'onedrive' });
      onChanged();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="card">
      <h2>文書参照の登録（OneDrive 作業版 / DirectCloud 正本）</h2>
      <div className="form-grid">
        <Field label="文書種別">
          <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value as DocLink['doc_type'] })}>
            <option value="working">作業版（OneDrive）</option>
            <option value="final">正本（DirectCloud）</option>
          </select>
        </Field>
        <Field label="プロバイダ">
          <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            <option value="onedrive">OneDrive</option>
            <option value="directcloud">DirectCloud</option>
            <option value="other">その他</option>
          </select>
        </Field>
        <Field label="URL" className="full"><Input value={form.url ?? ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></Field>
        <Field label="タイトル"><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="版/確定日"><Input type="date" value={form.confirmed_at ?? ''} onChange={(e) => setForm({ ...form, confirmed_at: e.target.value })} /></Field>
      </div>
      <div className="actions"><button className="btn primary" onClick={submit}>登録</button></div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '18px 0' }} />
      {(opp.doc_links ?? []).length === 0 ? <Empty message="文書リンクはありません" /> : (
        <table className="grid">
          <thead><tr><th>種別</th><th>プロバイダ</th><th>リンク</th><th>タイトル</th><th>確定日</th></tr></thead>
          <tbody>
            {(opp.doc_links ?? []).map((d) => (
              <tr key={d.id}>
                <td><Badge tone={d.doc_type === 'final' ? 'green' : 'blue'}>{DOC_TYPE_LABEL[d.doc_type]}</Badge></td>
                <td>{PROVIDER_LABEL[d.provider]}</td>
                <td><a href={d.url} target="_blank" rel="noreferrer">{d.url.slice(0, 60)}…</a></td>
                <td>{d.title ?? '-'}</td>
                <td>{dateJa(d.confirmed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AuditTab({ opp }: { opp: Opportunity }) {
  const rows = (opp.audit ?? []) as AuditEntry[];
  if (rows.length === 0) return <Empty message="変更履歴はありません" />;
  return (
    <div className="card">
      <table className="grid">
        <thead><tr><th>日時</th><th>操作者</th><th>操作</th><th>項目</th><th>変更前</th><th>変更後</th><th>理由</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="small">{dateTimeJa(a.created_at)}</td>
              <td>{a.user_name ?? '-'}</td>
              <td>{a.action}</td>
              <td>{a.field ?? '-'}</td>
              <td className="small">{String(a.old_value ?? '').slice(0, 50)}</td>
              <td className="small">{String(a.new_value ?? '').slice(0, 50)}</td>
              <td className="small">{a.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DupsTab({ opp, onChanged }: { opp: Opportunity; onChanged: () => void }) {
  const dups = (opp.duplicates ?? []) as any[];
  if (dups.length === 0) return <Empty message="重複候補はありません（自動統合は行いません。管理者が判断します）" />;
  const decide = async (candidateId: string, decision: string) => {
    if (!window.confirm(`この重複候補を「${decision === 'merged' ? '統合対象' : decision === 'separate' ? '別案件' : '候補外'}」として判定しますか？`)) return;
    await api.post(`/api/opportunities/${opp.opp_code}/duplicates/${candidateId}/resolve`, { decision }).catch((e) => alert(e.message));
    onChanged();
  };
  return (
    <div className="card">
      <h2>重複候補</h2>
      <table className="grid">
        <thead><tr><th>相手案件</th><th className="num">スコア</th><th>一致要素</th><th>操作</th></tr></thead>
        <tbody>
          {dups.map((d) => (
            <tr key={d.id}>
              <td>
                <a href={`#/opportunities/${d.opp_code}`}>{d.opp_code} {d.name}</a>
                <div className="muted small">状態: {STATUS_LABEL[d.other_status] ?? d.other_status}</div>
              </td>
              <td className="num">{Math.round(Number(d.score) * 100)}%</td>
              <td className="small">{(d.matched_fields ?? []).join(', ')}</td>
              <td>
                <div className="flex">
                  <button className="btn sm" onClick={() => decide(d.id, 'merged')}>統合対象</button>
                  <button className="btn sm" onClick={() => decide(d.id, 'separate')}>別案件</button>
                  <button className="btn sm" onClick={() => decide(d.id, 'dismissed')}>候補外</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
