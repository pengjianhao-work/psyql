import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import { dialogExists, saveSessionFeedback, getSessionFeedback } from '../db/feedbackStore';
import { getOrRefreshUserProfile, refreshUserProfile } from '../services/user/userProfileService';

export function postSessionFeedback(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;

  const { dialogTime, rating, helpful, comment } = req.body as {
    dialogTime?: string;
    rating?: number;
    helpful?: boolean;
    comment?: string;
  };

  if (!dialogTime) {
    res.status(400).json({ error: '缺少 dialogTime' });
    return;
  }

  const time = String(dialogTime);
  if (!dialogExists(userId, time)) {
    res.status(404).json({ error: '未找到对应咨询记录' });
    return;
  }

  if (rating === undefined && helpful === undefined && !comment?.trim()) {
    res.status(400).json({ error: '请至少提供评分、是否有帮助或文字反馈之一' });
    return;
  }

  if (rating !== undefined) {
    const n = Number(rating);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      res.status(400).json({ error: 'rating 须为 1-5 的整数' });
      return;
    }
  }

  const feedback = saveSessionFeedback(userId, time, { rating, helpful, comment });
  const profile = refreshUserProfile(userId);

  res.json({
    message: '反馈已保存',
    feedback,
    profile
  });
}

export function getSessionFeedbackForDialog(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const dialogTime = String(req.query.dialogTime || '');
  if (!dialogTime) {
    res.status(400).json({ error: '缺少 dialogTime' });
    return;
  }
  const feedback = getSessionFeedback(userId, dialogTime);
  res.json({ feedback });
}

export function getUserProfileHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const profile = refresh ? refreshUserProfile(userId) : getOrRefreshUserProfile(userId);
  res.json(profile);
}
