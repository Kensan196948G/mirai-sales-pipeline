/** アプリシェル（Open Design プロトタイプのサイドバー/トップバー/通知を実APIで稼働） */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth.tsx';
import { api } from '../api.ts';
import type { Notification } from '../types.ts';
import { Icon } from '../icons.tsx';
import { navigate } from '../router.tsx';

interface NavItem { key: string; label: string; icon: string; href: string; roles?: readonly string[] }
const NAV_MAIN: NavItem[] = [
  { key: 'dashboard', label: 'ダッシュボード', icon: 'dash', href: '#/' },
  { key: 'opportunities', label: '案件一覧', icon: 'list', href: '#/opportunities' },
  { key: 'health', label: '案件健全性', icon: 'health', href: '#/health' },
];
const NAV_PLAN: NavItem[] = [
  { key: 'plans', label: '年間受注計画', icon: 'target', href: '#/plans' },
  { key: 'snapshots', label: '予測スナップショット', icon: 'camera', href: '#/snapshots' },
];
const NAV_ADMIN: NavItem[] = [
  { key: 'admin-masters', label: 'マスター管理', icon: 'tag', href: '#/masters', roles: ['hq', 'admin'] },
  { key: 'admin-audit', label: '監査ログ', icon: 'file', href: '#/audit', roles: ['hq', 'admin'] },
  { key: 'admin-users', label: 'ユーザー管理', icon: 'users', href: '#/users', roles: ['admin'] },
  { key: 'admin-settings', label: 'システム設定', icon: 'sliders', href: '#/settings', roles: ['admin'] },
];

export function Layout({ children, navKey, crumb, title }: { children: ReactNode; navKey: string; crumb: string; title: string }) {
  const { user, logout } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const loadNotifs = () => {
    api.get<{ items: Notification[]; unread: number }>('/api/notifications').then((r) => {
      setNotifs(r.items);
      setUnread(r.unread);
    }).catch(() => {});
  };

  useEffect(() => {
    loadNotifs();
    const iv = setInterval(loadNotifs, 60_000);
    return () => clearInterval(iv);
  }, []);

  // 外部クリックで通知パネルを閉じる
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const markRead = async () => {
    await api.post('/api/notifications/read').catch(() => {});
    setUnread(0);
    loadNotifs();
  };

  const canSee = (item: NavItem) => (item.roles ? user != null && item.roles.includes(user.role) : true);
  const navItem = (item: NavItem) =>
    canSee(item) ? (
      <a
        key={item.key}
        className={`nav-item${navKey === item.key ? ' active' : ''}`}
        href={item.href}
        data-nav={item.key}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </a>
    ) : null;

  const initial = user?.display_name?.slice(0, 1) ?? '?';

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} id="sidebar">
        <button className="icon-btn sb-close" onClick={() => setSidebarOpen(false)} aria-label="メニューを閉じる"><Icon name="x" /></button>
        <div className="sb-brand">
          <div className="sb-name">MIRAI SALES<small>営業パイプライン・受注予測管理</small></div>
        </div>
        <nav className="nav">
          <div className="nav-sec">メイン</div>
          {NAV_MAIN.map(navItem)}
          <div className="nav-sec">計画・予測</div>
          {NAV_PLAN.map(navItem)}
          <div className="nav-sec">管理</div>
          {NAV_ADMIN.map(navItem)}
        </nav>
        <div className="sb-user">
          <div className="avatar">{initial}</div>
          <div className="sb-user-meta">
            <div className="sb-user-name">{user?.display_name ?? '-'}</div>
            <div className="sb-user-role">{user?.org_name}</div>
          </div>
          <button className="icon-btn" title="ログアウト" aria-label="ログアウト" onClick={() => void logout()}><Icon name="logout" /></button>
        </div>
      </aside>
      <div className="scrim" style={{ display: sidebarOpen ? 'block' : 'none' }} onClick={() => setSidebarOpen(false)} />

      <main className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="メニュー"><Icon name="menu" /></button>
            <div className="tb-title">
              <div className="crumb">{crumb}</div>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="tb-right">
            <div className="bell" ref={bellRef}>
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-label="通知"><Icon name="bell" /></button>
              {unread > 0 && <span className="dot" id="bell-dot" />}
              {open && (
                <div className="notif-panel" style={{ display: 'block' }} onClick={(e) => e.stopPropagation()}>
                  <div className="notif-head"><b>通知</b><button className="btn sm ghost" onClick={markRead}>すべて既読</button></div>
                  {notifs.length === 0 ? <div className="empty">通知はありません</div> : null}
                  {notifs.map((n) => (
                    <a
                      key={n.id}
                      className={`notif-item${n.is_read ? '' : ' unread'}`}
                      href={n.link ?? '#'}
                      onClick={() => setOpen(false)}
                    >
                      <div className="t">{n.is_read ? null : <span className="udot" />}{n.title}</div>
                      {n.body ? <div className="m">{n.body}</div> : null}
                      <div className="tm">{n.created_at.slice(0, 16).replace('T', ' ')}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="avatar lg" title={user?.display_name}>{initial}</div>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export { navigate };
