/**
 * Neon PostgreSQL HTTP SQL クライアント（ドライバ不要・Workers対応）
 *
 * POST https://<host>/sql へ `Neon-Connection-String` ヘッダーで接続する。
 * 詳細: https://neon.tech/docs/serverless/serverless-driver
 */
export interface SqlRow {
  [key: string]: unknown;
}

export interface SqlResult {
  rows: SqlRow[];
  rowCount: number;
  command: string;
}

export interface QueryParam {
  [key: string]: unknown;
}

/** パラメータ値の型変換（Date → ISO文字列など） */
function normalizeParam(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

export class NeonHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class NeonClient {
  private connectionString: string;
  private host: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    const m = /@([^/]+)\//.exec(connectionString);
    if (!m?.[1]) throw new Error('DATABASE_URL の形式が不正です');
    this.host = m[1];
  }

  async request(body: unknown, fetchImpl: typeof fetch = fetch): Promise<any> {
    const res = await fetchImpl(`https://${this.host}/sql`, {
      method: 'POST',
      headers: {
        'Neon-Connection-String': this.connectionString,
        'Content-Type': 'application/json',
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new NeonHttpError(res.status, json?.message || `Neon SQL error (${res.status}): ${text.slice(0, 300)}`);
    }
    return json;
  }

  /** 単一クエリ実行。params は $1, $2... にバインド */
  async query(sql: string, params: unknown[] = []): Promise<SqlResult> {
    const res = await this.request({ query: sql, params: params.map(normalizeParam) });
    return { rows: res?.rows ?? [], rowCount: res?.rowCount ?? 0, command: res?.command ?? '' };
  }

  /** 単一行取得（0/1行）。複数行時は先頭 */
  async queryOne<T = SqlRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const res = await this.query(sql, params);
    return (res.rows[0] as T) ?? null;
  }

  /** 複数ステートメントを単一トランザクションで実行（migration 等） */
  async transaction(statements: { sql: string; params?: unknown[] }[]): Promise<SqlResult[]> {
    const body = statements.map((s) => ({ query: s.sql, params: (s.params ?? []).map(normalizeParam) }));
    const res = await this.request(body);
    return (res ?? []).map((r: any) => ({ rows: r?.rows ?? [], rowCount: r?.rowCount ?? 0, command: r?.command ?? '' }));
  }
}
