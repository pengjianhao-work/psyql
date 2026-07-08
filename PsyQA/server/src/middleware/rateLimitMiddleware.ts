import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/** 登录/注册接口限流，防暴力破解 */
export const authRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录尝试过于频繁，请稍后再试' },
  skip: () => env.nodeEnv === 'test'
});
