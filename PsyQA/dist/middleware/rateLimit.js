"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginRateLimit = void 0;
exports.createRateLimiter = createRateLimiter;
const buckets = new Map();
function createRateLimiter(maxAttempts, windowMs) {
    return (req, res, next) => {
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
exports.loginRateLimit = createRateLimiter(20, 15 * 60 * 1000);
