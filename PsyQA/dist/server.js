"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const createApp_1 = require("./createApp");
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const database_1 = require("./db/database");
const migrateFromJson_1 = require("./db/migrateFromJson");
const seedDemoData_1 = require("./services/seedDemoData");
const knowledgeScheduler_1 = require("./services/knowledgeScheduler");
const ollamaClient_1 = require("./services/ollamaClient");
const llmClient_1 = require("./services/llmClient");
const zhipuClient_1 = require("./services/zhipuClient");
const sessionService_1 = require("./services/sessionService");
try {
    (0, env_1.validateProductionEnv)();
    (0, sessionService_1.assertAuthSecretConfigured)();
}
catch (err) {
    console.error(err.message);
    process.exit(1);
}
const app = (0, createApp_1.createApp)();
(0, database_1.getDb)();
(0, migrateFromJson_1.runJsonMigrationIfNeeded)();
(0, seedDemoData_1.seedP0DemoData)().catch((err) => logger_1.logger.warn('Demo seed skipped', { err: String(err) }));
const server = app.listen(env_1.env.port, () => {
    logger_1.logger.info('Server started', { port: env_1.env.port, env: env_1.env.nodeEnv });
    if ((0, llmClient_1.shouldUseLlm)()) {
        if ((0, zhipuClient_1.isZhipuConfigured)()) {
            console.log('咨询回复：优先智谱 AI（永久免费 glm-4-flash），Ollama 为备选');
            console.log(`智谱模型 ${(0, zhipuClient_1.getZhipuModel)()} · 需在 .env 配置 ZHIPU_API_KEY`);
        }
        else {
            console.log('咨询回复：Ollama 大模型（配置 ZHIPU_API_KEY 可优先使用智谱免费 API）');
            console.log(`模型 ${env_1.env.ollamaModel} · ${env_1.env.ollamaUrl}`);
        }
    }
    else {
        console.log('咨询回复：快速模式（未使用大模型；删除 .env 中 PSYQA_FAST_ANSWER=1 可恢复）');
    }
    if (env_1.env.isProduction && env_1.env.serveClient) {
        console.log('Production: serving client static build');
    }
    (0, knowledgeScheduler_1.startKnowledgeScheduler)();
    void (() => __awaiter(void 0, void 0, void 0, function* () {
        if (process.env.PSYQA_LOAD_TEST === '1') {
            console.warn('PSYQA_LOAD_TEST=1：压测快速模式，已跳过 LLM');
            return;
        }
        if (!(0, llmClient_1.shouldUseLlm)())
            return;
        if ((0, zhipuClient_1.isZhipuConfigured)()) {
            const zhipu = yield (0, zhipuClient_1.checkZhipuHealth)(true);
            if (zhipu.ok) {
                console.log(`智谱 AI 已就绪 · ${(0, zhipuClient_1.getZhipuModel)()}`);
                return;
            }
            console.warn(`智谱 AI 未连通（${zhipu.error || 'unknown'}），将尝试 Ollama`);
        }
        const model = (0, ollamaClient_1.getOllamaModel)();
        const health = yield (0, ollamaClient_1.checkOllamaHealth)();
        if (!health.ok) {
            console.warn(`Ollama 未连接（${health.error || 'unknown'}），将使用知识库兜底回复`);
            if (!(0, zhipuClient_1.isZhipuConfigured)()) {
                console.warn('建议：在 .env 设置 ZHIPU_API_KEY（智谱永久免费）或运行 ollama serve');
            }
            return;
        }
        const hasModel = health.models.some((m) => m === model || m.startsWith(`${model}:`) || m.startsWith(`${model}-`));
        if (hasModel) {
            const active = yield (0, llmClient_1.resolveActiveLlmProvider)(true);
            console.log(`LLM 已就绪 · ${active === 'zhipu' ? '智谱' : 'Ollama'} · ${active === 'zhipu' ? (0, zhipuClient_1.getZhipuModel)() : model}`);
        }
        else {
            console.warn(`Ollama 已连接，但未找到模型「${model}」。可执行: ollama pull ${model}`);
        }
    }))();
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[错误] 端口 ${env_1.env.port} 已被占用，后端无法启动（前端会显示「后端未启动」）。\n` +
            `请先关闭其它 PsyQA 窗口，或在 PsyQA 目录运行: npm run free:ports\n` +
            `然后重新执行 npm run dev 或「一键启动.bat」。\n`);
    }
    else {
        console.error('[错误] 服务器启动失败:', err.message);
    }
    process.exit(1);
});
