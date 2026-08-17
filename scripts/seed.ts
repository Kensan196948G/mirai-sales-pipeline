/**
 * シードスクリプト（開発・デモ用データ）
 *   node --import tsx scripts/seed.ts [--demo-opportunities]
 * ユーザー/顧客/サンプル案件/受注計画を投入する（冪等）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NeonClient } from '../src/db/client.ts';
import { hashPassword } from '../src/auth.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withOpps = process.argv.includes('--demo-opportunities');

function loadEnv(): Record<string, string> {
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) {
    console.error('.env が見つかりません');
    process.exit(1);
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2];
  }
  return out;
}

/**
 * デモユーザーの初期パスワード。
 * - 環境変数 SEED_DEMO_PASSWORD が設定されていればそれを使用する（推奨）。
 * - 未設定で NODE_ENV が production の場合は失敗させる（デフォルト固定パスワードの本番投入を防ぐ）。
 * - ローカル開発時のみ固定デフォルトにフォールバックする。
 */
function demoPassword(env: Record<string, string>): string {
  const fromEnv = env.SEED_DEMO_PASSWORD;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production') {
    console.error('本番環境では SEED_DEMO_PASSWORD を設定してください（デモパスワードの固定投入を防止）');
    process.exit(1);
  }
  return 'Mirai#2026'; // ローカル開発用デフォルト。本番では使用しないこと
}

async function mid(db: NeonClient, mtype: string, code: string): Promise<string | null> {
  const r = await db.queryOne<{ id: string }>('SELECT id FROM masters WHERE mtype=$1 AND code=$2', [mtype, code]);
  return r?.id ?? null;
}

