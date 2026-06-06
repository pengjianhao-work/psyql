"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUserId = normalizeUserId;
exports.isGuestApiAllowed = isGuestApiAllowed;
exports.isGuestUserId = isGuestUserId;
exports.resolveUserId = resolveUserId;
exports.resolveStudentUserId = resolveStudentUserId;
const GUEST_USER_PATTERN = /^user\d+$/;
function normalizeUserId(raw) {
    const userId = String(raw || 'default_user').trim();
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return safe.slice(0, 64) || 'default_user';
}
function isGuestApiAllowed() {
    return process.env.PSYQA_ALLOW_GUEST === '1' || process.env.NODE_ENV !== 'production';
}
function isGuestUserId(userId) {
    return GUEST_USER_PATTERN.test(userId);
}
/** Resolve effective user id; returns null if forbidden */
function resolveUserId(req, res, raw) {
    var _a, _b, _c, _d;
    const requested = normalizeUserId((_b = raw !== null && raw !== void 0 ? raw : (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : (_c = req.query) === null || _c === void 0 ? void 0 : _c.userId);
    if (((_d = req.authUser) === null || _d === void 0 ? void 0 : _d.role) === 'student') {
        if (requested !== req.authUser.id) {
            res.status(403).json({ error: '无权访问其他用户数据' });
            return null;
        }
        return req.authUser.id;
    }
    if (req.authUser) {
        return requested;
    }
    if (isGuestApiAllowed() && isGuestUserId(requested)) {
        return requested;
    }
    res.status(401).json({ error: '未登录或登录已过期' });
    return null;
}
function resolveStudentUserId(req, res, raw) {
    var _a, _b, _c;
    if (!req.authUser) {
        if (isGuestApiAllowed()) {
            const requested = normalizeUserId((_b = raw !== null && raw !== void 0 ? raw : (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : (_c = req.query) === null || _c === void 0 ? void 0 : _c.userId);
            if (isGuestUserId(requested))
                return requested;
        }
        res.status(401).json({ error: '未登录或登录已过期' });
        return null;
    }
    if (req.authUser.role !== 'student') {
        res.status(403).json({ error: '仅学生账号可使用该功能' });
        return null;
    }
    return resolveUserId(req, res, req.authUser.id);
}
