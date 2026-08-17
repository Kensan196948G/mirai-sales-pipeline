/** ハッシュルーター（Open Design プロトタイプのハッシュナビゲーションを React 化） */
import { useEffect, useState } from 'react';

export const ROUTE_META: Record<string, { crumb: string; title: string; nav: string }> = {
  '/': { crumb: '営業パイプライン管理', title: '営業ダッシュボード', nav: 'dashboard' },
  '/opportunities': { crumb: '案件管理', title: '案件一覧', nav: 'opportunities' },
  '/health': { crumb: '案件管理', title: '案件健全性', nav: 'health' },
  '/plans': { crumb: '計画・予測', title: '年間受注計画', nav: 'plans' },
  '/snapshots': { crumb: '計画・予測', title: '予測スナップショット', nav: 'snapshots' },
  '/masters': { crumb: '管理', title: 'マスター管理', nav: 'admin-masters' },
  '/users': { crumb: '管理', title: 'ユーザー管理', nav: 'admin-users' },
  '/audit': { crumb: '管理', title: '監査ログ', nav: 'admin-audit' },
  '/settings': { crumb: '管理', title: 'システム設定', nav: 'admin-settings' },
};

/** /opportunities/:code と /opportunities/:code/edit を識別する */
export interface Route {
  key: string; // 正規化キー（メタ解決用）
  raw: string; // 生パス
  code?: string; // 案件コード（詳細/編集時）
  isEdit: boolean;
}

export function parseRoute(path: string): Route {
  const raw = path === '' ? '/' : path;
  const m = raw.match(/^\/opportunities\/([^/]+)\/edit$/);
  if (m) return { key: '/opportunities/edit', raw, code: m[1], isEdit: true };
  const d = raw.match(/^\/opportunities\/([^/]+)$/);
  if (d) return { key: '/opportunities/detail', raw, code: d[1], isEdit: false };
  if (raw === '/opportunities/new') return { key: '/opportunities/new', raw, isEdit: false };
  return { key: raw, raw, isEdit: false };
}

export function useHashRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash.replace(/^#/, '') || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseRoute(hash);
}

export function navigate(path: string) {
  if (window.location.hash !== '#' + path) window.location.hash = '#' + path;
  else window.scrollTo(0, 0);
}
