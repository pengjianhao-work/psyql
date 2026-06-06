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
exports.markOllamaUnavailable = markOllamaUnavailable;
exports.shouldUseOllamaLlm = shouldUseOllamaLlm;
exports.clearOllamaAvailabilityCache = clearOllamaAvailabilityCache;
exports.isOllamaAvailable = isOllamaAvailable;
exports.isOllamaOnlyAvailable = isOllamaOnlyAvailable;
const ollamaClient_1 = require("./ollamaClient");
const zhipuClient_1 = require("./zhipuClient");
const llmClient_1 = require("./llmClient");
let cache = { ok: true, until: 0 };
function markOllamaUnavailable(cooldownMs = 120000) {
    cache = { ok: false, until: Date.now() + cooldownMs };
}
/** 默认优先大模型；设 PSYQA_FAST_ANSWER=1 或 PSYQA_SKIP_OLLAMA=1 可关闭 */
function shouldUseOllamaLlm() {
    return (0, llmClient_1.shouldUseLlm)();
}
function clearOllamaAvailabilityCache() {
    cache = { ok: true, until: 0 };
}
/** 智谱 API 或 Ollama 任一可用即返回 true */
function isOllamaAvailable() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        if (!(0, llmClient_1.shouldUseLlm)())
            return false;
        if (process.env.PSYQA_SKIP_OLLAMA === '1' && !(0, zhipuClient_1.isZhipuConfigured)())
            return false;
        const now = Date.now();
        if (!forceRefresh && now < cache.until)
            return cache.ok;
        const ok = yield (0, llmClient_1.isLlmAvailable)(forceRefresh);
        cache = { ok, until: now + 90000 };
        return ok;
    });
}
function isOllamaOnlyAvailable() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        if (!(0, llmClient_1.shouldUseLlm)() || process.env.PSYQA_SKIP_OLLAMA === '1')
            return false;
        const model = (0, ollamaClient_1.getOllamaModel)();
        const health = yield (0, ollamaClient_1.checkOllamaHealth)();
        return (health.ok &&
            health.models.some((m) => m === model || m.startsWith(`${model}:`) || m.startsWith(`${model}-`)));
    });
}
