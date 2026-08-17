/** 入力検証スキーマ（zod） — 詳細仕様設計書 §9 入力検証 VAL-01〜07 */
import { z } from 'zod';

export const uuidSchema = z.string().uuid().nullable().optional();

/** 必須ID（uuid） */
export const idRequired = z.string().uuid();

export const loginSchema = z.object({
  email: z.string().email('メールアドレスの形式が不正です').max(255),
  password: z.string().min(1, 'パスワードを入力してください').max(200),
});

export const opportunityBase = {
  name: z.string().trim().min(1, '案件名は必須です').max(200),
  customer_id: uuidSchema,
  public_private_id: uuidSchema,
  region_id: uuidSchema,
  work_type_id: uuidSchema,
  org_id: z.string().uuid('主管組織は必須です'),
  owner_id: z.string().uuid('主担当は必須です'),
  co_owner_ids: z.array(z.string().uuid()).max(20).optional(),
  stage_id: z.string().uuid('案件段階は必須です'),
  probability_id: z.string().uuid('確度は必須です'),
  expected_amount: z.coerce.number({ message: '予定受注額は数値です' }).min(0, '予定受注額は0以上').max(1e15),
  expected_gross_profit: z.coerce.number().min(0).max(1e15).nullable().optional(),
  expected_order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '受注予定日はYYYY-MM-DD形式').nullable().optional(),
  next_action: z.string().trim().max(500).nullable().optional(),
  next_action_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  confidentiality_id: z.string().uuid('機密区分は必須です'),
  status: z.enum(['in_progress', 'won', 'lost', 'hold', 'cancelled']).optional(),
  loss_reason_id: uuidSchema,
  loss_note: z.string().trim().max(1000).nullable().optional(),
  one_drive_url: z.union([z.string().url('OneDriveリンクの形式が不正です').max(2000), z.literal(''), z.null()]).optional(),
  direct_cloud_url: z.union([z.string().url('DirectCloudリンクの形式が不正です').max(2000), z.literal(''), z.null()]).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  reason: z.string().trim().max(1000).optional(), // 変更理由（監査用）
};

export const opportunityCreateSchema = z.object({
  ...opportunityBase,
  // 登録時の確度変更理由は不要（初期値）
});

export const opportunityUpdateSchema = z.object({
  ...opportunityBase,
  expected_gross_profit: z.coerce.number().min(0).max(1e15).nullable().optional(),
}).partial().refine((v) => Object.keys(v).length > 0, { message: '更新項目がありません' });

export const planSchema = z.object({
  fiscal_year: z.coerce.number().int().min(2000).max(2100),
  org_id: z.string().uuid(),
  public_private_id: uuidSchema,
  region_id: uuidSchema,
  work_type_id: uuidSchema,
  target_amount: z.coerce.number().min(0).max(1e15),
  target_gross_profit: z.coerce.number().min(0).max(1e15).nullable().optional(),
  status: z.enum(['draft', 'approved']).optional(),
});

export const actionSchema = z.object({
  action_type_id: uuidSchema,
  title: z.string().trim().max(200).optional(),
  scheduled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/).nullable().optional(),
  done_at: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/).nullable().optional(),
  is_done: z.boolean().optional(),
  owner_id: uuidSchema,
  result: z.string().trim().max(5000).nullable().optional(),
  next_action: z.string().trim().max(500).nullable().optional(),
  next_action_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const docLinkSchema = z.object({
  doc_type: z.enum(['working', 'final']),
  provider: z.enum(['onedrive', 'directcloud', 'other']).default('other'),
  url: z.union([z.string().url('URLの形式が不正です').max(2000), z.literal('')]).refine((v) => v !== '', { message: 'URLは必須です' }),
  title: z.string().trim().max(200).optional(),
  version: z.string().trim().max(50).optional(),
  confirmed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const customerSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1, '名称は必須です').max(200),
  kind: z.enum(['customer', 'issuer', 'both']).default('both'),
  region_id: uuidSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const masterSchema = z.object({
  mtype: z.enum(['region', 'work_type', 'stage', 'probability', 'loss_reason', 'confidentiality', 'action_type', 'public_private']),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1, '名称は必須です').max(100),
  sort_order: z.coerce.number().int().default(0),
  weight: z.coerce.number().min(0).max(1).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const userCreateSchema = z.object({
  email: z.string().email().max(255),
  display_name: z.string().trim().min(1).max(100),
  role: z.enum(['admin', 'hq', 'manager', 'sales', 'viewer']),
  org_id: z.string().uuid(),
  password: z.string().min(8, 'パスワードは8文字以上').max(200),
});

export const userUpdateSchema = z.object({
  display_name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['admin', 'hq', 'manager', 'sales', 'viewer']).optional(),
  org_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export const settingsSchema = z.record(z.string(), z.any());
