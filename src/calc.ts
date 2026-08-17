/**
 * 集計・計算仕様（詳細仕様設計書 §7 CALC-01〜07）
 */

/** CALC-01: 予定粗利率（%） — 予定受注額0の場合は null */
export function calcGrossMarginRate(amount: number | null, grossProfit: number | null): number | null {
  if (amount == null || grossProfit == null || amount <= 0) return null;
  return Math.round((grossProfit / amount) * 10000) / 100;
}

/** CALC-02: 単純積上げ見込 = Σ予定受注額（進行中/保留のみ対象） */
export function calcSimpleForecast(amounts: (number | null)[]): number {
  return amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0);
}

/** CALC-03: 加重見込 = Σ(予定受注額 × 確度重み) */
export function calcWeightedForecast(items: { amount: number | null; weight: number | null }[]): number {
  return items.reduce((sum, it) => sum + (it.amount ?? 0) * (it.weight ?? 0), 0);
}

/** CALC-04: 計画差異 = 見込額 − 目標受注額 */
export function calcPlanVariance(forecast: number, target: number): number {
  return forecast - target;
}

/** CALC-05: 計画達成見込率（%） — 目標0の場合は null */
export function calcAchievementRate(forecast: number, target: number): number | null {
  if (!target) return null;
  return Math.round((forecast / target) * 10000) / 100;
}

/** CALC-06: 未更新日数 = 基準日 − 最終更新日 */
export function calcDaysSince(lastUpdated: string | Date | null, base: Date = new Date()): number | null {
  if (!lastUpdated) return null;
  const t = typeof lastUpdated === 'string' ? new Date(lastUpdated) : lastUpdated;
  const days = Math.floor((base.getTime() - t.getTime()) / 86400_000);
  return Math.max(0, days);
}

/** CALC-07: 次回行動遅延日数（期限超過時のみ正値。未設定は null） */
export function calcActionDelay(due: string | Date | null, base: Date = new Date()): number | null {
  if (!due) return null;
  const t = typeof due === 'string' ? new Date(due) : due;
  const days = Math.ceil((t.getTime() - base.getTime()) / 86400_000);
  return days < 0 ? -days : null; // 遅延日数（正）
}

/** 受注予定月（YYYYMM） */
export function toYearMonth(d: string | Date | null): number | null {
  if (!d) return null;
  const t = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return null;
  return t.getFullYear() * 100 + (t.getMonth() + 1);
}

/** 円表示フォーマット */
export function formatYen(n: number | null | undefined): string {
  if (n == null) return '-';
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(n);
}
