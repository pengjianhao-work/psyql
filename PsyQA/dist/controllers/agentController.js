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
exports.getUserAgentProfileHandler = getUserAgentProfileHandler;
exports.patchUserAgentProfileHandler = patchUserAgentProfileHandler;
exports.getUserAgentProfileAdmin = getUserAgentProfileAdmin;
exports.exportUserAgentProfileHandler = exportUserAgentProfileHandler;
exports.listUserAgentMemoriesHandler = listUserAgentMemoriesHandler;
exports.deleteUserAgentMemoryHandler = deleteUserAgentMemoryHandler;
const resolveUserId_1 = require("../utils/resolveUserId");
const userAgentStore_1 = require("../db/userAgentStore");
const userMemoryService_1 = require("../services/user/userMemoryService");
function getUserAgentProfileHandler(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const profile = (0, userAgentStore_1.ensureUserAgentProfile)(userId);
    const weights = (0, userMemoryService_1.getRagBlendWeights)(userId);
    const phase = (0, userMemoryService_1.resolveAgentPhase)(userId);
    res.json(Object.assign(Object.assign({}, profile), { phase, ragWeights: weights }));
}
function patchUserAgentProfileHandler(req, res) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
    if (!userId)
        return;
    const body = req.body;
    const current = (0, userAgentStore_1.ensureUserAgentProfile)(userId);
    const patch = {};
    if (body.basic !== undefined) {
        patch.basicJson = Object.assign(Object.assign({}, ((_b = current.basicJson) !== null && _b !== void 0 ? _b : {})), body.basic);
    }
    if (body.intervention !== undefined) {
        patch.interventionJson = {
            effectiveApproaches: (_e = (_c = body.intervention.effectiveApproaches) !== null && _c !== void 0 ? _c : (_d = current.interventionJson) === null || _d === void 0 ? void 0 : _d.effectiveApproaches) !== null && _e !== void 0 ? _e : [],
            avoidPhrases: (_h = (_f = body.intervention.avoidPhrases) !== null && _f !== void 0 ? _f : (_g = current.interventionJson) === null || _g === void 0 ? void 0 : _g.avoidPhrases) !== null && _h !== void 0 ? _h : [],
            sensitiveTopics: (_l = (_j = body.intervention.sensitiveTopics) !== null && _j !== void 0 ? _j : (_k = current.interventionJson) === null || _k === void 0 ? void 0 : _k.sensitiveTopics) !== null && _l !== void 0 ? _l : [],
            preferredTone: (_m = body.intervention.preferredTone) !== null && _m !== void 0 ? _m : (_o = current.interventionJson) === null || _o === void 0 ? void 0 : _o.preferredTone
        };
    }
    if (body.agentSystemPrompt !== undefined) {
        patch.agentSystemPrompt = body.agentSystemPrompt;
    }
    const updated = (0, userAgentStore_1.updateUserAgentProfile)(userId, patch);
    res.json({
        message: '专属画像已更新',
        profile: updated,
        phase: (0, userMemoryService_1.resolveAgentPhase)(userId),
        ragWeights: (0, userMemoryService_1.getRagBlendWeights)(userId)
    });
}
function getUserAgentProfileAdmin(req, res) {
    const userId = String(req.query.userId || '');
    if (!userId) {
        res.status(400).json({ error: '缺少 userId' });
        return;
    }
    const profile = (0, userAgentStore_1.getUserAgentProfile)(userId);
    if (!profile) {
        res.status(404).json({ error: '用户画像不存在' });
        return;
    }
    res.json(Object.assign(Object.assign({}, profile), { phase: (0, userMemoryService_1.resolveAgentPhase)(userId), ragWeights: (0, userMemoryService_1.getRagBlendWeights)(userId) }));
}
function exportUserAgentProfileHandler(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const bundle = (0, userMemoryService_1.buildAgentExportBundle)(userId);
    const filename = `psyqa-agent-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(bundle, null, 2));
}
function listUserAgentMemoriesHandler(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    res.json({ memories: (0, userMemoryService_1.listUserDialogMemories)(userId) });
}
function deleteUserAgentMemoryHandler(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
        if (!userId)
            return;
        const dialogTime = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.dialogTime) || '');
        if (!dialogTime) {
            res.status(400).json({ error: '缺少 dialogTime' });
            return;
        }
        const result = yield (0, userMemoryService_1.deleteUserDialogMemory)(userId, dialogTime);
        res.json(Object.assign({ message: result.deleted ? '记忆已删除' : '未找到该记忆' }, result));
    });
}
