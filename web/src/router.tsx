/** 簡易ハッシュルーター */
import { useEffect, useState, type ComponentType } from 'react';

export interface Route {
  pattern: RegExp;
  page: ComponentType<{ params: Record<string, string> }>;
}

export function useHashRoute(routes: Route[]): { page: ComponentType<{ params: Record<string, string> }>; params: Record<string, string> } | null {
  const [hash, setHash] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const path = hash.replace(/^#/, '') || '/';
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) {
      return { page: r.page, params: (m.groups ?? {}) as Record<string, string> };
    }
  }
  return null;
}

export function navigate(path: string) {
  window.location.hash = `#${path}`;
}
