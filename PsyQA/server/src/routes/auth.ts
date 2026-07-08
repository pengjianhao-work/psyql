import { Router } from 'express';
import {
  getColleges,
  getMe,
  patchProfile,
  postLogin,
  postLogout,
  postRegister
} from '../controllers/authController';
import { attachAuth, requireAuth } from '../middleware/authMiddleware';
import { authRateLimiter } from '../middleware/rateLimitMiddleware';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, postRegister);
authRouter.post('/login', authRateLimiter, postLogin);
authRouter.post('/logout', postLogout);
authRouter.get('/me', getMe);
authRouter.get('/colleges', attachAuth, requireAuth, getColleges);
authRouter.patch('/profile', attachAuth, requireAuth, patchProfile);
