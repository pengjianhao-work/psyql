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
exports.getEmotionRhythm = getEmotionRhythm;
exports.getCbtModule = getCbtModule;
exports.postCbtComplete = postCbtComplete;
exports.getMemoryTags = getMemoryTags;
exports.patchMemoryTag = patchMemoryTag;
exports.postMemoryBatchArchive = postMemoryBatchArchive;
exports.getSeasonalRag = getSeasonalRag;
exports.getImplicitNeeds = getImplicitNeeds;
exports.getSchoolHeatmap = getSchoolHeatmap;
exports.getInterventionLedgers = getInterventionLedgers;
exports.patchInterventionLedger = patchInterventionLedger;
exports.postKnowledgeReview = postKnowledgeReview;
exports.getKnowledgeReviews = getKnowledgeReviews;
exports.postBatchTranscriptRequest = postBatchTranscriptRequest;
exports.postBatchResolveTranscript = postBatchResolveTranscript;
const resolveUserId_1 = require("../utils/resolveUserId");
const emotionRhythmService_1 = require("../services/psych/emotionRhythmService");
const cbtMicroModuleService_1 = require("../services/psych/cbtMicroModuleService");
const implicitNeedsService_1 = require("../services/psych/implicitNeedsService");
const seasonalRagPolicy_1 = require("../services/knowledge/seasonalRagPolicy");
const memoryTagService_1 = require("../services/user/memoryTagService");
const schoolHeatmapService_1 = require("../services/school/schoolHeatmapService");
const interventionLedgerService_1 = require("../services/school/interventionLedgerService");
const knowledgeReviewService_1 = require("../services/knowledge/knowledgeReviewService");
const transcriptRequestService_1 = require("../services/school/transcriptRequestService");
const accountService_1 = require("../services/user/accountService");
function getEmotionRhythm(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const month = req.query.month ? String(req.query.month) : undefined;
    res.json((0, emotionRhythmService_1.buildEmotionRhythmCalendar)(userId, month));
}
function getCbtModule(req, res) {
    const problem = req.query.problem ? String(req.query.problem) : undefined;
    const emotion = req.query.emotion ? String(req.query.emotion) : undefined;
    res.json({ module: (0, cbtMicroModuleService_1.pickCbtModule)(problem, emotion) });
}
function postCbtComplete(req, res) {
    var _a, _b, _c;
    const module = (0, cbtMicroModuleService_1.pickCbtModule)((_a = req.body) === null || _a === void 0 ? void 0 : _a.problem, (_b = req.body) === null || _b === void 0 ? void 0 : _b.emotion);
    const selections = (((_c = req.body) === null || _c === void 0 ? void 0 : _c.selections) || {});
    const result = (0, cbtMicroModuleService_1.scoreCbtCompletion)(module, selections);
    res.json(Object.assign(Object.assign({}, result), { bonus: module.completionBonus }));
}
function getMemoryTags(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const tag = req.query.tag ? String(req.query.tag) : undefined;
    res.json({ memories: (0, memoryTagService_1.listMemoryMeta)(userId, tag) });
}
function patchMemoryTag(req, res) {
    var _a, _b, _c, _d, _e;
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
    if (!userId)
        return;
    const dialogTime = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.dialogTime) || '');
    if (!dialogTime) {
        res.status(400).json({ error: '缺少 dialogTime' });
        return;
    }
    const entry = (0, memoryTagService_1.upsertMemoryMeta)(userId, dialogTime, {
        tags: (_c = req.body) === null || _c === void 0 ? void 0 : _c.tags,
        locked: (_d = req.body) === null || _d === void 0 ? void 0 : _d.locked,
        archived: (_e = req.body) === null || _e === void 0 ? void 0 : _e.archived
    });
    res.json({ memory: entry });
}
function postMemoryBatchArchive(req, res) {
    var _a, _b, _c;
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
    if (!userId)
        return;
    const dialogTimes = Array.isArray((_b = req.body) === null || _b === void 0 ? void 0 : _b.dialogTimes) ? req.body.dialogTimes : [];
    const archived = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.archived) !== false;
    const count = (0, memoryTagService_1.batchArchiveMemories)(userId, dialogTimes, archived);
    res.json({ message: `已${archived ? '归档' : '取消归档'} ${count} 条`, count });
}
function getSeasonalRag(req, res) {
    res.json((0, seasonalRagPolicy_1.getSeasonalRagBoost)());
}
function getImplicitNeeds(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const question = String(req.query.question || '');
    res.json({ hints: (0, implicitNeedsService_1.mineImplicitNeeds)(userId, question) });
}
function getSchoolHeatmap(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const month = req.query.month ? String(req.query.month) : undefined;
        const payload = yield (0, schoolHeatmapService_1.buildSchoolHeatmap)(req.authUser, month);
        res.json(payload);
    });
}
function getInterventionLedgers(req, res) {
    var _a;
    const user = req.authUser;
    const orgIds = user.role === 'admin'
        ? undefined
        : ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length)
            ? user.managedOrgIds
            : user.orgId
                ? [user.orgId]
                : undefined;
    res.json({
        records: (0, interventionLedgerService_1.listInterventionLedgers)(orgIds),
        overdue: (0, interventionLedgerService_1.getOverdueFollowUps)(orgIds)
    });
}
function patchInterventionLedger(req, res) {
    var _a, _b, _c, _d, _e;
    const id = String(req.params.id || '');
    const updated = (0, interventionLedgerService_1.updateInterventionLedger)(id, {
        status: (_a = req.body) === null || _a === void 0 ? void 0 : _a.status,
        meetingNotes: (_b = req.body) === null || _b === void 0 ? void 0 : _b.meetingNotes,
        measures: (_c = req.body) === null || _c === void 0 ? void 0 : _c.measures,
        nextFollowUpAt: (_d = req.body) === null || _d === void 0 ? void 0 : _d.nextFollowUpAt,
        closedAt: (_e = req.body) === null || _e === void 0 ? void 0 : _e.closedAt
    });
    if (!updated) {
        res.status(404).json({ error: '未找到台账' });
        return;
    }
    res.json({ record: updated });
}
function postKnowledgeReview(req, res) {
    var _a, _b, _c, _d;
    const user = req.authUser;
    const verdict = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.verdict) || 'partial');
    const entry = (0, knowledgeReviewService_1.submitKnowledgeReview)({
        knowledgeQuestion: String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.question) || ''),
        knowledgeAnswerPreview: String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.answerPreview) || '').slice(0, 500),
        verdict,
        reviewerId: user.id,
        reviewerName: user.displayName,
        comment: ((_d = req.body) === null || _d === void 0 ? void 0 : _d.comment) ? String(req.body.comment) : undefined
    });
    res.status(201).json({ review: entry });
}
function getKnowledgeReviews(_req, res) {
    res.json({ reviews: (0, knowledgeReviewService_1.listKnowledgeReviews)() });
}
function postBatchTranscriptRequest(req, res) {
    var _a, _b;
    const user = req.authUser;
    if (user.role !== 'counselor' && user.role !== 'admin') {
        res.status(403).json({ error: '仅辅导员可批量申请' });
        return;
    }
    const studentIds = Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.studentIds) ? req.body.studentIds : [];
    if (!studentIds.length) {
        res.status(400).json({ error: '缺少 studentIds' });
        return;
    }
    const created = (0, transcriptRequestService_1.batchCreateTranscriptRequests)({
        studentIds,
        counselorId: user.id,
        counselorName: user.displayName,
        orgId: user.orgId || 'default',
        reason: String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.reason) || '班级建档批量授权申请')
    });
    res.status(201).json({ message: `已提交 ${created.length} 条授权申请`, requests: created });
}
function postBatchResolveTranscript(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
        if (!userId)
            return;
        const requestIds = Array.isArray((_b = req.body) === null || _b === void 0 ? void 0 : _b.requestIds) ? req.body.requestIds : [];
        const approve = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.approve) === true;
        const count = (0, transcriptRequestService_1.batchResolveTranscriptRequests)(userId, requestIds, approve);
        if (approve && count > 0) {
            yield (0, accountService_1.updateStudentProfile)(userId, { allowSchoolTranscriptView: true });
        }
        res.json({ message: approve ? `已同意 ${count} 条` : `已拒绝 ${count} 条`, count });
    });
}
