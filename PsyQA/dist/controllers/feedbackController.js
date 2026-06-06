"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postSessionFeedback = postSessionFeedback;
exports.getSessionFeedbackForDialog = getSessionFeedbackForDialog;
exports.getUserProfileHandler = getUserProfileHandler;
const resolveUserId_1 = require("../utils/resolveUserId");
const feedbackStore_1 = require("../db/feedbackStore");
const userProfileService_1 = require("../services/user/userProfileService");
function postSessionFeedback(req, res) {
    var _a;
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
    if (!userId)
        return;
    const { dialogTime, rating, helpful, comment } = req.body;
    if (!dialogTime) {
        res.status(400).json({ error: '缺少 dialogTime' });
        return;
    }
    const time = String(dialogTime);
    if (!(0, feedbackStore_1.dialogExists)(userId, time)) {
        res.status(404).json({ error: '未找到对应咨询记录' });
        return;
    }
    if (rating === undefined && helpful === undefined && !(comment === null || comment === void 0 ? void 0 : comment.trim())) {
        res.status(400).json({ error: '请至少提供评分、是否有帮助或文字反馈之一' });
        return;
    }
    if (rating !== undefined) {
        const n = Number(rating);
        if (!Number.isFinite(n) || n < 1 || n > 5) {
            res.status(400).json({ error: 'rating 须为 1-5 的整数' });
            return;
        }
    }
    const feedback = (0, feedbackStore_1.saveSessionFeedback)(userId, time, { rating, helpful, comment });
    const profile = (0, userProfileService_1.refreshUserProfile)(userId);
    res.json({
        message: '反馈已保存',
        feedback,
        profile
    });
}
function getSessionFeedbackForDialog(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const dialogTime = String(req.query.dialogTime || '');
    if (!dialogTime) {
        res.status(400).json({ error: '缺少 dialogTime' });
        return;
    }
    const feedback = (0, feedbackStore_1.getSessionFeedback)(userId, dialogTime);
    res.json({ feedback });
}
function getUserProfileHandler(req, res) {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const profile = refresh ? (0, userProfileService_1.refreshUserProfile)(userId) : (0, userProfileService_1.getOrRefreshUserProfile)(userId);
    res.json(profile);
}
