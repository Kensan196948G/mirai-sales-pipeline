/** 案件登録・編集（新デザイン + /api/meta・/opportunities 結線） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Meta, Opportunity } from '../types.ts';
import { Icon } from '../icons.tsx';
import { navigate } from '../router.tsx';

interface Form {
  name: string;
  customer_id: string;
  public_private_id: string;
  region_id: string;
  work_type_id: string;
  org_id: string;
  owner_id: string;
  co_owner_ids: string[];
  stage_id: string;
  probability_id: string;
  expected_amount: string;
  expected_gross_profit: string;
  expected_order_date: string;
  next_action: string;
  next_action_due: string;
  status: string;
  confidentiality_id: string;
  loss_reason_id: string;
  loss_note: string;
  one_drive_url: string;
  direct_cloud_url: string;
  notes: string;
  reason: string;
}

const EMPTY: Form = {
  name: '', customer_id: '', public_private_id: '', region_id: '', work_type_id: '',
  org_id: '', owner_id: '', co_owner_ids: [], stage_id: '', probability_id: '',
  expected_amount: '', expected_gross_profit: '', expected_order_date: '', next_action: '',
  next_action_due: '', status: 'in_progress', confidentiality_id: '', loss_reason_id: '',
  loss_note: '', one_drive_url: '', direct_cloud_url: '', notes: '', reason: '',
};

export function OpportunityFormPage({ code, isEdit }: { code?: string; isEdit: boolean }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [version, setVersion] = useState(1);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Form>(EMPTY);

  useEffect(() => {
    api.get<Meta>('/api/meta').then((m) => {
      setMeta(m);
      setF((prev) => ({
        ...prev,
        org_id: prev.org_id || m.organizations[0]?.id || '',
        stage_id: prev.stage_id || m.masters.stage?.[0]?.id || '',
        probability_id: prev.probability_id || m.masters.probability?.[0]?.id || '',
        confidentiality_id: prev.confidentiality_id || m.masters.confidentiality?.[0]?.id || '',
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit || !code) return;
    api.get<Opportunity>(`/api/opportunities/${code}`).then((o) => {
      setVersion(o.version);
      setF({
        name: o.name, customer_id: o.customer_id ?? '', public_private_id: o.public_private_id ?? '',
        region_id: o.region_id ?? '', work_type_id: o.work_type_id ?? '', org_id: o.org_id, owner_id: o.owner_id,
        co_owner_ids: (o.members ?? []).map((m) => m.user_id),
        stage_id: o.stage_id, probability_id: o.probability_id, expected_amount: String(o.expected_amount ?? ''),
        expected_gross_profit: o.expected_gross_profit != null ? String(o.expected_gross_profit) : '',
        expected_order_date: o.expected_order_date ?? '', next_action: o.next_action ?? '',
        next_action_due: o.next_action_due ?? '', status: o.status, confidentiality_id: o.confidentiality_id,
        loss_reason_id: o.loss_reason_id ?? '', loss_note: o.loss_note ?? '',
        one_drive_url: o.one_drive_url ?? '', direct_cloud_url: o.direct_cloud_url ?? '',
        notes: o.notes ?? '', reason: '',
      });
    }).catch((e) => setError(e.message));
  }, [isEdit, code]);

  if (!meta) return <div className="empty">読み込み中…</div>;

  const masters = (t: string) => meta.masters[t] ?? [];
  const set = (k: keyof Form, v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
    if (!f.name.trim()) { setError('案件名を入力してください（必須項目です）。'); return; }
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: f.name, customer_id: f.customer_id || null, public_private_id: f.public_private_id || null,
        region_id: f.region_id || null, work_type_id: f.work_type_id || null, org_id: f.org_id,
        owner_id: f.owner_id, co_owner_ids: f.co_owner_ids, stage_id: f.stage_id, probability_id: f.probability_id,
        expected_amount: Number(f.expected_amount), expected_gross_profit: f.expected_gross_profit ? Number(f.expected_gross_profit) : null,
        expected_order_date: f.expected_order_date || null, next_action: f.next_action || null,
        next_action_due: f.next_action_due || null, status: f.status, confidentiality_id: f.confidentiality_id,
        loss_reason_id: f.loss_reason_id || null, loss_note: f.loss_note || null,
        one_drive_url: f.one_drive_url || null, direct_cloud_url: f.direct_cloud_url || null,
        notes: f.notes || null, reason: f.reason || undefined,
      };
      if (isEdit && code) {
        await api.put(`/api/opportunities/${code}?version=${version}`, body);
        setNote('保存しました');
        navigate(`/opportunities/${code}`);
      } else {
        const r = await api.post<{ opp_code: string; duplicate_candidates: number }>('/api/opportunities', body);
        if (r.duplicate_candidates > 0) {
          setNote(`重複候補が ${r.duplicate_candidates} 件検出されました。案件詳細の「重複候補」タブで確認してください`);
        }
        navigate(`/opportunities/${r.opp_code}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const sel = (label: string, required: boolean, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <div className="field">
      <label className={required ? 'req' : undefined}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">選択してください</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      {error && <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div>}
      {note && <div className="alert success" role="status"><Icon name="check-circle" /><span>{note}</span></div>}

      <div className="card">
        <div className="form-sec-title"><Icon name="list" />基本情報</div>
        <div className="form-grid">
          <div className="field full">
            <label className="req">案件名</label>
            <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="正式名称または営業管理名称" />
          </div>
          <div className="field"><label>顧客/発注者</label><CustomerSelect value={f.customer_id} onChange={(v) => set('customer_id', v)} /></div>
          {sel('官民区分', false, f.public_private_id, (v) => set('public_private_id', v), masters('public_private').map((m) => ({ value: m.id, label: m.name })))}
          {sel('地域', false, f.region_id, (v) => set('region_id', v), masters('region').map((m) => ({ value: m.id, label: m.name })))}
          {sel('工種', false, f.work_type_id, (v) => set('work_type_id', v), masters('work_type').map((m) => ({ value: m.id, label: m.name })))}
          {sel('主管組織', true, f.org_id, (v) => set('org_id', v), meta.organizations.map((o) => ({ value: o.id, label: o.name })))}
          {sel('主担当', true, f.owner_id, (v) => set('owner_id', v), meta.users.map((u) => ({ value: u.id, label: `${u.display_name}（${u.org_name}）` })))}
          <div className="field">
            <label>共同担当</label>
            <select value="" onChange={(e) => { if (e.target.value && !f.co_owner_ids.includes(e.target.value)) setF({ ...f, co_owner_ids: [...f.co_owner_ids, e.target.value] }); }}>
              <option value="">選択してください</option>
              {meta.users.filter((u) => u.id !== f.owner_id).map((u) => <option key={u.id} value={u.id}>{u.display_name}（{u.org_name}）</option>)}
            </select>
          </div>
          {f.co_owner_ids.length > 0 ? (
            <div className="field full">
              <label>選択中の共同担当</label>
              <div className="pill-row">
                {f.co_owner_ids.map((id) => {
                  const u = meta.users.find((x) => x.id === id);
                  return (
                    <span key={id} className="pill-tag">
                      {u?.display_name ?? id}
                      <button onClick={() => setF({ ...f, co_owner_ids: f.co_owner_ids.filter((x) => x !== id) })} aria-label="削除"><Icon name="x" /></button>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          {sel('案件段階', true, f.stage_id, (v) => set('stage_id', v), masters('stage').map((m) => ({ value: m.id, label: m.name })))}
          {sel('確度', true, f.probability_id, (v) => set('probability_id', v), masters('probability').map((m) => ({ value: m.id, label: `${m.name}（重み ${m.weight ?? '-'}）` })))}
          {sel('機密区分', true, f.confidentiality_id, (v) => set('confidentiality_id', v), masters('confidentiality').map((m) => ({ value: m.id, label: m.name })))}
          {sel('状態', false, f.status, (v) => set('status', v), [
            { value: 'in_progress', label: '進行中' }, { value: 'hold', label: '保留' }, { value: 'won', label: '受注' }, { value: 'lost', label: '失注' }, { value: 'cancelled', label: '取消' },
          ])}
        </div>
      </div>

      <div className="card">
        <div className="form-sec-title"><Icon name="target" />金額・時期・行動</div>
        <div className="form-grid">
          <div className="field"><label className="req">予定受注額（円）</label><input type="number" min={0} value={f.expected_amount} onChange={(e) => set('expected_amount', e.target.value)} /><div className="hint">0以上</div></div>
          <div className="field"><label>予定粗利額（円）</label><input type="number" min={0} value={f.expected_gross_profit} onChange={(e) => set('expected_gross_profit', e.target.value)} /></div>
          <div className="field"><label>受注予定日</label><input type="date" value={f.expected_order_date} onChange={(e) => set('expected_order_date', e.target.value)} /></div>
          <div className="field"><label>次回行動</label><input value={f.next_action} onChange={(e) => set('next_action', e.target.value)} /></div>
          <div className="field"><label>次回行動期限</label><input type="date" value={f.next_action_due} onChange={(e) => set('next_action_due', e.target.value)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="form-sec-title"><Icon name="external" />文書リンク・備考</div>
        <div className="form-grid">
          <div className="field"><label>OneDrive 作業版リンク</label><input placeholder="https://…" value={f.one_drive_url} onChange={(e) => set('one_drive_url', e.target.value)} /><div className="hint">提案資料・面談メモ等</div></div>
          <div className="field"><label>DirectCloud 正本リンク</label><input placeholder="https://…" value={f.direct_cloud_url} onChange={(e) => set('direct_cloud_url', e.target.value)} /><div className="hint">確定見積・契約書・受注計画等</div></div>
          {sel('失注理由', false, f.loss_reason_id, (v) => set('loss_reason_id', v), masters('loss_reason').map((m) => ({ value: m.id, label: m.name })))}
          <div className="field"><label>失注理由補足</label><input value={f.loss_note} onChange={(e) => set('loss_note', e.target.value)} /></div>
          <div className="field full"><label>備考</label><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="form-sec-title"><Icon name="file" />{isEdit ? '変更理由（監査記録）' : '登録情報'}</div>
        {isEdit ? (
          <div className="field">
            <label>変更理由</label>
            <textarea value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="確度・段階・金額等の重要変更には理由が監査記録されます" />
            <div className="hint">確度・段階・金額等の重要変更には理由が監査記録されます</div>
          </div>
        ) : (
          <p className="muted small">登録時は監査対象の変更はありません。</p>
        )}
        <div className="actions">
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
          <button className="btn" onClick={() => (isEdit && code ? navigate(`/opportunities/${code}`) : navigate('/opportunities'))}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

/** 顧客セレクト（候補検索付き） */
function CustomerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [list, setList] = useState<{ id: string; code: string; name: string }[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api.get<{ items: { id: string; code: string; name: string }[] }>(`/api/customers?q=${encodeURIComponent(q)}`).then((r) => setList(r.items)).catch(() => {});
  }, [q]);
  return (
    <div>
      <input placeholder="顧客を検索…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 4 }} />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">顧客を選択</option>
        {list.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
      </select>
    </div>
  );
}
