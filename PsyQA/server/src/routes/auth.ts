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

export const authRouter = Router();

authRouter.post('/register', postRegister);
authRouter.post('/login', postLogin);
authRouter.post('/logout', postLogout);
authRouter.get('/me', getMe);
authRouter.get('/colleges', attachAuth, requireAuth, getColleges);
authRouter.patch('/profile', attachAuth, requireAuth, patchProfile);
