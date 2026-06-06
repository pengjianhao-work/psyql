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
exports.attachAuth = attachAuth;
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.requirePermission = requirePermission;
exports.requireStudentAccess = requireStudentAccess;
exports.assertSelfUserId = assertSelfUserId;
const sessionService_1 = require("../services/sessionService");
const accountService_1 = require("../services/accountService");
const resolveUserId_1 = require("../utils/resolveUserId");
const authCookie_1 = require("../utils/authCookie");
function attachAuth(req, _res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        const userId = (0, sessionService_1.verifySessionToken)((0, authCookie_1.getTokenFromRequest)(req));
        if (!userId) {
            req.authUser = undefined;
            next();
            return;
        }
        const user = yield (0, accountService_1.getUserById)(userId);
        req.authUser = user !== null && user !== void 0 ? user : undefined;
        next();
    });
}
function requireAuth(req, res, next) {
    if (!req.authUser) {
        res.status(401).json({ error: '未登录或登录已过期' });
        return;
    }
    next();
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.authUser || !roles.includes(req.authUser.role)) {
            res.status(403).json({ error: '无权限访问该资源' });
            return;
        }
        next();
    };
}
/** 需要账号具备指定权限标识（管理员角色自动包含 school:manage 等） */
function requirePermission(...perms) {
    return (req, res, next) => {
        if (!req.authUser) {
            res.status(401).json({ error: '未登录或登录已过期' });
            return;
        }
        const granted = new Set((0, accountService_1.getPermissionsForRole)(req.authUser.role));
        if (granted.has('admin:*')) {
            next();
            return;
        }
        const ok = perms.some((p) => granted.has(p));
        if (!ok) {
            res.status(403).json({ error: '无权限执行该操作' });
            return;
        }
        next();
    };
}
/** 已登录学生，或开发环境下游客 user1/user2 */
function requireStudentAccess(req, res, next) {
    var _a, _b, _c;
    if (req.authUser) {
        if (req.authUser.role !== 'student') {
            res.status(403).json({ error: '仅学生账号可使用该功能' });
            return;
        }
        next();
        return;
    }
    const requested = (0, resolveUserId_1.normalizeUserId)((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : (_c = req.query) === null || _c === void 0 ? void 0 : _c.userId);
    if ((0, resolveUserId_1.isGuestApiAllowed)() && (0, resolveUserId_1.isGuestUserId)(requested)) {
        next();
        return;
    }
    res.status(401).json({ error: '未登录或登录已过期' });
}
/** 学生只能操作自己的 userId */
function assertSelfUserId(req, res, next) {
    var _a, _b, _c, _d;
    const requested = String((_d = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : (_c = req.query) === null || _c === void 0 ? void 0 : _c.userId) !== null && _d !== void 0 ? _d : '');
    if (!req.authUser) {
        next();
        return;
    }
    if (req.authUser.role === 'student' && requested && requested !== req.authUser.id) {
        res.status(403).json({ error: '无权访问其他用户数据' });
        return;
    }
    next();
}
