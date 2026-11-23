import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import { createWellbeingCheckin, listWellbeingCheckins } from '../services/loop/checkinService';
import {
  adjustPlan,
  createSupportPlan,
  getActivePlan,
  listPlans,
  updateActionStatus,
  ActionStatus
} from '../services/loop/supportPlanService';
import {
  addReflection,
  getSafetyPlan,
  listReflections,
  upsertSafetyPlan,
  ReflectionScope
} from '../services/loop/reflectionService';
import { createResource, listResources, setResourceActive, ResourceKind } from '../services/loop/resourceService';
import { runLoopTurn } from '../services/loop/loopRuntime';

const uid = (req: AuthRequest, res: Response): string | null => resolveStudentUserId(req, res, req.body?.userId);

export const postCheckin = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = uid(req, res);
  if (!userId) return;
  try {
    const b = req.body ?? {};
    const c = createWellbeingCheckin(userId, {
      mood: b.mood,
      stress: b.stress,
      sleepHours: b.sleepHours,
      energy: b.energy,
      eventText: b.eventText,
      skipped: b.skipped === true
    });
    res.json({ checkin: c });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const getCheckins = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json({ checkins: listWellbeingCheckins(userId, Number(req.query.limit) || 14) });
};

export const postPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = uid(req, res);
  if (!userId) return;
  try {
    const b = req.body ?? {};
    const plan = createSupportPlan(userId, b.goalText, Array.isArray(b.actions) ? b.actions : [], 'manual');
    res.json({ plan });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const getPlans = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json({ active: getActivePlan(userId), plans: listPlans(userId) });
};

export const postActionStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = uid(req, res);
  if (!userId) return;
  try {
    const action = updateActionStatus(userId, Number(req.body?.actionId), req.body?.status as ActionStatus);
    if (!action) {
      res.status(404).json({ error: '行动不存在' });
      return;
    }
    res.json({ action });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const postAdjustPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = uid(req, res);
  if (!userId) return;
  try {
    const b = req.body ?? {};
    const plan = adjustPlan(userId, Number(b.planId), b.goalText, Array.isArray(b.actions) ? b.actions : []);
    if (!plan) {
      res.status(404).json({ error: '计划不存在' });
      return;
    }
    res.json({ plan });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const postReflection = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = uid(req, res);
  if (!userId) return;
  try {
    const b = req.body ?? {};
    const r = addReflection(userId, {
      scope: b.scope as ReflectionScope,
      lines: Array.isArray(b.lines) ? b.lines : [],
      helped: b.helped,
      notHelped: b.notHelped,
      adjustNote: b.adjustNote
    });
    res.json({ reflection: r });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const getReflections = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json({ reflections: listReflections(userId, req.query.scope as ReflectionScope | undefined) });
};

export const getMySafetyPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json({ safetyPlan: getSafetyPlan(userId) });
};

export const putSafetyPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = uid(req, res);
  if (!userId) return;
  const b = req.body ?? {};
  res.json({
    safetyPlan: upsertSafetyPlan(userId, {
      contacts: Array.isArray(b.contacts) ? b.contacts : [],
      coping: Array.isArray(b.coping) ? b.coping : [],
      warningSigns: Array.isArray(b.warningSigns) ? b.warningSigns : []
    })
  });
};

export const getResources = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ resources: listResources(req.query.kind as ResourceKind | undefined) });
};

export const postResource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const b = req.body ?? {};
    res.json({ resource: createResource({ kind: b.kind, title: b.title, body: b.body, sourceRef: b.sourceRef }) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const patchResource = async (req: AuthRequest, res: Response): Promise<void> => {
  const ok = setResourceActive(Number(req.params.id), req.body?.active === true);
  res.status(ok ? 200 : 404).json({ ok });
};

export const postCompanion = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = uid(req, res);
  if (!userId) return;
  const text = String(req.body?.text ?? '').slice(0, 2000);
  res.json(runLoopTurn(userId, text));
};
