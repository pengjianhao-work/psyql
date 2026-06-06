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
exports.emitChunkedTokens = emitChunkedTokens;
exports.shouldUseLlm = shouldUseLlm;
exports.shouldUseOllamaLlm = shouldUseOllamaLlm;
exports.getLastActiveLlmProvider = getLastActiveLlmProvider;
exports.isLlmAvailable = isLlmAvailable;
exports.resolveActiveLlmProvider = resolveActiveLlmProvider;
exports.getActiveLlmModel = getActiveLlmModel;
exports.getLlmStatus = getLlmStatus;
exports.resolveLlmMode = resolveLlmMode;
exports.callLlmGenerate = callLlmGenerate;
exports.callLlmGenerateStream = callLlmGenerateStream;
const zhipuClient_1 = require("./zhipuClient");
const ollamaClient_1 = require("./ollamaClient");
const ollamaClient_2 = require("./ollamaClient");
const llmCircuitBreaker_1 = require("./llmCircuitBreaker");
let lastActiveProvider = null;
const inflight = new Map();
function dedupeKey(prompt, provider) {
    return `${provider}:${prompt.slice(0, 120)}`;
}
/** 非流式回退时模拟逐字输出，避免前端长时间无反馈 */
function emitChunkedTokens(text, onToken, chunkSize = 20) {
    if (!onToken || !text)
        return;
    for (let i = 0; i < text.length; i += chunkSize) {
        onToken(text.slice(i, i + chunkSize));
    }
}
function shouldUseLlm() {
    if (process.env.PSYQA_SKIP_OLLAMA === '1' || process.env.PSYQA_FAST_ANSWER === '1') {
        return false;
    }
    return true;
}
/** @deprecated use shouldUseLlm */
function shouldUseOllamaLlm() {
    return shouldUseLlm();
}
function resolveProviderPreference() {
    const raw = (process.env.PSYQA_LLM_PROVIDER || 'auto').trim().toLowerCase();
    if (raw === 'zhipu' || raw === 'ollama')
        return raw;
    return 'auto';
}
function getLastActiveLlmProvider() {
    return lastActiveProvider;
}
function isZhipuReady(forceRefresh) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(0, zhipuClient_1.isZhipuConfigured)())
            return false;
        if ((0, llmCircuitBreaker_1.isProviderCircuitOpen)('zhipu'))
            return false;
        const pref = resolveProviderPreference();
        if (pref === 'ollama')
            return false;
        const health = yield (0, zhipuClient_1.checkZhipuHealth)(forceRefresh);
        return health.ok;
    });
}
function isOllamaReady(forceRefresh) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.PSYQA_SKIP_OLLAMA === '1')
            return false;
        if ((0, llmCircuitBreaker_1.isProviderCircuitOpen)('ollama'))
            return false;
        const health = yield (0, ollamaClient_2.checkOllamaHealth)();
        if (!health.ok)
            return false;
        const { model } = yield (0, ollamaClient_1.resolveOllamaModel)(forceRefresh);
        return health.models.some((m) => m === model || m.startsWith(`${model}:`) || m.startsWith(`${model.split(':')[0]}:`));
    });
}
function isLlmAvailable() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        if (!shouldUseLlm())
            return false;
        const pref = resolveProviderPreference();
        if (pref === 'zhipu') {
            return isZhipuReady(forceRefresh);
        }
        if (pref === 'ollama') {
            return isOllamaReady(forceRefresh);
        }
        if (yield isZhipuReady(forceRefresh))
            return true;
        return isOllamaReady(forceRefresh);
    });
}
function resolveActiveLlmProvider() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        if (!shouldUseLlm())
            return null;
        const pref = resolveProviderPreference();
        if (pref === 'zhipu') {
            return (yield isZhipuReady(forceRefresh)) ? 'zhipu' : null;
        }
        if (pref === 'ollama') {
            return (yield isOllamaReady(forceRefresh)) ? 'ollama' : null;
        }
        if (yield isZhipuReady(forceRefresh))
            return 'zhipu';
        if (yield isOllamaReady(forceRefresh))
            return 'ollama';
        return null;
    });
}
function getActiveLlmModel() {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = yield resolveActiveLlmProvider();
        if (provider === 'zhipu')
            return (0, zhipuClient_1.getZhipuModel)();
        if (provider === 'ollama') {
            const { model, fineTuned } = yield (0, ollamaClient_1.resolveOllamaModel)();
            return fineTuned ? `${model}+LoRA` : model;
        }
        if ((0, zhipuClient_1.isZhipuConfigured)())
            return (0, zhipuClient_1.getZhipuModel)();
        const { model } = yield (0, ollamaClient_1.resolveOllamaModel)();
        return model;
    });
}
function getLlmStatus() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        const mode = yield resolveLlmMode(forceRefresh);
        const provider = yield resolveActiveLlmProvider(forceRefresh);
        if (provider === 'zhipu') {
            return { provider, model: (0, zhipuClient_1.getZhipuModel)(), fineTuned: false, mode };
        }
        if (provider === 'ollama') {
            const { model, fineTuned } = yield (0, ollamaClient_1.resolveOllamaModel)(forceRefresh);
            return { provider, model, fineTuned, mode };
        }
        const { model, fineTuned } = yield (0, ollamaClient_1.resolveOllamaModel)(forceRefresh);
        return { provider: null, model, fineTuned, mode };
    });
}
function resolveLlmMode() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        if (!shouldUseLlm())
            return 'fast';
        const provider = yield resolveActiveLlmProvider(forceRefresh);
        if (provider === 'zhipu')
            return 'zhipu';
        if (provider === 'ollama')
            return 'ollama';
        return 'fallback';
    });
}
function callLlmGenerate(prompt, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!shouldUseLlm())
            return null;
        const pref = (options === null || options === void 0 ? void 0 : options.provider) || resolveProviderPreference();
        const tryZhipu = pref === 'zhipu' || (pref === 'auto' && (0, zhipuClient_1.isZhipuConfigured)());
        const tryOllama = pref === 'ollama' || pref === 'auto';
        const run = () => __awaiter(this, void 0, void 0, function* () {
            if (tryZhipu && !(0, llmCircuitBreaker_1.isProviderCircuitOpen)('zhipu')) {
                const text = yield (0, zhipuClient_1.callZhipuGenerate)(prompt, {
                    model: options === null || options === void 0 ? void 0 : options.model,
                    systemPrompt: options === null || options === void 0 ? void 0 : options.systemPrompt,
                    temperature: options === null || options === void 0 ? void 0 : options.temperature,
                    maxTokens: options === null || options === void 0 ? void 0 : options.maxTokens,
                    timeoutMs: options === null || options === void 0 ? void 0 : options.timeoutMs
                });
                if (text) {
                    lastActiveProvider = 'zhipu';
                    (0, llmCircuitBreaker_1.recordLlmSuccess)('zhipu');
                    return text;
                }
                (0, llmCircuitBreaker_1.recordLlmFailure)('zhipu');
                if (pref === 'zhipu')
                    return null;
            }
            if (tryOllama && process.env.PSYQA_SKIP_OLLAMA !== '1' && !(0, llmCircuitBreaker_1.isProviderCircuitOpen)('ollama')) {
                const text = yield (0, ollamaClient_1.callOllamaGenerateOnly)(prompt, {
                    model: options === null || options === void 0 ? void 0 : options.model,
                    temperature: options === null || options === void 0 ? void 0 : options.temperature,
                    maxTokens: options === null || options === void 0 ? void 0 : options.maxTokens,
                    timeoutMs: options === null || options === void 0 ? void 0 : options.timeoutMs
                });
                if (text) {
                    lastActiveProvider = 'ollama';
                    (0, llmCircuitBreaker_1.recordLlmSuccess)('ollama');
                    return text;
                }
                (0, llmCircuitBreaker_1.recordLlmFailure)('ollama');
            }
            return null;
        });
        if (process.env.PSYQA_LLM_DEDUPE === '1') {
            const key = dedupeKey(prompt, pref);
            const existing = inflight.get(key);
            if (existing)
                return existing;
            const p = run().finally(() => inflight.delete(key));
            inflight.set(key, p);
            return p;
        }
        return run();
    });
}
function callLlmGenerateStream(prompt, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!shouldUseLlm())
            return null;
        const pref = (options === null || options === void 0 ? void 0 : options.provider) || resolveProviderPreference();
        const tryZhipu = pref === 'zhipu' || (pref === 'auto' && (0, zhipuClient_1.isZhipuConfigured)());
        if (tryZhipu && !(0, llmCircuitBreaker_1.isProviderCircuitOpen)('zhipu')) {
            const text = yield (0, zhipuClient_1.callZhipuGenerateStream)(prompt, {
                model: options === null || options === void 0 ? void 0 : options.model,
                systemPrompt: options === null || options === void 0 ? void 0 : options.systemPrompt,
                temperature: options === null || options === void 0 ? void 0 : options.temperature,
                maxTokens: options === null || options === void 0 ? void 0 : options.maxTokens,
                timeoutMs: options === null || options === void 0 ? void 0 : options.timeoutMs,
                onToken: options === null || options === void 0 ? void 0 : options.onToken
            });
            if (text) {
                lastActiveProvider = 'zhipu';
                (0, llmCircuitBreaker_1.recordLlmSuccess)('zhipu');
                return text;
            }
            (0, llmCircuitBreaker_1.recordLlmFailure)('zhipu');
            if (pref === 'zhipu') {
                /* fall through to ollama stream */
            }
        }
        const tryOllama = pref === 'ollama' || pref === 'auto';
        if (tryOllama && process.env.PSYQA_SKIP_OLLAMA !== '1' && !(0, llmCircuitBreaker_1.isProviderCircuitOpen)('ollama')) {
            const ollamaPrompt = (options === null || options === void 0 ? void 0 : options.systemPrompt) ? `${options.systemPrompt}\n\n${prompt}` : prompt;
            const text = yield (0, ollamaClient_1.callOllamaGenerateStream)(ollamaPrompt, {
                model: options === null || options === void 0 ? void 0 : options.model,
                temperature: options === null || options === void 0 ? void 0 : options.temperature,
                maxTokens: options === null || options === void 0 ? void 0 : options.maxTokens,
                timeoutMs: options === null || options === void 0 ? void 0 : options.timeoutMs,
                onToken: options === null || options === void 0 ? void 0 : options.onToken
            });
            if (text) {
                lastActiveProvider = 'ollama';
                (0, llmCircuitBreaker_1.recordLlmSuccess)('ollama');
                return text;
            }
            (0, llmCircuitBreaker_1.recordLlmFailure)('ollama');
        }
        const text = yield callLlmGenerate(prompt, options);
        if (text) {
            emitChunkedTokens(text, options === null || options === void 0 ? void 0 : options.onToken);
        }
        return text;
    });
}
