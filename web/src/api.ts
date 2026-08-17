/** API クライアント（Same-Origin Cookie 認証） */
export interface ApiError {
  error: { code: string; message: string };
}

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = (await res.json()) as T | ApiError;
    if (!res.ok) {
      const err = (body as ApiError).error;
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('msp:unauthorized'));
      }
      throw new HttpError(res.status, err?.code ?? 'ERROR', err?.message ?? 'エラーが発生しました');
    }
    return body as T;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(res.status, 'ERROR', text || 'エラーが発生しました');
  }
  return res as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function downloadCsv(path: string) {
  // Same-Origin のため直接遷移で Cookie が付与される
  window.location.href = path;
}
