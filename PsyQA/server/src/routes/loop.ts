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
  putSafetyPlan
} from '../controllers/loopController';
import { attachAuth, requireStudentAccess, assertSelfUserId } from '../middleware/authMiddleware';

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
