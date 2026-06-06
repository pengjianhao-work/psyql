"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_COOKIE_NAME = void 0;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;
exports.getTokenFromRequest = getTokenFromRequest;
exports.AUTH_COOKIE_NAME = 'psyqa_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
function setAuthCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production';
    res.cookie(exports.AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: MAX_AGE_MS,
        path: '/'
    });
}
function clearAuthCookie(res) {
    res.clearCookie(exports.AUTH_COOKIE_NAME, { path: '/' });
}
function getTokenFromRequest(req) {
    var _a;
    const cookieToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[exports.AUTH_COOKIE_NAME];
    if (typeof cookieToken === 'string' && cookieToken.trim()) {
        return cookieToken.trim();
    }
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string')
        return undefined;
    return header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
}
