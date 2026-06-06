import { createApp } from './createApp';
import { env, validateProductionEnv } from './config/env';
import { logger } from './utils/logger';
import { getDb } from './db/database';
import { runJsonMigrationIfNeeded } from './db/migrateFromJson';
import { seedP0DemoData } from './services/seedDemoData';
import { startKnowledgeScheduler } from './services/knowledgeScheduler';
import { checkOllamaHealth, getOllamaModel } from './services/ollamaClient';
import { shouldUseLlm, resolveActiveLlmProvider } from './services/llmClient';
import { isZhipuConfigured, getZhipuModel, checkZhipuHealth } from './services/zhipuClient';
import { assertAuthSecretConfigured } from './services/sessionService';

try {
  validateProductionEnv();
  assertAuthSecretConfigured();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const app = createApp();

getDb();
runJsonMigrationIfNeeded();
seedP0DemoData().catch((err) => logger.warn('Demo seed skipped', { err: String(err) }));

const server = app.listen(env.port, () => {
  logger.info('Server started', { port: env.port, env: env.nodeEnv });
  if (shouldUseLlm()) {
    if (isZhipuConfigured()) {
      console.log('咨询回复：优先智谱 AI（永久免费 glm-4-flash），Ollama 为备选');
      console.log(`智谱模型 ${getZhipuModel()} · 需在 .env 配置 ZHIPU_API_KEY`);
    } else {
      console.log('咨询回复：Ollama 大模型（配置 ZHIPU_API_KEY 可优先使用智谱免费 API）');
      console.log(`模型 ${env.ollamaModel} · ${env.ollamaUrl}`);
    }
  } else {
    console.log('咨询回复：快速模式（未使用大模型；删除 .env 中 PSYQA_FAST_ANSWER=1 可恢复）');
  }
  if (env.isProduction && env.serveClient) {
    console.log('Production: serving client static build');
  }
  startKnowledgeScheduler();

  void (async () => {
    if (process.env.PSYQA_LOAD_TEST === '1') {
      console.warn('PSYQA_LOAD_TEST=1：压测快速模式，已跳过 LLM');
      return;
    }
    if (!shouldUseLlm()) return;

    if (isZhipuConfigured()) {
      const zhipu = await checkZhipuHealth(true);
      if (zhipu.ok) {
        console.log(`智谱 AI 已就绪 · ${getZhipuModel()}`);
        return;
      }
      console.warn(`智谱 AI 未连通（${zhipu.error || 'unknown'}），将尝试 Ollama`);
    }

    const model = getOllamaModel();
    const health = await checkOllamaHealth();
    if (!health.ok) {
      console.warn(`Ollama 未连接（${health.error || 'unknown'}），将使用知识库兜底回复`);
      if (!isZhipuConfigured()) {
        console.warn('建议：在 .env 设置 ZHIPU_API_KEY（智谱永久免费）或运行 ollama serve');
      }
      return;
    }
    const hasModel = health.models.some(
      (m) => m === model || m.startsWith(`${model}:`) || m.startsWith(`${model}-`)
    );
    if (hasModel) {
      const active = await resolveActiveLlmProvider(true);
      console.log(`LLM 已就绪 · ${active === 'zhipu' ? '智谱' : 'Ollama'} · ${active === 'zhipu' ? getZhipuModel() : model}`);
    } else {
      console.warn(`Ollama 已连接，但未找到模型「${model}」。可执行: ollama pull ${model}`);
    }
  })();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[错误] 端口 ${env.port} 已被占用，后端无法启动（前端会显示「后端未启动」）。\n` +
        `请先关闭其它 PsyQA 窗口，或在 PsyQA 目录运行: npm run free:ports\n` +
        `然后重新执行 npm run dev 或「一键启动.bat」。\n`
    );
  } else {
    console.error('[错误] 服务器启动失败:', err.message);
  }
  process.exit(1);
});
