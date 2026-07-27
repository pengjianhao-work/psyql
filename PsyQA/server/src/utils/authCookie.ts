import { Response, Request } from 'express';

export const AUTH_COOKIE_NAME = 'psyqa_session';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setAuthCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/'
  });
}

export function clearAuthCookie(res: Response): void {
  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/', secure, sameSite: 'lax' });
}

export function getTokenFromRequest(req: Request): string | undefined {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return undefined;
  return header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
}
