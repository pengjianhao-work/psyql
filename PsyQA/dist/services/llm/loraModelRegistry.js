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
exports.LORA_MODEL_ALIASES = void 0;
exports.getConfiguredLoraModelName = getConfiguredLoraModelName;
exports.shouldPreferLoraModel = shouldPreferLoraModel;
exports.pickOllamaModelFromTags = pickOllamaModelFromTags;
exports.resolveOllamaModel = resolveOllamaModel;
exports.clearOllamaModelCache = clearOllamaModelCache;
const ollamaClient_1 = require("./ollamaClient");
/** 常见 LoRA 微调后导入 Ollama 的模型名 */
exports.LORA_MODEL_ALIASES = ['psyqa-counsel', 'mental-counsel', 'mental_lora'];
let resolvedCache = null;
const CACHE_MS = 60000;
function getConfiguredLoraModelName() {
    return (process.env.PSYQA_LORA_MODEL || 'psyqa-counsel').trim();
}
function shouldPreferLoraModel() {
    if (process.env.PSYQA_PREFER_LORA === '1')
        return true;
    const provider = (process.env.PSYQA_LLM_PROVIDER || 'auto').trim().toLowerCase();
    return provider === 'ollama' || provider === 'lora';
}
function matchesLoraName(name) {
    const lower = name.toLowerCase();
    const lora = getConfiguredLoraModelName().toLowerCase();
    if (lower === lora || lower.startsWith(`${lora}:`))
        return true;
    return exports.LORA_MODEL_ALIASES.some((a) => lower === a || lower.startsWith(`${a}:`));
}
function pickOllamaModelFromTags(tags, explicitModel) {
    const explicit = (explicitModel || process.env.OLLAMA_MODEL || '').trim();
    if (explicit && explicit !== 'qwen:7b' && !shouldPreferLoraModel()) {
        return { model: explicit, fineTuned: matchesLoraName(explicit) };
    }
    const loraName = getConfiguredLoraModelName();
    const candidates = [loraName, ...exports.LORA_MODEL_ALIASES];
    if (shouldPreferLoraModel() || !explicit) {
        for (const c of candidates) {
            const hit = tags.find((t) => t === c || t.startsWith(`${c}:`));
            if (hit)
                return { model: hit, fineTuned: true };
        }
    }
    if (explicit) {
        return { model: explicit, fineTuned: matchesLoraName(explicit) };
    }
    const qwen = tags.find((t) => t.startsWith('qwen'));
    return { model: qwen || 'qwen:7b', fineTuned: false };
}
function resolveOllamaModel() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && resolvedCache && now < resolvedCache.until) {
            return { model: resolvedCache.model, fineTuned: resolvedCache.fineTuned };
        }
        const health = yield (0, ollamaClient_1.checkOllamaHealth)();
        if (!health.ok || !health.models.length) {
            const fallback = process.env.OLLAMA_MODEL || 'qwen:7b';
            return { model: fallback, fineTuned: matchesLoraName(fallback) };
        }
        const picked = pickOllamaModelFromTags(health.models);
        resolvedCache = Object.assign(Object.assign({}, picked), { until: now + CACHE_MS });
        return picked;
    });
}
function clearOllamaModelCache() {
    resolvedCache = null;
}
