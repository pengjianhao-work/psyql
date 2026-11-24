import crypto from 'crypto';

import { getDb } from '../../db/database';

const getSecret = (): string => process.env.AUTH_SECRET || 'psyqa-dev-secret-change-me';

const TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 3 * 24 * 60 * 60 * 1000);

interface TokenPayload {
  sub: string;
  exp: number;
  jti?: string;
}

export function createSessionToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const data: TokenPayload = { sub: userId, exp, jti: crypto.randomBytes(12).toString('base64url') };
  const payload = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function assertAuthSecretConfigured(): void {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.AUTH_SECRET || '';
    if (secret.length < 16) {
      throw new Error('生产环境必须设置 AUTH_SECRET（至少 16 字符）');
    }
  }
}

function parseToken(token: string | undefined): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
  const dot = trimmed.indexOf('.');
  if (dot < 0) return null;
  const payload = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    if (!data.sub || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function isSessionRevoked(jti: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM revoked_sessions WHERE jti = ?').get(jti);
  return row != null;
}

/** 撤销指定会话：logout 时调用。无 jti 的旧 token 无法单独撤销，随 exp 过期。 */
export function revokeSessionToken(token: string | undefined): void {
  const data = parseToken(token);
  if (!data?.jti) return;
  getDb()
    .prepare('INSERT OR IGNORE INTO revoked_sessions (jti, expires_at) VALUES (?, ?)')
    .run(data.jti, data.exp);
  getDb().prepare('DELETE FROM revoked_sessions WHERE expires_at < ?').run(Date.now());
}

export function verifySessionToken(token: string | undefined): string | null {
  const data = parseToken(token);
  if (!data) return null;
  if (data.jti && isSessionRevoked(data.jti)) return null;
  return data.sub;
}
