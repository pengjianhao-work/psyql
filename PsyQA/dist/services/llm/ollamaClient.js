"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOllamaGenerateUrl = resolveOllamaGenerateUrl;
exports.getOllamaModel = getOllamaModel;
exports.checkOllamaHealth = checkOllamaHealth;
exports.callOllamaGenerateOnly = callOllamaGenerateOnly;
exports.callOllamaGenerate = callOllamaGenerate;
exports.extractJsonObject = extractJsonObject;
const axios_1 = __importDefault(require("axios"));
/** 兼容 .env 里写 http://localhost:11434 或完整 /api/generate 路径 */
function resolveOllamaGenerateUrl() {
    const raw = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    if (raw.includes('/api/generate'))
        return raw;
    return `${raw.replace(/\/$/, '')}/api/generate`;
}
function getOllamaModel() {
    return process.env.OLLAMA_MODEL || 'qwen:7b';
}
const DEFAULT_API = resolveOllamaGenerateUrl();
const DEFAULT_MODEL = getOllamaModel();
function checkOllamaHealth() {
    return __awaiter(this, void 0, void 0, function* () {
        const base = (process.env.OLLAMA_API_URL || 'http://localhost:11434').replace(/\/api\/generate\/?$/, '');
        try {
            const { data } = yield axios_1.default.get(`${base.replace(/\/$/, '')}/api/tags`, { timeout: 5000 });
            const models = Array.isArray(data === null || data === void 0 ? void 0 : data.models)
                ? data.models.map((m) => m.name).filter(Boolean)
                : [];
            return { ok: true, models };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, models: [], error: msg };
        }
    });
}
/** 仅调用本地 Ollama（不经过智谱优先链） */
function callOllamaGenerateOnly(prompt, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const model = (options === null || options === void 0 ? void 0 : options.model) || DEFAULT_MODEL;
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = yield axios_1.default.post(DEFAULT_API, {
                    model,
                    prompt,
                    stream: false,
                    options: {
                        temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.15,
                        num_predict: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 512
                    }
                }, { timeout: (_c = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _c !== void 0 ? _c : 45000 });
                const text = (_d = response.data) === null || _d === void 0 ? void 0 : _d.response;
                return typeof text === 'string' ? text.trim() : null;
            }
            catch (error) {
                console.warn(`Ollama generate failed (${attempt}/${maxAttempts}):`, error);
                try {
                    const { markOllamaUnavailable } = yield Promise.resolve().then(() => __importStar(require('./ollamaAvailability')));
                    markOllamaUnavailable();
                }
                catch (_e) {
                    /* ignore */
                }
                if (attempt < maxAttempts) {
                    yield new Promise((r) => setTimeout(r, 800 * attempt));
                }
            }
        }
        return null;
    });
}
/** 优先智谱 AI，回退 Ollama */
function callOllamaGenerate(prompt, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const { callLlmGenerate } = yield Promise.resolve().then(() => __importStar(require('./llmClient')));
        return callLlmGenerate(prompt, options);
    });
}
function extractJsonObject(raw) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced ? fenced[1] : raw).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start)
        return null;
    try {
        return JSON.parse(candidate.slice(start, end + 1));
    }
    catch (_a) {
        return null;
    }
}
