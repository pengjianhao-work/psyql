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
exports.shouldUseLlm = shouldUseLlm;
exports.shouldUseOllamaLlm = shouldUseOllamaLlm;
exports.getLastActiveLlmProvider = getLastActiveLlmProvider;
exports.isLlmAvailable = isLlmAvailable;
exports.resolveActiveLlmProvider = resolveActiveLlmProvider;
exports.getActiveLlmModel = getActiveLlmModel;
exports.resolveLlmMode = resolveLlmMode;
exports.callLlmGenerate = callLlmGenerate;
exports.callLlmGenerateStream = callLlmGenerateStream;
const zhipuClient_1 = require("./zhipuClient");
const ollamaClient_1 = require("./ollamaClient");
const ollamaClient_2 = require("./ollamaClient");
let lastActiveProvider = null;
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
function isOllamaReady(forceRefresh) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.PSYQA_SKIP_OLLAMA === '1')
            return false;
        const model = (0, ollamaClient_1.getOllamaModel)();
        const health = yield (0, ollamaClient_2.checkOllamaHealth)();
        return (health.ok &&
            health.models.some((m) => m === model || m.startsWith(`${model}:`) || m.startsWith(`${model}-`)));
    });
}
function isZhipuReady(forceRefresh) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(0, zhipuClient_1.isZhipuConfigured)())
            return false;
        const pref = resolveProviderPreference();
        if (pref === 'ollama')
            return false;
        const health = yield (0, zhipuClient_1.checkZhipuHealth)(forceRefresh);
        return health.ok;
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
        if (provider === 'ollama')
            return (0, ollamaClient_1.getOllamaModel)();
        if ((0, zhipuClient_1.isZhipuConfigured)())
            return (0, zhipuClient_1.getZhipuModel)();
        return (0, ollamaClient_1.getOllamaModel)();
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
        if (tryZhipu) {
            const text = yield (0, zhipuClient_1.callZhipuGenerate)(prompt, {
                model: options === null || options === void 0 ? void 0 : options.model,
                systemPrompt: options === null || options === void 0 ? void 0 : options.systemPrompt,
                temperature: options === null || options === void 0 ? void 0 : options.temperature,
                maxTokens: options === null || options === void 0 ? void 0 : options.maxTokens,
                timeoutMs: options === null || options === void 0 ? void 0 : options.timeoutMs
            });
            if (text) {
                lastActiveProvider = 'zhipu';
                return text;
            }
            if (pref === 'zhipu')
                return null;
        }
        if (tryOllama && process.env.PSYQA_SKIP_OLLAMA !== '1') {
            const text = yield (0, ollamaClient_1.callOllamaGenerateOnly)(prompt, {
                model: options === null || options === void 0 ? void 0 : options.model,
                temperature: options === null || options === void 0 ? void 0 : options.temperature,
                maxTokens: options === null || options === void 0 ? void 0 : options.maxTokens,
                timeoutMs: options === null || options === void 0 ? void 0 : options.timeoutMs
            });
            if (text) {
                lastActiveProvider = 'ollama';
                return text;
            }
        }
        return null;
    });
}
function callLlmGenerateStream(prompt, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const text = yield callLlmGenerate(prompt, options);
        if (text && (options === null || options === void 0 ? void 0 : options.onToken)) {
            options.onToken(text);
        }
        return text;
    });
}