async function main() {
  const env = loadEnv();
  const db = new NeonClient(env.DATABASE_URL!);
  const DEMO_PASSWORD = demoPassword(env);

  // ---- ユーザー ----
  const users: { email: string; name: string; role: string; org: string }[] = [
    { email: 'admin@mirai.local', name: 'システム管理者', role: 'admin', org: 'HQ' },
    { email: 'hq@mirai.local', name: '営業本部 部長', role: 'hq', org: 'HQ' },
    { email: 'manager1@mirai.local', name: '第一営業部 部長', role: 'manager', org: 'D1' },
    { email: 'sales1@mirai.local', name: '第一営業部 担当A', role: 'sales', org: 'D1' },
    { email: 'sales2@mirai.local', name: '第二営業部 担当B', role: 'sales', org: 'D2' },
    { email: 'viewer@mirai.local', name: '経営企画 参照者', role: 'viewer', org: 'HQ' },
  ];
  const hash = await hashPassword(DEMO_PASSWORD);
  const userIds: Record<string, string> = {};
  for (const u of users) {
    const org = await db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE code=$1', [u.org]);
    if (!org) throw new Error(`組織 ${u.org} がありません`);
    const existing = await db.queryOne<{ id: string }>('SELECT id FROM users WHERE email=$1', [u.email]);
    if (existing) {
      userIds[u.email] = existing.id;
      console.log(`user    ${u.email} (exists)`);
      continue;
    }
    const ins = await db.query(
      `INSERT INTO users (email, display_name, password_hash, role, org_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [u.email, u.name, hash, u.role, org.id],
    );
    userIds[u.email] = String(ins.rows[0]!.id);
    console.log(`user    ${u.email}`);
  }

  // ---- 顧客・発注者 ----
  const customers: [string, string, string, string][] = [
    ['C-0001', '国土交通省 関東地方整備局', 'issuer', 'KANTO'],
    ['C-0002', '東京都 都市整備局', 'issuer', 'KANTO'],
    ['C-0003', '大阪府 都市整備部', 'issuer', 'KINKI'],
    ['C-0004', '株式会社 みらい建設', 'customer', 'KANTO'],
    ['C-0005', '株式会社 東京インフラ開発', 'customer', 'KANTO'],
    ['C-0006', '一般社団法人 日本橋再生機構', 'customer', 'KANTO'],
    ['C-0007', '北海道開発局', 'issuer', 'HOKKAIDO'],
    ['C-0008', '株式会社 関西エンジニアリング', 'customer', 'KINKI'],
  ];
  for (const [code, name, kind, region] of customers) {
    const regionId = await mid(db, 'region', region);
    await db.query(
      `INSERT INTO customers (code, name, kind, region_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind, region_id=EXCLUDED.region_id`,
      [code, name, kind, regionId],
    );
  }
  console.log(`customer ${customers.length} 件`);

  // ---- サンプル案件 ----
  if (withOpps) {
    const org = async (c: string) => (await db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE code=$1', [c]))!.id;
    const cust = async (c: string) => (await db.queryOne<{ id: string }>('SELECT id FROM customers WHERE code=$1', [c]))!.id;

    const orgD1 = await org('D1');
    const orgD2 = await org('D2');
    const orgB1 = await org('B1');
    const orgB2 = await org('B2');

    const daysFromNow = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
    const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);

    const opps: Record<string, unknown>[] = [
      // 進行中: 高確度・大規模
      { opp_code: 'OPP-0001001', name: '関東圏 河川改修工事（R8年度）', customer: 'C-0001', pp: 'PUBLIC', region: 'KANTO', wt: 'CIVIL', org: orgD1, owner: 'sales1@mirai.local', stage: 'AWAITING', prob: 'P90', amount: 1200000000, gp: 96000000, order: daysFromNow(30), next: '開札結果の確認・担当者ヒアリング', nextDue: daysFromNow(7), conf: 'C1', lastUpdate: 3 },
      { opp_code: 'OPP-0001002', name: '東京都 橋梁補修設計業務', customer: 'C-0002', pp: 'PUBLIC', region: 'KANTO', wt: 'DESIGN', org: orgD1, owner: 'sales1@mirai.local', stage: 'BID', prob: 'P70', amount: 85000000, gp: 17000000, order: daysFromNow(45), next: '入札書類提出（見積最終調整）', nextDue: daysFromNow(3), conf: 'C1', lastUpdate: 5 },
      { opp_code: 'OPP-0001003', name: 'みらい建設 本社ビル設備更新', customer: 'C-0004', pp: 'PRIVATE', region: 'KANTO', wt: 'EQUIP', org: orgD1, owner: 'manager1@mirai.local', stage: 'PROPOSAL', prob: 'P50', amount: 450000000, gp: 54000000, order: daysFromNow(60), next: '提案書第2版提出・技術打合せ', nextDue: daysFromNow(10), conf: 'C2', lastUpdate: 6 },
      { opp_code: 'OPP-0001004', name: '東京インフラ開発 マンション新築（設備）', customer: 'C-0005', pp: 'PRIVATE', region: 'KANTO', wt: 'EQUIP', org: orgD1, owner: 'sales1@mirai.local', stage: 'FORECAST', prob: 'P30', amount: 600000000, gp: 60000000, order: daysFromNow(120), next: '施主との打合せ日程調整', nextDue: daysFromNow(14), conf: 'C1', lastUpdate: 12 },
      // 停滞・未更新サンプル
      { opp_code: 'OPP-0001005', name: '日本橋再生機構 街路整備事業', customer: 'C-0006', pp: 'PRIVATE', region: 'KANTO', wt: 'CIVIL', org: orgD1, owner: 'manager1@mirai.local', stage: 'PROPOSAL', prob: 'P50', amount: 300000000, gp: 30000000, order: daysFromNow(90), next: '追加資料の提出', nextDue: daysAgo(5), conf: 'C1', lastUpdate: 45 },
      { opp_code: 'OPP-0001006', name: '北海道 道路維持管理業務', customer: 'C-0007', pp: 'PUBLIC', region: 'HOKKAIDO', wt: 'MAINT', org: orgB1, owner: 'sales2@mirai.local', stage: 'INQUIRY', prob: 'P10', amount: 150000000, gp: 15000000, order: daysFromNow(200), next: null, nextDue: null, conf: 'C1', lastUpdate: 60 },
      // 第二営業部・大阪
      { opp_code: 'OPP-0002001', name: '大阪府 河川護岸改修工事', customer: 'C-0003', pp: 'PUBLIC', region: 'KINKI', wt: 'CIVIL', org: orgD2, owner: 'sales2@mirai.local', stage: 'AWAITING', prob: 'P90', amount: 980000000, gp: 78400000, order: daysFromNow(20), next: '落札候補確認・契約手続', nextDue: daysFromNow(5), conf: 'C1', lastUpdate: 2 },
      { opp_code: 'OPP-0002002', name: '関西エンジニアリング 工場増築（建築）', customer: 'C-0008', pp: 'PRIVATE', region: 'KINKI', wt: 'ARCH', org: orgD2, owner: 'sales2@mirai.local', stage: 'ANNOUNCE', prob: 'P30', amount: 720000000, gp: 72000000, order: daysFromNow(150), next: '公告内容の確認・参加意思確認', nextDue: daysFromNow(20), conf: 'C1', lastUpdate: 8 },
      { opp_code: 'OPP-0002003', name: '大阪府 橋梁点検業務（R8）', customer: 'C-0003', pp: 'PUBLIC', region: 'KINKI', wt: 'SURVEY', org: orgD2, owner: 'manager1@mirai.local', stage: 'PROPOSAL', prob: 'P50', amount: 120000000, gp: 24000000, order: daysFromNow(75), next: '技術提案書作成', nextDue: daysFromNow(9), conf: 'C2', lastUpdate: 4 },
      // 重複候補ペア（同一発注者・類似案件名）
      { opp_code: 'OPP-0002004', name: '九州圏 港湾改良工事（第一工区）', customer: 'C-0001', pp: 'PUBLIC', region: 'KYUSHU', wt: 'CIVIL', org: orgD2, owner: 'sales2@mirai.local', stage: 'FORECAST', prob: 'P30', amount: 2000000000, gp: 160000000, order: daysFromNow(100), next: '発注予定時期の確認', nextDue: daysFromNow(15), conf: 'C1', lastUpdate: 10 },
      { opp_code: 'OPP-0002005', name: '九州圏 港湾改良工事（第二工区）', customer: 'C-0001', pp: 'PUBLIC', region: 'KYUSHU', wt: 'CIVIL', org: orgD2, owner: 'sales2@mirai.local', stage: 'FORECAST', prob: 'P30', amount: 1900000000, gp: 152000000, order: daysFromNow(105), next: '発注予定時期の確認', nextDue: daysFromNow(15), conf: 'C1', lastUpdate: 12 },
      // 受注・失注・保留
      { opp_code: 'OPP-0003001', name: '東京支店 事務所耐震改修工事', customer: 'C-0005', pp: 'PRIVATE', region: 'KANTO', wt: 'ARCH', org: orgB1, owner: 'manager1@mirai.local', stage: 'AWAITING', prob: 'P100', amount: 280000000, gp: 33600000, order: daysAgo(10), next: '着工前協議', nextDue: daysFromNow(30), conf: 'C1', lastUpdate: 2, status: 'won', wonAt: daysAgo(12) },
      { opp_code: 'OPP-0003002', name: '大阪支店 老朽管更新工事（入札）', customer: 'C-0003', pp: 'PUBLIC', region: 'KINKI', wt: 'CIVIL', org: orgB2, owner: 'sales2@mirai.local', stage: 'BID', prob: 'P70', amount: 500000000, gp: 40000000, order: daysAgo(40), next: null, nextDue: null, conf: 'C1', lastUpdate: 70, status: 'lost', lostAt: daysAgo(40), lossReason: 'PRICE' },
      { opp_code: 'OPP-0003003', name: '東北 ダム補修調査業務', customer: 'C-0007', pp: 'PUBLIC', region: 'TOHOKU', wt: 'SURVEY', org: orgB2, owner: 'sales2@mirai.local', stage: 'INQUIRY', prob: 'P30', amount: 90000000, gp: 18000000, order: daysFromNow(180), next: '予算確定待ち', nextDue: daysFromNow(60), conf: 'C1', lastUpdate: 7, status: 'hold' },
    ];

    let created = 0;
    for (const o of opps) {
      const exists = await db.queryOne('SELECT id FROM opportunities WHERE opp_code=$1', [o.opp_code]);
      if (exists) continue;
      const custId = o.customer ? await cust(String(o.customer)) : null;
      const ownerId = userIds[String(o.owner)]!;
      const lossId = o.lossReason ? await mid(db, 'loss_reason', String(o.lossReason)) : null;
      const lastUpdate = new Date(Date.now() - Number(o.lastUpdate) * 86400_000).toISOString();
      const amount = Number(o.amount);
      const gp = o.gp != null ? Number(o.gp) : null;
      const gpRate = gp != null && amount > 0 ? Math.round((gp / amount) * 10000) / 100 : null;
      await db.query(
        `INSERT INTO opportunities
         (opp_code, name, customer_id, public_private_id, region_id, work_type_id, org_id, owner_id,
          stage_id, probability_id, expected_amount, expected_gross_profit, gross_margin_rate,
          expected_order_date, next_action, next_action_due, status, confidentiality_id, loss_reason_id,
          won_at, lost_at, last_updated_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          o.opp_code, o.name, custId, o.pp ? await mid(db, 'public_private', String(o.pp)) : null,
          o.region ? await mid(db, 'region', String(o.region)) : null,
          o.wt ? await mid(db, 'work_type', String(o.wt)) : null,
          o.org, ownerId, o.stage ? await mid(db, 'stage', String(o.stage)) : null,
          o.prob ? await mid(db, 'probability', String(o.prob)) : null,
          amount, gp, gpRate, o.order, o.next, o.nextDue, o.status ?? 'in_progress',
          o.conf ? await mid(db, 'confidentiality', String(o.conf)) : null,
          lossId, o.wonAt ?? null, o.lostAt ?? null, lastUpdate, userIds['admin@mirai.local'],
        ],
      );
      created++;
    }
    console.log(`opportunity ${created} 件作成（既存スキップ）`);
    // デモデータのコードと採番が衝突しないようシーケンスを進める
    await db.query(`SELECT setval('opp_code_seq', GREATEST((SELECT COALESCE(MAX(regexp_replace(opp_code, 'OPP-', '')::bigint), 0) FROM opportunities) + 1, 5000), true)`);
  }

  // ---- 年間受注計画（FY2026）----
  const fy = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const plans = [
    ['HQ', 8000000000, 800000000],
    ['D1', 4000000000, 420000000],
    ['D2', 3000000000, 300000000],
    ['B1', 600000000, 60000000],
    ['B2', 400000000, 40000000],
  ];
  for (const [orgCode, target, gp] of plans) {
    const orgRow = await db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE code=$1', [orgCode]);
    const exists = await db.queryOne('SELECT id FROM sales_plans WHERE fiscal_year=$1 AND org_id=$2 AND revision=1', [fy, orgRow!.id]);
    if (exists) continue;
    await db.query(
      `INSERT INTO sales_plans (fiscal_year, org_id, target_amount, target_gross_profit, status, created_by)
       VALUES ($1,$2,$3,$4,'approved',$5)`,
      [fy, orgRow!.id, target, gp, userIds['admin@mirai.local']],
    );
  }
  console.log(`sales_plan FY${fy} 投入完了`);

  console.log('seed 完了。デモログイン: admin@mirai.local / ' + DEMO_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
