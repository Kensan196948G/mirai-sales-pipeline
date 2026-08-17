/** 表示フォーマットユーティリティ */

export function yen(n: number | null | undefined): string {
  if (n == null) return '-';
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(n) + ' 円';
}

export function yenShort(n: number | null | undefined): string {
  if (n == null) return '-';
  if (Math.abs(n) >= 1_0000_0000) return (n / 1_0000_0000).toFixed(1) + ' 億';
  if (Math.abs(n) >= 1_0000) return (n / 1_0000).toFixed(0) + ' 万';
  return yen(n);
}

export function pct(n: number | null | undefined): string {
  if (n == null) return '-';
  return n.toFixed(1) + '%';
}

export function dateJa(d: string | null | undefined): string {
  if (!d) return '-';
  return d.slice(0, 10);
}

export function dateTimeJa(d: string | null | undefined): string {
  if (!d) return '-';
  return d.replace('T', ' ').slice(0, 16);
}

export const STATUS_LABEL: Record<string, string> = {
  in_progress: '進行中',
  won: '受注',
  lost: '失注',
  hold: '保留',
  cancelled: '取消',
};

export const ROLE_LABEL: Record<string, string> = {
  admin: 'システム管理者',
  hq: '営業本部',
  manager: '営業管理者',
  sales: '営業担当',
  viewer: '参照',
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  working: '作業版',
  final: '正本',
};

export const PROVIDER_LABEL: Record<string, string> = {
  onedrive: 'OneDrive',
  directcloud: 'DirectCloud',
  other: 'その他',
};
