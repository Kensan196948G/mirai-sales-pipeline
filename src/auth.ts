/**
 * 認証ユーティリティ
 * - パスワード: PBKDF2(SHA-256, 60,000回) — WebCrypto（Workers/Node 両対応）
 * - セッショントークン: ランダム32バイトを hex、DB には SHA-256 ハッシュを保存
 */
const PBKDF2_ITERATIONS = 60_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    PBKDF2_KEY_BYTES * 8,
  );
  return `pbkdf2:${PBKDF2_ITERATIONS}:${bufToHex(salt.buffer)}:${bufToHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    const alg = parts[0];
    const iterStr = parts[1];
    const saltHex = parts[2];
    const hashHex = parts[3];
    if (alg !== 'pbkdf2' || !iterStr || !saltHex || !hashHex) return false;
    const iterations = parseInt(iterStr, 10);
    const salt = hexToBuf(saltHex) as BufferSource;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, PBKDF2_KEY_BYTES * 8);
    const computed = bufToHex(bits);
    // タイミング攻撃対策: 長さ比較
    if (computed.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bufToHex(bytes.buffer);
}

export async function hashToken(token: string): Promise<string> {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bufToHex(bits);
}

export function generateRandomHex(bytes = 32): string {
  return bufToHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}
