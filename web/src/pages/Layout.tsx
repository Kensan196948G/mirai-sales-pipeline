/** レイアウト（サイドバー・通知ベル） */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth.tsx';
import { api } from '../api.ts';
import type { Notification } from '../types.ts';
import { dateTimeJa } from '../format.ts';

const NAV = [
  { section: 'メイン' },
  { to: '/', label: 'ダッシュボード', icon: '📊', any: true },
  { to: '/opportunities', label: '案件一覧', icon: '📋', any: true },
  { to: '/health', label: '案件健全性', icon: '🩺', any: true },
  { section: '計画・予測' },
  { to: '/plans', label: '年間受注計画', icon: '🎯', any: true },
  { to: '/snapshots', label: '予測スナップショット', icon: '📸', any: true },
  { section: '管理' },
  { to: '/masters', label: 'マスター管理', icon: '🗂️', roles: ['hq', 'admin'] },
  { to: '/audit', label: '監査ログ', icon: '📜', roles: ['hq', 'admin'] },
  { to: '/users', label: 'ユーザー管理', icon: '👥', roles: ['admin'] },
  { to: '/settings', label: 'システム設定', icon: '⚙️', roles: ['admin'] },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const path = window.location.hash.replace(/^#/, '') || '/';
  const isActive = (to: string) => (to === '/' ? path === '/' : path.startsWith(to));

  const markRead = async () => {
    await api.post('/api/notifications/read').catch(() => {});
    setUnread(0);
    loadNotifs();
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          MIRAI SALES
          <small>営業パイプライン・受注予測管理</small>
        </div>
        <nav>
          {NAV.map((item, i) =>
            'section' in item ? (
              <div key={i} className="section">{item.section}</div>
            ) : 'roles' in item && item.roles && user && !(item.roles as readonly string[]).includes(user.role) ? null : (
              <a key={i} href={`#${item.to}`} className={isActive(item.to) ? 'active' : ''}>
                <span>{item.icon}</span> {item.label}
              </a>
            ),
          )}
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <div />
          <div className="userbox">
            <div className="bell" ref={panelRef} onClick={() => setOpen(!open)}>
              🔔
              {unread > 0 ? <span className="dot">{unread > 99 ? '99+' : unread}</span> : null}
              {open ? (
                <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="flex spread" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                    <b>通知</b>
                    <button className="btn sm" onClick={markRead}>すべて既読</button>
                  </div>
                  {notifs.length === 0 ? <div className="empty">通知はありません</div> : null}
                  {notifs.map((n) => (
                    <a key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`} href={n.link ?? '#'} onClick={() => setOpen(false)}>
                      <div className="t">{n.title}</div>
                      {n.body ? <div className="m">{n.body}</div> : null}
                      <div className="m">{dateTimeJa(n.created_at)}</div>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{user?.display_name}</div>
              <div className="muted small">{user?.org_name}</div>
            </div>
            <button className="btn sm" onClick={logout}>ログアウト</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
