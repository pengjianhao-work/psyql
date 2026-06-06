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
  categoriesCacheTtlMs: Number(process.env.CATEGORIES_CACHE_TTL_MS || 300000)
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
}
