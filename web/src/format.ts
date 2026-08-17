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

/** 値と単位を分離（新デザインの「60.0 億」表記用） */
export function yenUnit(n: number | null | undefined): { value: string; unit: string } {
  if (n == null) return { value: '-', unit: '' };
  const abs = Math.abs(n);
  if (abs >= 1_0000_0000) return { value: (n / 1_0000_0000).toFixed(1), unit: '億' };
  if (abs >= 1_0000) return { value: (n / 1_0000).toFixed(0), unit: '万' };
  return { value: new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(n), unit: '円' };
}

/** 受注予定月 YYYYMM → 「9月」表記 */
export function ymLabel(ym: string | number | null | undefined): string {
  if (ym == null) return '-';
  const s = String(ym);
  const m = Number(s.slice(-2));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? `${m}月` : s;
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
