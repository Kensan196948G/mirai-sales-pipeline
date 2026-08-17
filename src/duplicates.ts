/**
 * 重複案件候補判定（詳細仕様設計書 §10.1）
 *
 * 判定は「削除」ではなく候補提示。最終判断は人が行う。
 * 照合要素: 顧客/発注者コード一致(加点大)、案件名の正規化後類似、
 *          地域・工種一致、受注予定時期の近接。
 * スコア 0〜1。しきい値(DUPLICATE_THRESHOLD, 初期0.6)以上を候補とする。
 */

export interface DuplicateInput {
  customerCode: string | null;
  customerName: string | null;
  name: string;
  regionId: string | null;
  workTypeId: string | null;
  expectedOrderDate: string | null;
}

export interface DuplicateScore {
  score: number;
  matched: string[];
}

/** 案件名の正規化（表記揺れ・区切り文字・英数字正規化） */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    // 括弧類（全角・半角・亀甲）の内容を除去
    .replace(/[（(【[].*?[)）】\]]/g, '')
    .replace(/[／/・\s\u3000-]/g, '')
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[ぁ-ん]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60)); // ひらがな→カタカナ
}

/** 2文字以上の共通部分文字列に基づく類似度（CJK向け） */
export function cjkSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const short = na.length <= nb.length ? na : nb;
  const long = na.length <= nb.length ? nb : na;
  if (short.length < 2) return 0;
  // 共通連続部分文字列の最大長
  let best = 0;
  for (let len = short.length; len >= 2 && best === 0; len--) {
    for (let i = 0; i + len <= short.length; i++) {
      if (long.includes(short.slice(i, i + len))) {
        best = len;
        break;
      }
    }
  }
  // 文字単位の一致率（順序無視）
  const setA = new Set(short.split(''));
  const setB = new Set(long.split(''));
  let inter = 0;
  for (const ch of setA) if (setB.has(ch)) inter++;
  const charSim = inter / Math.max(setA.size, setB.size, 1);
  return Math.max(best / Math.max(short.length, 1), charSim * 0.7);
}

/** 日付の近接度（±30日以内を加点） */
function dateProximity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
  const diff = Math.abs(ta - tb) / 86400_000;
  if (diff <= 30) return 1 - diff / 60;
  return 0;
}

/**
 * 2案件の重複スコア算出。
 * 重み: 顧客コード一致 0.35 / 顧客名一致 0.25 / 案件名類似 0.25 / 地域 0.05 / 工種 0.05 / 時期 0.05
 */
export function scoreDuplicates(a: DuplicateInput, b: DuplicateInput): DuplicateScore {
  const matched: string[] = [];
  let score = 0;

  if (a.customerCode && b.customerCode && a.customerCode === b.customerCode) {
    score += 0.35;
    matched.push('customer_code');
  } else if (a.customerName && b.customerName && normalizeName(a.customerName) === normalizeName(b.customerName)) {
    score += 0.25;
    matched.push('customer_name');
  }

  const nameSim = cjkSimilarity(a.name, b.name);
  if (nameSim >= 0.85) {
    score += 0.25;
    matched.push(`name:${Math.round(nameSim * 100)}`);
  } else if (nameSim >= 0.5) {
    score += 0.15;
    matched.push(`name:${Math.round(nameSim * 100)}`);
  }

  if (a.regionId && b.regionId && a.regionId === b.regionId) {
    score += 0.05;
    matched.push('region');
  }
  if (a.workTypeId && b.workTypeId && a.workTypeId === b.workTypeId) {
    score += 0.05;
    matched.push('work_type');
  }
  const prox = dateProximity(a.expectedOrderDate, b.expectedOrderDate);
  if (prox > 0) {
    score += prox * 0.05;
    matched.push('order_date');
  }

  return { score: Math.round(Math.min(1, score) * 100) / 100, matched };
}

/** 閾値判定 */
export function isDuplicateCandidate(input: DuplicateScore, threshold = 0.6): boolean {
  return input.score >= threshold;
}
