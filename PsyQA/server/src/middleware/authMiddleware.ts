import { Request, Response, NextFunction } from 'express';

import { verifySessionToken } from '../services/sessionService';

import {

  getUserById,

  UserRole,

  PublicAccount,

  Permission,

  getPermissionsForRole

} from '../services/accountService';

import { isGuestApiAllowed, isGuestUserId, normalizeUserId } from '../utils/resolveUserId';

import { getTokenFromRequest } from '../utils/authCookie';



export interface AuthRequest extends Request {

  authUser?: PublicAccount;

}



export async function attachAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {

  const userId = verifySessionToken(getTokenFromRequest(req));

  if (!userId) {

    req.authUser = undefined;

    next();

    return;

  }

  const user = await getUserById(userId);

  req.authUser = user ?? undefined;

  next();

}



export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {

  if (!req.authUser) {

    res.status(401).json({ error: '未登录或登录已过期' });

    return;

  }

  next();

}



export function requireRole(...roles: UserRole[]) {

  return (req: AuthRequest, res: Response, next: NextFunction): void => {

    if (!req.authUser || !roles.includes(req.authUser.role)) {

      res.status(403).json({ error: '无权限访问该资源' });

      return;

    }

    next();

  };

}



/** 需要账号具备指定权限标识（管理员角色自动包含 school:manage 等） */

export function requirePermission(...perms: Permission[]) {

  return (req: AuthRequest, res: Response, next: NextFunction): void => {

    if (!req.authUser) {

      res.status(401).json({ error: '未登录或登录已过期' });

      return;

    }

    const granted = new Set(getPermissionsForRole(req.authUser.role));

    if (granted.has('admin:*')) {
      next();
      return;
    }

    const ok = perms.some((p) => granted.has(p));

    if (!ok) {

      res.status(403).json({ error: '无权限执行该操作' });

      return;

    }

    next();

  };

}



/** 已登录学生，或开发环境下游客 user1/user2 */

export function requireStudentAccess(req: AuthRequest, res: Response, next: NextFunction): void {

  if (req.authUser) {

    if (req.authUser.role !== 'student') {

      res.status(403).json({ error: '仅学生账号可使用该功能' });

      return;

    }

    next();

    return;

  }

  const requested = normalizeUserId(req.body?.userId ?? req.query?.userId);

  if (isGuestApiAllowed() && isGuestUserId(requested)) {

    next();

    return;

  }

  res.status(401).json({ error: '未登录或登录已过期' });

}



/** 学生只能操作自己的 userId */

export function assertSelfUserId(req: AuthRequest, res: Response, next: NextFunction): void {

  const requested = String(req.body?.userId ?? req.query?.userId ?? '');

  if (!req.authUser) {

    next();

    return;

  }

  if (req.authUser.role === 'student' && requested && requested !== req.authUser.id) {

    res.status(403).json({ error: '无权访问其他用户数据' });

    return;

  }

  next();

}


