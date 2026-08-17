/** 案件詳細（新デザイン + /api/opportunities/:code 結線: 基本/行動/文書/履歴/重複） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Action, AuditEntry, DocLink, Opportunity } from '../types.ts';
import { yen, pct, dateJa, dateTimeJa, STATUS_LABEL, DOC_TYPE_LABEL, PROVIDER_LABEL } from '../format.ts';
import { Icon } from '../icons.tsx';
import { navigate } from '../router.tsx';

type Tab = 'basic' | 'actions' | 'docs' | 'audit' | 'dups';

export function OpportunityDetailPage({ code }: { code: string }) {
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [tab, setTab] = useState<Tab>('basic');
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get<Opportunity>(`/api/opportunities/${code}`).then(setOpp).catch((e) => setError(e.message));
  };
  useEffect(load, [code]);

  if (error) return <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div>;
  if (!opp) return <div className="empty">読み込み中…</div>;

  const statusTone = opp.status === 'won' ? 'green' : opp.status === 'lost' ? 'red' : opp.status === 'hold' ? 'orange' : 'gray';
  const tabs: { id: Tab; label: string; cnt?: number }[] = [
    { id: 'basic', label: '基本情報' },
    { id: 'actions', label: '行動', cnt: opp.actions?.length ?? 0 },
    { id: 'docs', label: '文書', cnt: opp.doc_links?.length ?? 0 },
    { id: 'audit', label: '変更履歴', cnt: opp.audit?.length ?? 0 },
    { id: 'dups', label: '重複候補', cnt: opp.duplicates?.length ?? 0 },
  ];

  return (
    <div>
      <div className="page-toolbar">
        <div className="flex">
          <span className={`badge ${statusTone}`}><span className="bdot" />{STATUS_LABEL[opp.status] ?? opp.status}</span>
          <span className="badge orange">{opp.probability_name}</span>
          <span className="muted small mono">{opp.opp_code}</span>
        </div>
        <div className="toolbar-actions">
          <button className="btn" onClick={() => navigate(`/opportunities/${code}/edit`)}><Icon name="edit" />編集</button>
          <button className="btn primary" onClick={() => setTab('actions')}><Icon name="plus" />行動を登録</button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}{t.cnt != null ? <span className="cnt">{t.cnt}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'basic' && <BasicTab opp={opp} />}
      {tab === 'actions' && <ActionsTab opp={opp} onChanged={load} />}
      {tab === 'docs' && <DocsTab opp={opp} onChanged={load} />}
      {tab === 'audit' && <AuditTab opp={opp} />}
      {tab === 'dups' && <DupsTab opp={opp} onChanged={load} />}
    </div>
  );
}

function BasicTab({ opp }: { opp: Opportunity }) {
  return (
    <div className="card">
      <div className="detail-grid">
        <div className="dgi"><div className="k">案件コード</div><div className="v mono">{opp.opp_code}</div></div>
        <div className="dgi"><div className="k">顧客/発注者</div><div className="v">{opp.customer_name ?? '-'}</div></div>
        <div className="dgi"><div className="k">官民区分</div><div className="v">{opp.public_private_name ?? '-'}</div></div>
        <div className="dgi"><div className="k">地域</div><div className="v">{opp.region_name ?? '-'}</div></div>
        <div className="dgi"><div className="k">工種</div><div className="v">{opp.work_type_name ?? '-'}</div></div>
        <div className="dgi"><div className="k">主管組織</div><div className="v">{opp.org_name}</div></div>
        <div className="dgi"><div className="k">主担当</div><div className="v">{opp.owner_name}</div></div>
        <div className="dgi"><div className="k">共同担当</div><div className="v">{opp.members?.map((m) => m.display_name).join(', ') || '-'}</div></div>
        <div className="dgi"><div className="k">案件段階</div><div className="v">{opp.stage_name}</div></div>
        <div className="dgi"><div className="k">確度</div><div className="v">{opp.probability_name}{opp.probability_weight != null ? `（重み ${opp.probability_weight}）` : ''}</div></div>
        <div className="dgi"><div className="k">機密区分</div><div className="v">{opp.confidentiality_name}</div></div>
        <div className="dgi"><div className="k">最終更新</div><div className="v">{dateTimeJa(opp.last_updated_at)}</div></div>
      </div>
      <hr className="divider" />
      <div className="detail-grid">
        <div className="dgi"><div className="k">予定受注額</div><div className="v amount">{yen(opp.expected_amount)}</div></div>
        <div className="dgi"><div className="k">予定粗利額</div><div className="v amount">{yen(opp.expected_gross_profit)}</div></div>
        <div className="dgi"><div className="k">予定粗利率</div><div className="v">{pct(opp.gross_margin_rate)}</div></div>
        <div className="dgi"><div className="k">受注予定日</div><div className="v">{dateJa(opp.expected_order_date)}</div></div>
        <div className="dgi"><div className="k">次回行動</div><div className="v">{opp.next_action ?? '-'}</div></div>
        <div className="dgi"><div className="k">次回行動期限</div><div className="v">{dateJa(opp.next_action_due)}</div></div>
      </div>
      <hr className="divider" />
      {opp.one_drive_url ? (
        <div className="link-row"><Icon name="external" /><a href={opp.one_drive_url} target="_blank" rel="noreferrer">OneDrive 作業版リンク</a><span className="muted small">提案資料・面談メモ</span></div>
      ) : null}
      {opp.direct_cloud_url ? (
        <div className="link-row"><Icon name="external" /><a href={opp.direct_cloud_url} target="_blank" rel="noreferrer">DirectCloud 正本リンク</a><span className="muted small">確定見積・契約書</span></div>
      ) : null}
      {opp.notes ? <div className="link-row" style={{ marginTop: 12, color: 'var(--fg)' }}><b>備考:</b> {opp.notes}</div> : null}
      {opp.loss_reason_name ? <div className="link-row" style={{ marginTop: 8 }}><b>失注理由:</b> {opp.loss_reason_name}{opp.loss_note ? `（${opp.loss_note}）` : ''}</div> : null}
    </div>
  );
}

function ActionsTab({ opp, onChanged }: { opp: Opportunity; onChanged: () => void }) {
  const [form, setForm] = useState<Partial<Action>>({ is_done: false });
  const [actionTypes, setActionTypes] = useState<{ id: string; name: string }[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    api.get<{ masters: Record<string, { id: string; name: string }[]> }>('/api/meta')
      .then((m) => setActionTypes(m.masters.action_type ?? []))
      .catch(() => {});
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
      setNote('行動を登録しました');
      setTimeout(() => setNote(''), 1800);
      onChanged();
    } catch (e) {
      setNote(e instanceof Error ? e.message : '登録に失敗しました');
    }
  };

  return (
    <div className="card">
      {note ? <div className="alert success" role="status"><Icon name="check-circle" /><span>{note}</span></div> : null}
      <div className="form-sec-title"><Icon name="plus" />行動の登録</div>
      <div className="form-grid">
        <div className="field"><label>行動種別</label>
          <select value={form.action_type_id ?? ''} onChange={(e) => setForm({ ...form, action_type_id: e.target.value })}>
            <option value="">選択してください</option>
            {actionTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="field"><label>タイトル</label><input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例: 発注担当者との打合せ" /></div>
        <div className="field"><label>予定日時</label><input type="datetime-local" value={form.scheduled_at ?? ''} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
        <div className="field"><label>実施日時</label><input type="datetime-local" value={form.done_at ?? ''} onChange={(e) => setForm({ ...form, done_at: e.target.value })} /></div>
        <div className="field full"><label>結果・要点</label><textarea value={form.result ?? ''} onChange={(e) => setForm({ ...form, result: e.target.value })} /></div>
        <div className="field"><label>次回行動</label><input value={form.next_action ?? ''} onChange={(e) => setForm({ ...form, next_action: e.target.value })} /></div>
        <div className="field"><label>次回行動期限</label><input type="date" value={form.next_action_due ?? ''} onChange={(e) => setForm({ ...form, next_action_due: e.target.value })} /></div>
      </div>
      <div className="actions"><button className="btn primary" onClick={submit}>登録</button></div>
      <hr className="divider" />
      <div className="card-head"><h2>行動履歴</h2><span className="meta">{opp.actions?.length ?? 0} 件</span></div>
      {(opp.actions ?? []).length === 0 ? (
        <div className="empty">行動はありません</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>予定日時</th><th>種別</th><th>タイトル</th><th>担当</th><th>実施日時</th><th>結果</th></tr></thead>
          <tbody>
            {(opp.actions ?? []).map((a) => (
              <tr key={a.id}>
                <td className="small">{dateTimeJa(a.scheduled_at)}</td>
                <td>{a.action_type_name ?? '-'}</td>
                <td>{a.title ?? '-'}</td>
                <td>{a.owner_name ?? '-'}</td>
                <td className="small">{dateTimeJa(a.done_at)}</td>
                <td className="small">{a.result ?? ''}</td>
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
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!form.url) { setNote('URL を入力してください'); return; }
    try {
      await api.post(`/api/opportunities/${opp.opp_code}/doc-links`, {
        doc_type: form.doc_type ?? 'working',
        provider: form.provider ?? 'other',
        url: form.url,
        title: form.title ?? null,
        confirmed_at: form.confirmed_at ?? null,
      });
      setForm({ doc_type: 'working', provider: 'onedrive' });
      setNote('文書リンクを登録しました');
      setTimeout(() => setNote(''), 1800);
      onChanged();
    } catch (e) {
      setNote(e instanceof Error ? e.message : '登録に失敗しました');
    }
  };

  return (
    <div className="card">
      {note ? <div className={`alert ${note.includes('登録しました') ? 'success' : 'error'}`} role="status"><Icon name={note.includes('登録しました') ? 'check-circle' : 'alert'} /><span>{note}</span></div> : null}
      <div className="form-sec-title"><Icon name="plus" />文書参照の登録</div>
      <div className="form-grid">
        <div className="field"><label>文書種別</label>
          <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value as DocLink['doc_type'] })}>
            <option value="working">作業版（OneDrive）</option>
            <option value="final">正本（DirectCloud）</option>
          </select>
        </div>
        <div className="field"><label>プロバイダ</label>
          <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            <option value="onedrive">OneDrive</option>
            <option value="directcloud">DirectCloud</option>
            <option value="other">その他</option>
          </select>
        </div>
        <div className="field full"><label>URL</label><input value={form.url ?? ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
        <div className="field"><label>タイトル</label><input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="field"><label>版/確定日</label><input type="date" value={form.confirmed_at ?? ''} onChange={(e) => setForm({ ...form, confirmed_at: e.target.value })} /></div>
      </div>
      <div className="actions"><button className="btn primary" onClick={submit}>登録</button></div>
      <hr className="divider" />
      <div className="card-head"><h2>登録済み文書</h2><span className="meta">{opp.doc_links?.length ?? 0} 件</span></div>
      {(opp.doc_links ?? []).length === 0 ? (
        <div className="empty">文書リンクはありません</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>種別</th><th>プロバイダ</th><th>リンク</th><th>タイトル</th><th>確定日</th></tr></thead>
          <tbody>
            {(opp.doc_links ?? []).map((d) => (
              <tr key={d.id}>
                <td><span className={`badge ${d.doc_type === 'final' ? 'green' : 'blue'}`}>{DOC_TYPE_LABEL[d.doc_type]}</span></td>
                <td>{PROVIDER_LABEL[d.provider] ?? d.provider}</td>
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
  return (
    <div className="card">
      <div className="card-head"><h2>変更履歴</h2><span className="meta">重要項目の変更と理由を記録</span></div>
      {rows.length === 0 ? (
        <div className="empty">変更履歴はありません</div>
      ) : (
        <table className="tbl">
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
      )}
    </div>
  );
}

function DupsTab({ opp, onChanged }: { opp: Opportunity; onChanged: () => void }) {
  const dups = (opp.duplicates ?? []) as { id: string; score: number; matched_fields: string[]; opp_code: string; name: string; other_status: string }[];
  const decide = async (candidateId: string, decision: string, label: string) => {
    if (!window.confirm(`この重複候補を「${label}」として判定しますか？`)) return;
    await api.post(`/api/opportunities/${opp.opp_code}/duplicates/${candidateId}/resolve`, { decision }).catch((e) => window.alert(e.message));
    onChanged();
  };
  return (
    <div className="card">
      <div className="card-head"><h2>重複候補</h2><span className="meta">自動統合は行いません。管理者が判断します。</span></div>
      {dups.length === 0 ? (
        <div className="empty">重複候補はありません</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>相手案件</th><th className="num">スコア</th><th>一致要素</th><th>操作</th></tr></thead>
          <tbody>
            {dups.map((d) => (
              <tr key={d.id}>
                <td>
                  <a href={`#/opportunities/${d.opp_code}`}>{d.opp_code} {d.name}</a>
                  <div className="sub">状態: {STATUS_LABEL[d.other_status] ?? d.other_status}</div>
                </td>
                <td className="num">
                  <span className="score-dot">
                    <span className="ring" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{Math.round(Number(d.score) * 100)}%</span>
                  </span>
                </td>
                <td className="small">{(d.matched_fields ?? []).join(', ')}</td>
                <td>
                  <div className="flex wrap">
                    <button className="btn sm" onClick={() => decide(d.id, 'merged', '統合対象')}>統合対象</button>
                    <button className="btn sm" onClick={() => decide(d.id, 'separate', '別案件')}>別案件</button>
                    <button className="btn sm ghost" onClick={() => decide(d.id, 'dismissed', '候補外')}>候補外</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
