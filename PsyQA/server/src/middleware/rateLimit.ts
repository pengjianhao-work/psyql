import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function createRateLimiter(maxAttempts: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxAttempts) {
      res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      return;
    }
    next();
  };
}

export const loginRateLimit = createRateLimiter(20, 15 * 60 * 1000);
