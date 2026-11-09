import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  TRAINING_TYPES,
  TrainingType,
  UpdateTrainingProgressInput,
  CompleteTrainingInput
} from '../types/training';
import {
  createTrainingSession,
  getTrainingSession,
  updateTrainingProgress,
  completeTrainingSession,
  listTrainingSessions
} from '../db/trainingStore';

function getUserId(req: AuthRequest): string | null {
  return req.authUser?.id ? String(req.authUser.id) : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createSession(req: AuthRequest, res: Response): void {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: '未登录或登录已过期' }); return; }
  const trainingType = req.body?.trainingType;
  if (typeof trainingType !== 'string' || !TRAINING_TYPES.includes(trainingType as TrainingType)) {
    res.status(400).json({ error: 'trainingType 无效' }); return;
  }
  res.status(201).json({ data: createTrainingSession(userId, trainingType as TrainingType) });
}

export function getSession(req: AuthRequest, res: Response): void {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: '未登录或登录已过期' }); return; }
  const session = getTrainingSession(userId, req.params.id);
  if (!session) { res.status(404).json({ error: '训练记录不存在' }); return; }
  res.json({ data: session });
}

export function updateProgress(req: AuthRequest, res: Response): void {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: '未登录或登录已过期' }); return; }
  const body = req.body as UpdateTrainingProgressInput;
  if (body.answers !== undefined && !isObject(body.answers)) {
    res.status(400).json({ error: 'answers 必须是对象' }); return;
  }
  if (body.currentStep !== undefined && (!Number.isInteger(body.currentStep) || body.currentStep < 0)) {
    res.status(400).json({ error: 'currentStep 必须是非负整数' }); return;
  }
  const session = updateTrainingProgress(userId, req.params.id, body.answers, body.currentStep);
  if (!session) { res.status(404).json({ error: '训练记录不存在或已完成' }); return; }
  res.json({ data: session });
}

export function completeSession(req: AuthRequest, res: Response): void {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: '未登录或登录已过期' }); return; }
  const body = req.body as CompleteTrainingInput;
  if (body.answers !== undefined && !isObject(body.answers)) {
    res.status(400).json({ error: 'answers 必须是对象' }); return;
  }
  if (body.feedback !== undefined && !isObject(body.feedback)) {
    res.status(400).json({ error: 'feedback 必须是对象' }); return;
  }
  const session = completeTrainingSession(userId, req.params.id, body.answers, body.feedback);
  if (!session) { res.status(404).json({ error: '训练记录不存在' }); return; }
  res.json({ data: session });
}

export function listSessions(req: AuthRequest, res: Response): void {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: '未登录或登录已过期' }); return; }
  const rawLimit = Number(req.query.limit ?? 30);
  const rawOffset = Number(req.query.offset ?? 0);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100 ||
      !Number.isInteger(rawOffset) || rawOffset < 0) {
    res.status(400).json({ error: '分页参数无效' }); return;
  }
  res.json({ data: listTrainingSessions(userId, rawLimit, rawOffset) });
}
