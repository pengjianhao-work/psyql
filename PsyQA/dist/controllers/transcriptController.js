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
exports.postCounselorTranscriptRequest = postCounselorTranscriptRequest;
exports.getStudentTranscriptRequests = getStudentTranscriptRequests;
exports.postResolveTranscriptRequest = postResolveTranscriptRequest;
exports.getCounselorTranscriptRequests = getCounselorTranscriptRequests;
const resolveUserId_1 = require("../utils/resolveUserId");
const accountService_1 = require("../services/user/accountService");
const transcriptRequestService_1 = require("../services/school/transcriptRequestService");
function postCounselorTranscriptRequest(req, res) {
    var _a, _b;
    const user = req.authUser;
    if (user.role !== 'counselor' && user.role !== 'admin') {
        res.status(403).json({ error: '仅辅导员可发起申请' });
        return;
    }
    const studentId = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.studentId) || '');
    const reason = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.reason) || '工作需要查看对话原文');
    if (!studentId) {
        res.status(400).json({ error: '缺少 studentId' });
        return;
    }
    const reqRow = (0, transcriptRequestService_1.createTranscriptRequest)({
        studentId,
        counselorId: user.id,
        counselorName: user.displayName,
        orgId: user.orgId || 'default',
        reason
    });
    res.status(201).json({ message: '已提交查看申请，等待学生确认', request: reqRow });
}
function getStudentTranscriptRequests(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    res.json({ requests: (0, transcriptRequestService_1.listTranscriptRequestsForStudent)(userId) });
}
function postResolveTranscriptRequest(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
        if (!userId)
            return;
        const requestId = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.requestId) || '');
        const approve = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.approve) === true;
        if (!requestId) {
            res.status(400).json({ error: '缺少 requestId' });
            return;
        }
        const updated = (0, transcriptRequestService_1.resolveTranscriptRequest)(requestId, userId, approve);
        if (!updated) {
            res.status(404).json({ error: '未找到申请' });
            return;
        }
        if (approve) {
            yield (0, accountService_1.updateStudentProfile)(userId, { allowSchoolTranscriptView: true });
        }
        res.json({
            message: approve ? '已授权辅导员查看对话原文' : '已拒绝该申请',
            request: updated
        });
    });
}
function getCounselorTranscriptRequests(req, res) {
    const user = req.authUser;
    res.json({ requests: (0, transcriptRequestService_1.listTranscriptRequestsForCounselor)(user.id) });
}
