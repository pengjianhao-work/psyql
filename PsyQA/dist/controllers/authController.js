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
exports.getColleges = exports.patchProfile = exports.getMe = exports.postLogout = exports.postLogin = exports.postRegister = void 0;
const sessionService_1 = require("../services/sessionService");
const accountService_1 = require("../services/accountService");
const orgService_1 = require("../services/orgService");
const authCookie_1 = require("../utils/authCookie");
const postRegister = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: '用户名与密码不能为空' });
        return;
    }
    const result = yield (0, accountService_1.registerAccount)(String(username), String(password), displayName ? String(displayName) : undefined);
    if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
    }
    const token = (0, sessionService_1.createSessionToken)(result.user.id);
    (0, authCookie_1.setAuthCookie)(res, token);
    res.status(201).json({ token, user: result.user });
});
exports.postRegister = postRegister;
const postLogin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: '用户名与密码不能为空' });
        return;
    }
    const result = yield (0, accountService_1.verifyLogin)(String(username), String(password));
    if (!result.ok) {
        res.status(401).json({ error: result.error });
        return;
    }
    const token = (0, sessionService_1.createSessionToken)(result.user.id);
    (0, authCookie_1.setAuthCookie)(res, token);
    res.json({ token, user: result.user });
});
exports.postLogin = postLogin;
const postLogout = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    (0, authCookie_1.clearAuthCookie)(res);
    res.json({ ok: true });
});
exports.postLogout = postLogout;
const getMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = (0, sessionService_1.verifySessionToken)((0, authCookie_1.getTokenFromRequest)(req));
    if (!userId) {
        res.status(401).json({ error: '未登录或登录已过期' });
        return;
    }
    const user = yield (0, accountService_1.getUserById)(userId);
    if (!user) {
        res.status(401).json({ error: '账号不存在' });
        return;
    }
    res.json({ user });
});
exports.getMe = getMe;
const patchProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.authUser;
    const body = req.body;
    const result = yield (0, accountService_1.updateStudentProfile)(user.id, {
        className: body.className !== undefined ? String(body.className) : undefined,
        orgId: body.orgId !== undefined ? String(body.orgId) : undefined,
        displayName: body.displayName !== undefined ? String(body.displayName) : undefined,
        avatar: body.avatar !== undefined ? String(body.avatar) : undefined,
        studentNo: body.studentNo !== undefined ? String(body.studentNo) : undefined,
        realName: body.realName !== undefined ? String(body.realName) : undefined,
        gender: body.gender !== undefined ? String(body.gender) : undefined,
        allowSchoolTranscriptView: body.allowSchoolTranscriptView !== undefined ? Boolean(body.allowSchoolTranscriptView) : undefined
    });
    if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
    }
    res.json({ user: result.user });
});
exports.patchProfile = patchProfile;
const getColleges = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json({ colleges: (0, orgService_1.listCollegeOptions)() });
});
exports.getColleges = getColleges;
