/** 案件登録・編集（SCR-04） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Meta, Opportunity } from '../types.ts';
import { PageHeader, Field, Select, Input, TextArea, Alert } from './ui.tsx';
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

export function OpportunityFormPage({ params }: { params: Record<string, string> }) {
  const oppCode = params.oppCode;
  const isEdit = Boolean(oppCode);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [current, setCurrent] = useState<Opportunity | null>(null);
  const [version, setVersion] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Form>({
    name: '', customer_id: '', public_private_id: '', region_id: '', work_type_id: '',
    org_id: '', owner_id: '', co_owner_ids: [], stage_id: '', probability_id: '',
    expected_amount: '', expected_gross_profit: '', expected_order_date: '', next_action: '',
    next_action_due: '', status: 'in_progress', confidentiality_id: '', loss_reason_id: '',
    loss_note: '', one_drive_url: '', direct_cloud_url: '', notes: '', reason: '',
  });

  useEffect(() => {
    api.get<Meta>('/api/meta').then((m) => {
      setMeta(m);
      // 初期値: 自組織・初期段階・初期確度・通常機密
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
    if (!isEdit) return;
    api.get<Opportunity>(`/api/opportunities/${oppCode}`).then((o) => {
      setCurrent(o);
      setVersion(o.version);
      setF({
        name: o.name, customer_id: o.customer_id ?? '', public_private_id: o.public_private_id ?? '',
        region_id: o.region_id ?? '', work_type_id: o.work_type_id ?? '', org_id: o.org_id, owner_id: o.owner_id,
        co_owner_ids: (o.members as any[])?.map((m: any) => m.user_id) ?? [],
        stage_id: o.stage_id, probability_id: o.probability_id, expected_amount: String(o.expected_amount ?? ''),
        expected_gross_profit: o.expected_gross_profit != null ? String(o.expected_gross_profit) : '',
        expected_order_date: o.expected_order_date ?? '', next_action: o.next_action ?? '',
        next_action_due: o.next_action_due ?? '', status: o.status, confidentiality_id: o.confidentiality_id,
        loss_reason_id: o.loss_reason_id ?? '', loss_note: o.loss_note ?? '',
        one_drive_url: o.one_drive_url ?? '', direct_cloud_url: o.direct_cloud_url ?? '',
        notes: o.notes ?? '', reason: '',
      });
    }).catch((e) => setError(e.message));
  }, [isEdit, oppCode]);

  if (!meta) return <div className="empty">読み込み中…</div>;

  const masters = (t: string) => meta.masters[t] ?? [];
  const set = (k: keyof Form, v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
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
      if (isEdit) {
        await api.put(`/api/opportunities/${oppCode}?version=${version}`, body);
        navigate(`/opportunities/${oppCode}`);
      } else {
        const r = await api.post<{ opp_code: string; duplicate_candidates: number }>('/api/opportunities', body);
        if (r.duplicate_candidates > 0) {
          alert(`重複候補が ${r.duplicate_candidates} 件検出されました。案件詳細の「重複候補」タブで確認してください`);
        }
        navigate(`/opportunities/${r.opp_code}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={isEdit ? `案件編集: ${current?.opp_code}` : '新規案件登録'} />
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="card">
        <h2>基本情報</h2>
        <div className="form-grid">
          <Field label="案件名" required className="full">
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="正式名称または営業管理名称" />
          </Field>
          <Field label="顧客/発注者">
            <CustomerSelect value={f.customer_id} onChange={(v) => set('customer_id', v)} />
          </Field>
          <Field label="官民区分">
            <Select options={masters('public_private').map((m) => ({ value: m.id, label: m.name }))} value={f.public_private_id} onChange={(e) => set('public_private_id', e.target.value)} />
          </Field>
          <Field label="地域">
            <Select options={masters('region').map((m) => ({ value: m.id, label: m.name }))} value={f.region_id} onChange={(e) => set('region_id', e.target.value)} />
          </Field>
          <Field label="工種">
            <Select options={masters('work_type').map((m) => ({ value: m.id, label: m.name }))} value={f.work_type_id} onChange={(e) => set('work_type_id', e.target.value)} />
          </Field>
          <Field label="主管組織" required>
            <Select options={meta.organizations.map((o) => ({ value: o.id, label: o.name }))} value={f.org_id} onChange={(e) => set('org_id', e.target.value)} />
          </Field>
          <Field label="主担当" required>
            <Select options={meta.users.map((u) => ({ value: u.id, label: `${u.display_name}（${u.org_name}）` }))} value={f.owner_id} onChange={(e) => set('owner_id', e.target.value)} />
          </Field>
          <Field label="共同担当">
            <Select
              options={meta.users.filter((u) => u.id !== f.owner_id).map((u) => ({ value: u.id, label: `${u.display_name}（${u.org_name}）` }))}
              value=""
              onChange={(e) => {
                if (e.target.value && !f.co_owner_ids.includes(e.target.value)) {
                  setF({ ...f, co_owner_ids: [...f.co_owner_ids, e.target.value] });
                }
              }}
            />
          </Field>
          {f.co_owner_ids.length > 0 ? (
            <div className="field full">
              <label>選択中の共同担当</label>
              <div className="flex">
                {f.co_owner_ids.map((id) => {
                  const u = meta.users.find((x) => x.id === id);
                  return (
                    <span key={id} className="pill">
                      {u?.display_name ?? id}{' '}
                      <button className="btn sm" onClick={() => setF({ ...f, co_owner_ids: f.co_owner_ids.filter((x) => x !== id) })}>×</button>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Field label="案件段階" required>
            <Select options={masters('stage').map((m) => ({ value: m.id, label: m.name }))} value={f.stage_id} onChange={(e) => set('stage_id', e.target.value)} />
          </Field>
          <Field label="確度" required>
            <Select options={masters('probability').map((m) => ({ value: m.id, label: `${m.name}（重み ${m.weight ?? '-'}）` }))} value={f.probability_id} onChange={(e) => set('probability_id', e.target.value)} />
          </Field>
          <Field label="機密区分" required>
            <Select options={masters('confidentiality').map((m) => ({ value: m.id, label: m.name }))} value={f.confidentiality_id} onChange={(e) => set('confidentiality_id', e.target.value)} />
          </Field>
          <Field label="状態">
            <Select options={[{ value: 'in_progress', label: '進行中' }, { value: 'hold', label: '保留' }, { value: 'won', label: '受注' }, { value: 'lost', label: '失注' }, { value: 'cancelled', label: '取消' }]} value={f.status} onChange={(e) => set('status', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h2>金額・時期・行動</h2>
        <div className="form-grid">
          <Field label="予定受注額（円）" required hint="0以上">
            <Input type="number" min="0" value={f.expected_amount} onChange={(e) => set('expected_amount', e.target.value)} />
          </Field>
          <Field label="予定粗利額（円）">
            <Input type="number" min="0" value={f.expected_gross_profit} onChange={(e) => set('expected_gross_profit', e.target.value)} />
          </Field>
          <Field label="受注予定日">
            <Input type="date" value={f.expected_order_date} onChange={(e) => set('expected_order_date', e.target.value)} />
          </Field>
          <Field label="次回行動">
            <Input value={f.next_action} onChange={(e) => set('next_action', e.target.value)} />
          </Field>
          <Field label="次回行動期限">
            <Input type="date" value={f.next_action_due} onChange={(e) => set('next_action_due', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h2>文書リンク・備考</h2>
        <div className="form-grid">
          <Field label="OneDrive 作業版リンク" hint="提案資料・面談メモ等">
            <Input value={f.one_drive_url} onChange={(e) => set('one_drive_url', e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="DirectCloud 正本リンク" hint="確定見積・契約書・受注計画等">
            <Input value={f.direct_cloud_url} onChange={(e) => set('direct_cloud_url', e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="失注理由">
            <Select options={masters('loss_reason').map((m) => ({ value: m.id, label: m.name }))} value={f.loss_reason_id} onChange={(e) => set('loss_reason_id', e.target.value)} />
          </Field>
          <Field label="失注理由補足">
            <Input value={f.loss_note} onChange={(e) => set('loss_note', e.target.value)} />
          </Field>
          <Field label="備考" className="full">
            <TextArea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h2>{isEdit ? '変更理由（監査記録）' : '登録情報'}</h2>
        {isEdit ? (
          <Field label="変更理由" required={f.probability_id !== current?.probability_id} hint="確度・段階・金額等の重要変更には理由が監査記録されます">
            <TextArea value={f.reason} onChange={(e) => set('reason', e.target.value)} />
          </Field>
        ) : (
          <p className="muted small">登録時は監査対象の変更はありません。</p>
        )}
        <div className="actions">
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
          <button className="btn" onClick={() => (isEdit ? navigate(`/opportunities/${oppCode}`) : navigate('/opportunities'))}>キャンセル</button>
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
      <Input placeholder="顧客を検索…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 4, width: '100%' }}>
        <option value="">顧客を選択</option>
        {list.map((c) => (
          <option key={c.id} value={c.id}>{c.code} {c.name}</option>
        ))}
      </select>
    </div>
  );
}
