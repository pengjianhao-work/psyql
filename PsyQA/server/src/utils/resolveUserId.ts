import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { env } from '../config/env';

const GUEST_USER_PATTERN = /^user\d+$/;

export function normalizeUserId(raw: unknown): string {
  const userId = String(raw || 'default_user').trim();
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return safe.slice(0, 64) || 'default_user';
}

export function isGuestApiAllowed(): boolean {
  return env.allowGuest;
}

export function isGuestUserId(userId: string): boolean {
  return GUEST_USER_PATTERN.test(userId);
}

/** Resolve effective user id; returns null if forbidden */
export function resolveUserId(req: AuthRequest, res: Response, raw?: unknown): string | null {
  const requested = normalizeUserId(raw ?? req.body?.userId ?? req.query?.userId);

  if (req.authUser?.role === 'student') {
    if (requested !== req.authUser.id) {
      res.status(403).json({ error: '无权访问其他用户数据' });
      return null;
    }
    return req.authUser.id;
  }

  if (req.authUser) {
    return requested;
  }

  if (isGuestApiAllowed() && isGuestUserId(requested)) {
    return requested;
  }

  res.status(401).json({ error: '未登录或登录已过期' });
  return null;
}

export function resolveStudentUserId(req: AuthRequest, res: Response, raw?: unknown): string | null {
  if (!req.authUser) {
    if (isGuestApiAllowed()) {
      const requested = normalizeUserId(raw ?? req.body?.userId ?? req.query?.userId);
      if (isGuestUserId(requested)) return requested;
    }
    res.status(401).json({ error: '未登录或登录已过期' });
    return null;
  }
  if (req.authUser.role !== 'student') {
    res.status(403).json({ error: '仅学生账号可使用该功能' });
    return null;
  }
  return resolveUserId(req, res, req.authUser.id);
}
