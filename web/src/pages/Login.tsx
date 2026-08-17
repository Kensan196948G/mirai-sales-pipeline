/** ログイン画面（Open Design プロトタイプのデザイン + 実API認証） */
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth.tsx';
import { navigate } from '../router.tsx';
import { Icon } from '../icons.tsx';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@mirai.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-panel">
        <div className="lp-inner">
          <div className="brand-row">
            <div className="logo"><Icon name="spark" /></div>
            <div>
              <div className="brand-name">MIRAI Sales</div>
              <div className="brand-sub">SALES PIPELINE &amp; FORECAST</div>
            </div>
          </div>
          <div className="lp-hero">
            <div className="lp-kicker">営業パイプライン・受注予測管理</div>
            <div className="lp-title">営業を、<br />ひとつの数字で<br />見通す。</div>
            <p className="lp-lead">案件の重複・停滞・更新漏れを減らし、部・支店・全社の受注見込を即座に集計。案件会議から確定文書まで、ひとつの場所で追跡できます。</p>
            <ul className="lp-feats">
              <li><span className="ck"><Icon name="check" /></span><div><b>案件を組織横断で一元管理</b><span>一意の案件コードと共通ルールで全社の案件を可視化</span></div></li>
              <li><span className="ck"><Icon name="check" /></span><div><b>確度加重でリアルな見込を集計</b><span>単純積上げと確度加重、計画差異・達成率を自動算出</span></div></li>
              <li><span className="ck"><Icon name="check" /></span><div><b>停滞・期限超過をアラートで検知</b><span>長期未更新や次回行動の期限切れを通知で早期発見</span></div></li>
            </ul>
          </div>
          <div className="lp-foot">© 2026 Mirai DX Platform — 社内専用システム</div>
        </div>
      </div>
      <div className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <h1>ログイン</h1>
          <div className="sub">アカウント情報を入力してください</div>
          {error && (
            <div className="alert error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="alert" /><span className="alert-msg">{error}</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="login-email">メールアドレス</label>
            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="login-pass">パスワード <a className="hint-link" href="#/login" onClick={(e) => e.preventDefault()}>お忘れですか？</a></label>
            <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button className="btn primary btn-login" type="submit" disabled={busy}>{busy ? 'ログイン中…' : 'ログイン'}<Icon name="chev-r" /></button>
          <div className="demo-note"><Icon name="check-circle" /><div>デモ環境（MVP / 開発）では初期パスワードでログインできます。本番のパスワードは管理者から配布されたものを使用してください。</div></div>
          <div className="copyright">本システムは社内専用です。アクセスは監査ログに記録されます。</div>
        </form>
      </div>
    </div>
  );
}
