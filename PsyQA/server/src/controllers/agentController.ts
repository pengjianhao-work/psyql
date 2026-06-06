import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import {
  ensureUserAgentProfile,
  getUserAgentProfile,
  updateUserAgentProfile
} from '../db/userAgentStore';
import type { InterventionProfile, UserStaticProfile } from '../types/userAgent';
import {
  getRagBlendWeights,
  resolveAgentPhase,
  buildAgentExportBundle
} from '../services/user/userMemoryService';

export function getUserAgentProfileHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;

  const profile = ensureUserAgentProfile(userId);
  const weights = getRagBlendWeights(userId);
  const phase = resolveAgentPhase(userId);

  res.json({
    ...profile,
    phase,
    ragWeights: weights
  });
}

export function patchUserAgentProfileHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;

  const body = req.body as {
    basic?: UserStaticProfile;
    intervention?: Partial<InterventionProfile>;
    agentSystemPrompt?: string;
  };

  const current = ensureUserAgentProfile(userId);
  const patch: Parameters<typeof updateUserAgentProfile>[1] = {};

  if (body.basic !== undefined) {
    patch.basicJson = { ...(current.basicJson ?? {}), ...body.basic };
  }

  if (body.intervention !== undefined) {
    patch.interventionJson = {
      effectiveApproaches: body.intervention.effectiveApproaches ?? current.interventionJson?.effectiveApproaches ?? [],
      avoidPhrases: body.intervention.avoidPhrases ?? current.interventionJson?.avoidPhrases ?? [],
      sensitiveTopics: body.intervention.sensitiveTopics ?? current.interventionJson?.sensitiveTopics ?? [],
      preferredTone: body.intervention.preferredTone ?? current.interventionJson?.preferredTone
    };
  }

  if (body.agentSystemPrompt !== undefined) {
    patch.agentSystemPrompt = body.agentSystemPrompt;
  }

  const updated = updateUserAgentProfile(userId, patch);
  res.json({
    message: '专属画像已更新',
    profile: updated,
    phase: resolveAgentPhase(userId),
    ragWeights: getRagBlendWeights(userId)
  });
}

export function getUserAgentProfileAdmin(req: AuthRequest, res: Response): void {
  const userId = String(req.query.userId || '');
  if (!userId) {
    res.status(400).json({ error: '缺少 userId' });
    return;
  }
  const profile = getUserAgentProfile(userId);
  if (!profile) {
    res.status(404).json({ error: '用户画像不存在' });
    return;
  }
  res.json({
    ...profile,
    phase: resolveAgentPhase(userId),
    ragWeights: getRagBlendWeights(userId)
  });
}

export function exportUserAgentProfileHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;

  const bundle = buildAgentExportBundle(userId);
  const filename = `psyqa-agent-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(bundle, null, 2));
}
