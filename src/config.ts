/**
 * 定数・設定
 */
export const APP_NAME = 'mirai-sales-pipeline';
export const APP_DISPLAY_NAME = '営業パイプライン・受注予測管理';

export const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  sales: 2,
  manager: 3,
  hq: 4,
  admin: 5,
};

/** 案件状態 */
export const OPP_STATUSES = ['in_progress', 'won', 'lost', 'hold', 'cancelled'] as const;
export type OppStatus = (typeof OPP_STATUSES)[number];

export const OPP_STATUS_LABEL: Record<string, string> = {
  in_progress: '進行中',
  won: '受注',
  lost: '失注',
  hold: '保留',
  cancelled: '取消',
};

/** 監査対象フィールド（重要変更） */
export const AUDIT_TRACKED_FIELDS = [
  'name',
  'stage_id',
  'probability_id',
  'expected_amount',
  'expected_gross_profit',
  'gross_margin_rate',
  'owner_id',
  'org_id',
  'status',
  'customer_id',
  'expected_order_date',
  'confidentiality_id',
  'loss_reason_id',
  'loss_note',
] as const;

export const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const;
