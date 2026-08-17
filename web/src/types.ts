/** 型定義（API レスポンス対応） */

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'hq' | 'manager' | 'sales' | 'viewer';
  org_id: string;
  org_code: string;
  org_name: string;
  org_type: string;
}

export interface Master {
  id: string;
  mtype: string;
  code: string;
  name: string;
  sort_order: number;
  weight: number | null;
  is_active: boolean;
  meta?: Record<string, unknown>;
}

export interface Organization {
  id: string;
  code: string;
  name: string;
  org_type: string;
  parent_id: string | null;
}

export interface Meta {
  masters: Record<string, Master[]>;
  organizations: Organization[];
  users: { id: string; email: string; display_name: string; role: string; org_id: string; org_code: string; org_name: string }[];
}

export interface Opportunity {
  id: string;
  opp_code: string;
  name: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  public_private_id: string | null;
  public_private_name: string | null;
  region_id: string | null;
  region_name: string | null;
  work_type_id: string | null;
  work_type_name: string | null;
  org_id: string;
  org_code: string;
  org_name: string;
  owner_id: string;
  owner_name: string;
  stage_id: string;
  stage_name: string;
  probability_id: string;
  probability_name: string;
  probability_weight: number | null;
  expected_amount: number;
  expected_gross_profit: number | null;
  gross_margin_rate: number | null;
  expected_order_date: string | null;
  next_action: string | null;
  next_action_due: string | null;
  status: string;
  confidentiality_id: string;
  confidentiality_name: string;
  confidentiality_code: string;
  loss_reason_id: string | null;
  loss_reason_name: string | null;
  loss_note: string | null;
  one_drive_url: string | null;
  direct_cloud_url: string | null;
  notes: string | null;
  version: number;
  last_updated_at: string;
  created_at: string;
  members?: { user_id: string; display_name: string }[];
  actions?: Action[];
  doc_links?: DocLink[];
  audit?: AuditEntry[];
  duplicates?: { id: string; score: number; matched_fields: string[]; status: string; opp_code: string; name: string; other_status: string }[];
}

export interface Action {
  id: string;
  title: string | null;
  action_type_id: string | null;
  action_type_name: string | null;
  scheduled_at: string | null;
  done_at: string | null;
  is_done: boolean;
  owner_id: string | null;
  owner_name: string | null;
  result: string | null;
  next_action: string | null;
  next_action_due: string | null;
}

export interface DocLink {
  id: string;
  doc_type: 'working' | 'final';
  provider: string;
  url: string;
  title: string | null;
  version: string | null;
  confirmed_at: string | null;
}

export interface AuditEntry {
  id: number;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
}

export interface Dashboard {
  fiscal_year: number;
  plan: { target_amount: number; target_gross_profit: number };
  forecast: { simple: number; weighted: number; count: number; variance: number; achievement_rate: number | null };
  pipeline_by_stage: { stage_name: string; cnt: number; amount: number }[];
  pipeline_by_probability: { probability_name: string; weight: number | null; cnt: number; amount: number }[];
  by_month: { ym: string; cnt: number; amount: number }[];
  alerts: { stale: number; overdue: number; duplicates: number; no_action: number };
  upcoming: { opp_code: string; name: string; next_action: string | null; next_action_due: string | null; owner_name: string }[];
}

export interface Notification {
  id: string;
  ntype: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
