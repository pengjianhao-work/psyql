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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getZhipuApiKey = getZhipuApiKey;
exports.getZhipuModel = getZhipuModel;
exports.getZhipuBaseUrl = getZhipuBaseUrl;
exports.isZhipuConfigured = isZhipuConfigured;
exports.markZhipuUnavailable = markZhipuUnavailable;
exports.clearZhipuHealthCache = clearZhipuHealthCache;
exports.checkZhipuHealth = checkZhipuHealth;
exports.callZhipuGenerate = callZhipuGenerate;
exports.callZhipuGenerateStream = callZhipuGenerateStream;
const axios_1 = __importDefault(require("axios"));
const DEFAULT_BASE = 'https://open.bigmodel.cn/api/paas/v4';
function getZhipuApiKey() {
    const key = (process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || '').trim();
    return key.length >= 8 ? key : null;
}
function getZhipuModel() {
    return (process.env.ZHIPU_MODEL || 'glm-4-flash').trim();
}
function getZhipuBaseUrl() {
    const raw = (process.env.ZHIPU_API_URL || DEFAULT_BASE).replace(/\/$/, '');
    return raw;
}
function isZhipuConfigured() {
    return Boolean(getZhipuApiKey());
}
let healthCache = { ok: false, until: 0 };
function markZhipuUnavailable(cooldownMs = 120000) {
    healthCache = { ok: false, until: Date.now() + cooldownMs };
}
function clearZhipuHealthCache() {
    healthCache = { ok: false, until: 0 };
}
function checkZhipuHealth() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        var _a, _b, _c, _d;
        const key = getZhipuApiKey();
        if (!key)
            return { ok: false, error: 'ZHIPU_API_KEY not set' };
        const now = Date.now();
        if (!forceRefresh && now < healthCache.until) {
            return healthCache.ok ? { ok: true } : { ok: false, error: 'cached unavailable' };
        }
        try {
            const { data } = yield axios_1.default.post(`${getZhipuBaseUrl()}/chat/completions`, {
                model: getZhipuModel(),
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 8,
                temperature: 0.1
            }, {
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            });
            const text = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
            const ok = typeof text === 'string' || ((_d = data === null || data === void 0 ? void 0 : data.choices) === null || _d === void 0 ? void 0 : _d.length) > 0;
            healthCache = { ok, until: now + 90000 };
            return ok ? { ok: true } : { ok: false, error: 'empty response' };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            healthCache = { ok: false, until: now + 60000 };
            return { ok: false, error: msg };
        }
    });
}
function callZhipuGenerate(prompt, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const key = getZhipuApiKey();
        if (!key)
            return null;
        const model = (options === null || options === void 0 ? void 0 : options.model) || getZhipuModel();
        const messages = [];
        if ((_a = options === null || options === void 0 ? void 0 : options.systemPrompt) === null || _a === void 0 ? void 0 : _a.trim()) {
            messages.push({ role: 'system', content: options.systemPrompt.trim() });
        }
        messages.push({ role: 'user', content: prompt });
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const { data } = yield axios_1.default.post(`${getZhipuBaseUrl()}/chat/completions`, {
                    model,
                    messages,
                    temperature: (_b = options === null || options === void 0 ? void 0 : options.temperature) !== null && _b !== void 0 ? _b : 0.45,
                    max_tokens: (_c = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _c !== void 0 ? _c : 1024
                }, {
                    headers: {
                        Authorization: `Bearer ${key}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: (_d = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _d !== void 0 ? _d : 60000
                });
                const text = (_g = (_f = (_e = data === null || data === void 0 ? void 0 : data.choices) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.message) === null || _g === void 0 ? void 0 : _g.content;
                if (typeof text === 'string' && text.trim()) {
                    healthCache = { ok: true, until: Date.now() + 90000 };
                    return text.trim();
                }
            }
            catch (error) {
                console.warn(`Zhipu generate failed (${attempt}/${maxAttempts}):`, error);
                markZhipuUnavailable();
                if (attempt < maxAttempts) {
                    yield new Promise((r) => setTimeout(r, 900 * attempt));
                }
            }
        }
        return null;
    });
}
function callZhipuGenerateStream(prompt, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const key = getZhipuApiKey();
        if (!key)
            return null;
        const model = (options === null || options === void 0 ? void 0 : options.model) || getZhipuModel();
        const messages = [];
        if ((_a = options === null || options === void 0 ? void 0 : options.systemPrompt) === null || _a === void 0 ? void 0 : _a.trim()) {
            messages.push({ role: 'system', content: options.systemPrompt.trim() });
        }
        messages.push({ role: 'user', content: prompt });
        try {
            const res = yield axios_1.default.post(`${getZhipuBaseUrl()}/chat/completions`, {
                model,
                messages,
                temperature: (_b = options === null || options === void 0 ? void 0 : options.temperature) !== null && _b !== void 0 ? _b : 0.45,
                max_tokens: (_c = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _c !== void 0 ? _c : 1024,
                stream: true
            }, {
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                timeout: (_d = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _d !== void 0 ? _d : 90000,
                responseType: 'stream'
            });
            let full = '';
            const stream = res.data;
            yield new Promise((resolve, reject) => {
                let buffer = '';
                stream.on('data', (chunk) => {
                    var _a, _b, _c, _d;
                    buffer += chunk.toString('utf8');
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:'))
                            continue;
                        const payload = trimmed.slice(5).trim();
                        if (payload === '[DONE]')
                            continue;
                        try {
                            const json = JSON.parse(payload);
                            const delta = (_c = (_b = (_a = json === null || json === void 0 ? void 0 : json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.delta) === null || _c === void 0 ? void 0 : _c.content;
                            if (typeof delta === 'string' && delta) {
                                full += delta;
                                (_d = options === null || options === void 0 ? void 0 : options.onToken) === null || _d === void 0 ? void 0 : _d.call(options, delta);
                            }
                        }
                        catch (_e) {
                            /* skip malformed sse */
                        }
                    }
                });
                stream.on('end', () => resolve());
                stream.on('error', reject);
            });
            if (full.trim()) {
                healthCache = { ok: true, until: Date.now() + 90000 };
                return full.trim();
            }
        }
        catch (error) {
            console.warn('Zhipu stream failed:', error);
            markZhipuUnavailable();
        }
        return null;
    });
}
