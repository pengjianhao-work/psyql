"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionToken = createSessionToken;
exports.assertAuthSecretConfigured = assertAuthSecretConfigured;
exports.verifySessionToken = verifySessionToken;
const crypto_1 = __importDefault(require("crypto"));
const getSecret = () => process.env.AUTH_SECRET || 'psyqa-dev-secret-change-me';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
function createSessionToken(userId) {
    const exp = Date.now() + TTL_MS;
    const payload = Buffer.from(JSON.stringify({ sub: userId, exp }), 'utf8').toString('base64url');
    const sig = crypto_1.default.createHmac('sha256', getSecret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}
function assertAuthSecretConfigured() {
    if (process.env.NODE_ENV === 'production') {
        const secret = process.env.AUTH_SECRET || '';
        if (secret.length < 16) {
            throw new Error('生产环境必须设置 AUTH_SECRET（至少 16 字符）');
        }
    }
}
function verifySessionToken(token) {
    if (!token || typeof token !== 'string')
        return null;
    const trimmed = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    const dot = trimmed.indexOf('.');
    if (dot < 0)
        return null;
    const payload = trimmed.slice(0, dot);
    const sig = trimmed.slice(dot + 1);
    const expected = crypto_1.default.createHmac('sha256', getSecret()).update(payload).digest('base64url');
    if (sig.length !== expected.length || !crypto_1.default.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
    }
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!data.sub || typeof data.exp !== 'number' || data.exp < Date.now())
            return null;
        return data.sub;
    }
    catch (_a) {
        return null;
    }
}
