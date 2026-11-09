import { Router } from 'express';
import { attachAuth, requireAuth, requireRole } from '../middleware/authMiddleware';
import {
  createSession,
  getSession,
  updateProgress,
  completeSession,
  listSessions
} from '../controllers/trainingController';

export const trainingRouter = Router();
trainingRouter.use(attachAuth);
trainingRouter.use(requireAuth, requireRole('student'));

trainingRouter.post('/sessions', createSession);
trainingRouter.get('/sessions', listSessions);
trainingRouter.get('/sessions/:id', getSession);
trainingRouter.patch('/sessions/:id/progress', updateProgress);
trainingRouter.post('/sessions/:id/complete', completeSession);
