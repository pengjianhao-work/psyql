import { Request, Response } from 'express';
import { createSessionToken, verifySessionToken } from '../services/user/sessionService';
import {
  getUserById,
  registerAccount,
  verifyLogin,
  updateStudentProfile
} from '../services/user/accountService';
import { listCollegeOptions } from '../services/user/orgService';
import { setAuthCookie, clearAuthCookie, getTokenFromRequest } from '../utils/authCookie';
import { AuthRequest } from '../middleware/authMiddleware';

export const postRegister = async (req: Request, res: Response): Promise<void> => {
  const { username, password, displayName } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
  };
  if (!username || !password) {
    res.status(400).json({ error: '用户名与密码不能为空' });
    return;
  }
  const result = await registerAccount(String(username), String(password), displayName ? String(displayName) : undefined);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const token = createSessionToken(result.user.id);
  setAuthCookie(res, token);
  res.status(201).json({ token, user: result.user });
};

export const postLogin = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: '用户名与密码不能为空' });
    return;
  }
  const result = await verifyLogin(String(username), String(password));
  if (!result.ok) {
    res.status(401).json({ error: result.error });
    return;
  }
  const token = createSessionToken(result.user.id);
  setAuthCookie(res, token);
  res.json({ token, user: result.user });
};

export const postLogout = async (_req: Request, res: Response): Promise<void> => {
  clearAuthCookie(res);
  res.json({ ok: true });
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const userId = verifySessionToken(getTokenFromRequest(req));
  if (!userId) {
    res.status(401).json({ error: '未登录或登录已过期' });
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    res.status(401).json({ error: '账号不存在' });
    return;
  }
  res.json({ user });
};

export const patchProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.authUser!;
  const body = req.body as {
    className?: string;
    orgId?: string;
    displayName?: string;
    avatar?: string;
    studentNo?: string;
    realName?: string;
    gender?: string;
    allowSchoolTranscriptView?: boolean;
  };

  const result = await updateStudentProfile(user.id, {
    className: body.className !== undefined ? String(body.className) : undefined,
    orgId: body.orgId !== undefined ? String(body.orgId) : undefined,
    displayName: body.displayName !== undefined ? String(body.displayName) : undefined,
    avatar: body.avatar !== undefined ? String(body.avatar) : undefined,
    studentNo: body.studentNo !== undefined ? String(body.studentNo) : undefined,
    realName: body.realName !== undefined ? String(body.realName) : undefined,
    gender: body.gender !== undefined ? String(body.gender) : undefined,
    allowSchoolTranscriptView:
      body.allowSchoolTranscriptView !== undefined ? Boolean(body.allowSchoolTranscriptView) : undefined
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ user: result.user });
};

export const getColleges = async (_req: Request, res: Response): Promise<void> => {
  res.json({ colleges: listCollegeOptions() });
};
