import crypto from 'crypto';

const getSecret = (): string => process.env.AUTH_SECRET || 'psyqa-dev-secret-change-me';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSessionToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp }), 'utf8').toString('base64url');
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

export function verifySessionToken(token: string | undefined): string | null {
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
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string; exp: number };
    if (!data.sub || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data.sub;
  } catch {
    return null;
  }
}
