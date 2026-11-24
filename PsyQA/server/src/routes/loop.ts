import { Router } from 'express';
import {
  postCheckin,
  getCheckins,
  postPlan,
  getPlans,
  postActionStatus,
  postAdjustPlan,
  postReflection,
  getReflections,
  getMySafetyPlan,
  putSafetyPlan,
  getResources,
  postResource,
  patchResource,
  postCompanion,
  getToday,
  getWeekSummary
} from '../controllers/loopController';
import { attachAuth, requireAuth, requireRole, requireStudentAccess, assertSelfUserId } from '../middleware/authMiddleware';

export const loopRouter = Router();

loopRouter.use(attachAuth);
const studentApi = [requireStudentAccess, assertSelfUserId] as const;

loopRouter.post('/checkin', ...studentApi, postCheckin);
loopRouter.get('/checkins', ...studentApi, getCheckins);
loopRouter.post('/plan', ...studentApi, postPlan);
loopRouter.get('/plans', ...studentApi, getPlans);
loopRouter.post('/plan/action', ...studentApi, postActionStatus);
loopRouter.post('/plan/adjust', ...studentApi, postAdjustPlan);
loopRouter.post('/reflection', ...studentApi, postReflection);
loopRouter.get('/reflections', ...studentApi, getReflections);
loopRouter.get('/safety-plan', ...studentApi, getMySafetyPlan);
loopRouter.put('/safety-plan', ...studentApi, putSafetyPlan);
loopRouter.get('/resources', requireAuth, getResources);
loopRouter.post('/resources', requireRole('counselor', 'admin'), postResource);
loopRouter.patch('/resources/:id', requireRole('counselor', 'admin'), patchResource);
loopRouter.post('/companion', ...studentApi, postCompanion);
loopRouter.get('/today', ...studentApi, getToday);
loopRouter.get('/summary', ...studentApi, getWeekSummary);
