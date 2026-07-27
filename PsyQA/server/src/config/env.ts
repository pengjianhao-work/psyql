import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  isProduction: process.env.NODE_ENV === 'production',
  authSecret: process.env.AUTH_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
  ollamaUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen:7b',
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 120000),
  askTimeoutMs: Number(process.env.ASK_TIMEOUT_MS || 120000),
  enableMetrics: process.env.PSYQA_ENABLE_METRICS === '1' || process.env.NODE_ENV !== 'production',
  serveClient: process.env.PSYQA_SERVE_CLIENT !== '0',
  trustProxy: process.env.TRUST_PROXY === '1',
  dashboardCacheTtlMs: Number(process.env.DASHBOARD_CACHE_TTL_MS || 30000),
  categoriesCacheTtlMs: Number(process.env.CATEGORIES_CACHE_TTL_MS || 300000),
  /** 咨询答案缓存 TTL（毫秒）；设为 0 关闭。重复提问同一句话会跳过缓存 */
  answerCacheTtlMs: Number(process.env.PSYQA_ANSWER_CACHE_TTL_MS ?? 120000),
  answerCacheEnabled: process.env.PSYQA_ANSWER_CACHE !== '0',
  allowGuest: process.env.PSYQA_ALLOW_GUEST === '1' || process.env.NODE_ENV !== 'production',
  maxAskRequests: Number(
    process.env.PSYQA_MAX_ASK_REQUESTS ||
      (process.env.PSYQA_LOAD_TEST === '1' ? 8 : 4)
  ),
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20)
};

export function validateProductionEnv(): void {
  if (!env.isProduction) return;
  if (!env.authSecret || env.authSecret.length < 16) {
    throw new Error('生产环境必须设置 AUTH_SECRET（至少 16 字符）');
  }
  if (env.authSecret.includes('change-me') || env.authSecret === 'psyqa-dev-secret-change-me-local-only') {
    throw new Error('生产环境 AUTH_SECRET 不能使用示例默认值');
  }
  if (!env.corsOrigin.length) {
    console.warn('[env] 建议设置 CORS_ORIGIN 为前端域名列表，逗号分隔');
  }
  if (env.allowGuest) {
    console.warn('[env] 生产环境建议设置 PSYQA_ALLOW_GUEST=0 关闭游客 API');
  }
}
