/** 管理ページ（新デザイン: セグメント + マスター/ユーザー/監査/設定を実APIで稼働） */
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Master, AuditEntry } from '../types.ts';
import { dateTimeJa, ROLE_LABEL } from '../format.ts';
import { Icon } from '../icons.tsx';

export type AdminTab = 'masters' | 'users' | 'audit' | 'settings';

export function AdminPage({ tab }: { tab: AdminTab }) {
  return (
    <div>
      <AdminSeg active={tab} />
      {tab === 'masters' ? <MastersScreen /> : null}
      {tab === 'users' ? <UsersScreen /> : null}
      {tab === 'audit' ? <AuditScreen /> : null}
      {tab === 'settings' ? <SettingsScreen /> : null}
    </div>
  );
}

function AdminSeg({ active }: { active: AdminTab }) {
  const pills: { key: AdminTab; label: string; href: string }[] = [
    { key: 'masters', label: 'マスター管理', href: '#/masters' },
    { key: 'users', label: 'ユーザー管理', href: '#/users' },
    { key: 'audit', label: '監査ログ', href: '#/audit' },
    { key: 'settings', label: 'システム設定', href: '#/settings' },
  ];
  return (
    <div className="seg">
      {pills.map((p) => (
        <a key={p.key} className={`seg-pill${active === p.key ? ' active' : ''}`} href={p.href}>{p.label}</a>
      ))}
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

function MastersScreen() {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加に失敗しました');
    }
  };

  const toggle = async (m: Master) => {
    await api.put(`/api/masters/${m.id}`, { is_active: !m.is_active }).catch((e) => setError(e.message));
    load();
  };

  return (
    <div className="card">
      <div className="form-sec-title"><Icon name="tag" />マスター管理</div>
      {error ? <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div> : null}
      <div className="flex wrap" style={{ marginBottom: 16 }}>
        <div className="field" style={{ minWidth: 200 }}><label>種別</label>
          <select value={mtype} onChange={(e) => setMtype(e.target.value)}>
            {MASTER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field"><label>コード</label><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="例: NEW1" /></div>
        <div className="field"><label className="req">名称</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例: 一次審査" /></div>
        <div className="field"><label>並び順</label><input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></div>
        {mtype === 'probability' ? (
          <div className="field"><label>予測重み (0〜1)</label><input type="number" step="0.05" min={0} max={1} value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} placeholder="確度のみ" /></div>
        ) : null}
      </div>
      <div style={{ marginBottom: 16 }}><button className="btn primary" onClick={add}>追加</button></div>
      <table className="tbl" style={{ margin: '0 -4px' }}>
        <thead><tr><th>コード</th><th>名称</th><th>並び順</th><th>重み</th><th>状態</th><th>操作</th></tr></thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td className="code">{m.code}</td>
              <td>{m.name}</td>
              <td>{m.sort_order}</td>
              <td>{m.weight ?? '-'}</td>
              <td><span className={`badge ${m.is_active ? 'green' : 'gray'}`}>{m.is_active ? '有効' : '無効'}</span></td>
              <td><button className="btn sm ghost" onClick={() => toggle(m)}>{m.is_active ? '無効化' : '有効化'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersScreen() {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました');
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

  const roleTone = (r: string) => (r === 'admin' ? 'red' : r === 'hq' ? 'blue' : r === 'manager' ? 'orange' : 'gray');

  return (
    <div className="card">
      <div className="form-sec-title"><Icon name="users" />ユーザー管理（admin のみ）</div>
      {error ? <div className="alert error" role="alert"><Icon name="alert" /><span className="alert-msg">{error}</span></div> : null}
      <div className="form-grid" style={{ marginBottom: 18 }}>
        <div className="field"><label className="req">メールアドレス</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@mirai.local" /></div>
        <div className="field"><label className="req">表示名</label><input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="山田 花子" /></div>
        <div className="field"><label className="req">ロール</label>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field"><label className="req">所属組織</label>
          <select value={f.org_id} onChange={(e) => setF({ ...f, org_id: e.target.value })}>
            <option value="">選択してください</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="field"><label className="req">初期パスワード</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="8文字以上" /><div className="hint">8文字以上</div></div>
      </div>
      <div style={{ marginBottom: 16 }}><button className="btn primary" onClick={add}>作成</button></div>
      <table className="tbl" style={{ margin: '0 -4px' }}>
        <thead><tr><th>メール</th><th>表示名</th><th>ロール</th><th>組織</th><th>最終ログイン</th><th>状態</th><th>操作</th></tr></thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.display_name}</td>
              <td><span className={`badge ${roleTone(u.role)}`}>{ROLE_LABEL[u.role] ?? u.role}</span></td>
              <td>{u.org_name}</td>
              <td className="small">{dateTimeJa(u.last_login_at)}</td>
              <td><span className={`badge ${u.is_active ? 'green' : 'gray'}`}>{u.is_active ? '有効' : '無効'}</span></td>
              <td>
                <div className="flex">
                  <button className="btn sm ghost" onClick={() => resetPw(u)}>PW変更</button>
                  <button className="btn sm ghost" onClick={() => toggle(u)}>{u.is_active ? '無効化' : '有効化'}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditScreen() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState('');

  useEffect(() => {
    api.get<{ items: AuditEntry[] }>(`/api/audit-logs${action ? `?action=${action}` : ''}`).then((r) => setItems(r.items)).catch(() => {});
  }, [action]);

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}>
        <h2>監査ログ</h2>
        <div className="field" style={{ minWidth: 180 }}>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">全操作</option>
            <option value="create">作成</option>
            <option value="update">更新</option>
            <option value="csv_export">CSV出力</option>
            <option value="login">ログイン</option>
            <option value="delete">削除</option>
          </select>
        </div>
      </div>
      <table className="tbl">
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

function SettingsScreen() {
  const [items, setItems] = useState<{ key: string; value: any; description: string }[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api.get<{ items: { key: string; value: any; description: string }[] }>('/api/admin/settings').then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, []);

  const update = (key: string, value: number) => {
    api.put('/api/admin/settings', { [key]: { value } }).then(() => {
      setNote(`${key} を更新しました`);
      setTimeout(() => setNote(''), 2000);
      setItems((prev) => prev.map((it) => (it.key === key ? { ...it, value: { value } } : it)));
    }).catch((e) => setError(e.message));
  };

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <div className="card-head" style={{ padding: '18px 22px 12px', margin: 0 }}>
        <h2>システム設定</h2>
        <span className="meta">変更は監査ログに記録されます</span>
      </div>
      {error ? <div className="alert error" role="alert" style={{ margin: '0 22px 12px' }}><Icon name="alert" /><span className="alert-msg">{error}</span></div> : null}
      {note ? <div className="alert success" role="status" style={{ margin: '0 22px 12px' }}><Icon name="check-circle" /><span>{note}</span></div> : null}
      <table className="tbl">
        <thead><tr><th>キー</th><th>説明</th><th className="num">値</th><th>操作</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.key}>
              <td><code>{it.key}</code></td>
              <td className="small">{it.description}</td>
              <td className="num"><b>{it.value?.value ?? ''}</b></td>
              <td>
                <button className="btn sm ghost" onClick={() => {
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
