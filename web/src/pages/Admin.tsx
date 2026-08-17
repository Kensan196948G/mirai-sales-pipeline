/** 管理ページ: マスター / ユーザー / 監査ログ / 設定（タブ切替） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Master, AuditEntry } from '../types.ts';
import { dateTimeJa, ROLE_LABEL } from '../format.ts';
import { PageHeader, Badge, Alert, Field, Select, Input } from './ui.tsx';

type Tab = 'masters' | 'users' | 'audit' | 'settings';

export function AdminPage({ tab: initialTab }: { tab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div>
      <PageHeader title="管理" />
      <div className="tabs">
        <button className={tab === 'masters' ? 'active' : ''} onClick={() => setTab('masters')}>マスター管理</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>ユーザー管理</button>
        <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>監査ログ</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>システム設定</button>
      </div>
      {tab === 'masters' ? <MastersTab /> : null}
      {tab === 'users' ? <UsersTab /> : null}
      {tab === 'audit' ? <AuditTab /> : null}
      {tab === 'settings' ? <SettingsTab /> : null}
    </div>
  );
}

const MASTER_TYPES: { key: string; label: string }[] = [
  { key: 'stage', label: '案件段階' },
  { key: 'probability', label: '確度' },
  { key: 'region', label: '地域' },
  { key: 'work_type', label: '工種' },
  { key: 'loss_reason', label: '失注理由' },
  { key: 'confidentiality', label: '機密区分' },
  { key: 'action_type', label: '行動種別' },
  { key: 'public_private', label: '官民区分' },
];

function MastersTab() {
  const [mtype, setMtype] = useState('stage');
  const [items, setItems] = useState<Master[]>([]);
  const [error, setError] = useState('');
  const [f, setF] = useState({ name: '', code: '', sort_order: '0', weight: '' });

  const load = () => {
    api.get<{ items: Master[] }>(`/api/masters?mtype=${mtype}`).then((r) => setItems(r.items)).catch((e) => setError(e.message));
  };
  useEffect(load, [mtype]);

  const add = async () => {
    setError('');
    try {
      await api.post('/api/masters', {
        mtype, code: f.code, name: f.name, sort_order: Number(f.sort_order),
        weight: f.weight ? Number(f.weight) : null,
      });
      setF({ name: '', code: '', sort_order: '0', weight: '' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggle = async (m: Master) => {
    await api.put(`/api/masters/${m.id}`, { is_active: !m.is_active }).catch((e) => setError(e.message));
    load();
  };

  return (
    <div className="card">
      <h2>マスター管理</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex" style={{ marginBottom: 12 }}>
        <Select
          options={MASTER_TYPES.map((t) => ({ value: t.key, label: t.label }))}
          value={mtype}
          onChange={(e) => setMtype(e.target.value)}
        />
      </div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <Field label="コード"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="例: NEW1" /></Field>
        <Field label="名称" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="並び順"><Input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        {mtype === 'probability' ? <Field label="予測重み (0〜1)"><Input type="number" step="0.05" min="0" max="1" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field> : null}
      </div>
      <div className="actions"><button className="btn primary" onClick={add}>追加</button></div>
      <table className="grid" style={{ marginTop: 12 }}>
        <thead><tr><th>コード</th><th>名称</th><th>並び順</th><th>重み</th><th>状態</th><th>操作</th></tr></thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td>{m.code}</td>
              <td>{m.name}</td>
              <td>{m.sort_order}</td>
              <td>{m.weight ?? '-'}</td>
              <td><Badge tone={m.is_active ? 'green' : 'gray'}>{m.is_active ? '有効' : '無効'}</Badge></td>
              <td><button className="btn sm" onClick={() => toggle(m)}>{m.is_active ? '無効化' : '有効化'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTab() {
  const [items, setItems] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [f, setF] = useState({ email: '', display_name: '', role: 'sales', org_id: '', password: '' });

  const load = () => {
    api.get<{ items: any[] }>('/api/admin/users').then((r) => setItems(r.items)).catch((e) => setError(e.message));
    api.get<{ organizations: any[] }>('/api/meta').then((m) => setOrgs(m.organizations)).catch(() => {});
  };
  useEffect(load, []);

  const add = async () => {
    setError('');
    try {
      await api.post('/api/admin/users', f);
      setF({ email: '', display_name: '', role: 'sales', org_id: '', password: '' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggle = async (u: any) => {
    await api.put(`/api/admin/users/${u.id}`, { is_active: !u.is_active }).catch((e) => setError(e.message));
    load();
  };

  const resetPw = async (u: any) => {
    const pw = window.prompt(`${u.email} の新しいパスワード（8文字以上）`);
    if (!pw) return;
    await api.put(`/api/admin/users/${u.id}`, { password: pw }).catch((e) => setError(e.message));
    load();
  };

  return (
    <div className="card">
      <h2>ユーザー管理（admin のみ）</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="メールアドレス" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="表示名" required><Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
        <Field label="ロール" required>
          <Select options={Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l }))} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        </Field>
        <Field label="所属組織" required>
          <Select options={orgs.map((o) => ({ value: o.id, label: o.name }))} value={f.org_id} onChange={(e) => setF({ ...f, org_id: e.target.value })} />
        </Field>
        <Field label="初期パスワード" required hint="8文字以上"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
      <div className="actions"><button className="btn primary" onClick={add}>作成</button></div>

      <table className="grid" style={{ marginTop: 12 }}>
        <thead><tr><th>メール</th><th>表示名</th><th>ロール</th><th>組織</th><th>最終ログイン</th><th>状態</th><th>操作</th></tr></thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.display_name}</td>
              <td><Badge tone={u.role === 'admin' ? 'red' : u.role === 'hq' ? 'blue' : 'gray'}>{ROLE_LABEL[u.role] ?? u.role}</Badge></td>
              <td>{u.org_name}</td>
              <td className="small">{dateTimeJa(u.last_login_at)}</td>
              <td><Badge tone={u.is_active ? 'green' : 'gray'}>{u.is_active ? '有効' : '無効'}</Badge></td>
              <td>
                <div className="flex">
                  <button className="btn sm" onClick={() => resetPw(u)}>PW変更</button>
                  <button className="btn sm" onClick={() => toggle(u)}>{u.is_active ? '無効化' : '有効化'}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState('');

  useEffect(() => {
    api.get<{ items: AuditEntry[] }>(`/api/audit-logs${action ? `?action=${action}` : ''}`).then((r) => setItems(r.items)).catch(() => {});
  }, [action]);

  return (
    <div className="card">
      <h2>監査ログ</h2>
      <div className="flex" style={{ marginBottom: 12 }}>
        <Select
          options={[{value:'',label:'全操作'},{value:'create',label:'作成'},{value:'update',label:'更新'},{value:'csv_export',label:'CSV出力'},{value:'login',label:'ログイン'},{value:'delete',label:'削除'}]}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      <table className="grid">
        <thead><tr><th>日時</th><th>操作者</th><th>操作</th><th>対象</th><th>項目</th><th>変更前</th><th>変更後</th><th>理由</th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td className="small">{dateTimeJa(a.created_at)}</td>
              <td>{a.user_name ?? '-'}</td>
              <td>{a.action}</td>
              <td className="small">{a.entity_type}:{String(a.entity_id).slice(0, 8)}</td>
              <td>{a.field ?? '-'}</td>
              <td className="small">{String(a.old_value ?? '').slice(0, 40)}</td>
              <td className="small">{String(a.new_value ?? '').slice(0, 40)}</td>
              <td className="small">{a.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab() {
  const [items, setItems] = useState<{ key: string; value: any; description: string }[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api.get<{ items: { key: string; value: any; description: string }[] }>('/api/admin/settings').then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, []);

  const update = (key: string, value: number) => {
    api.put('/api/admin/settings', { [key]: { value } }).then(() => {
      setNote(`${key} を更新しました`);
      setItems((prev) => prev.map((it) => (it.key === key ? { ...it, value: { value } } : it)));
    }).catch((e) => setError(e.message));
  };

  return (
    <div className="card">
      <h2>システム設定（詳細仕様設計書 §19）</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {note ? <Alert tone="success">{note}</Alert> : null}
      <table className="grid">
        <thead><tr><th>キー</th><th>説明</th><th className="num">値</th><th>操作</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.key}>
              <td><code>{it.key}</code></td>
              <td className="small">{it.description}</td>
              <td className="num"><b>{it.value?.value ?? ''}</b></td>
              <td>
                <button className="btn sm" onClick={() => {
                  const v = Number(window.prompt(`${it.key} の新しい値（現在: ${it.value?.value}）`, String(it.value?.value)));
                  if (!Number.isNaN(v)) update(it.key, v);
                }}>変更</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
