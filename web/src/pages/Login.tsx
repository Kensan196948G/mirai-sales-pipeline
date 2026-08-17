/** ログインページ */
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth.tsx';
import { Alert } from './ui.tsx';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      window.location.hash = '#/';
    } catch (err: any) {
      setError(err?.message ?? 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>営業パイプライン・受注予測管理</h1>
        <div className="sub">Sales Pipeline & Order Forecast Management</div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="field" style={{ marginBottom: 12 }}>
          <label>メールアドレス</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </div>
        <div className="field" style={{ marginBottom: 18 }}>
          <label>パスワード</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'ログイン中…' : 'ログイン'}
        </button>
        <p className="muted small" style={{ marginTop: 16, textAlign: 'center' }}>
          デモ: admin@mirai.local / Mirai#2026
        </p>
      </form>
    </div>
  );
}
