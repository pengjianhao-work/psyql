"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postSelfRating = void 0;
const historyManager_1 = require("../services/historyManager");
const psychStatsService_1 = require("../services/psychStatsService");
const postSelfRating = (req, res) => {
    const { userId, dialogTime, moodRating, stressRating, anxietyRating } = req.body;
    const uid = String(userId || 'default_user').trim();
    const time = dialogTime ? String(dialogTime) : undefined;
    const mood = clampRating(moodRating);
    const stress = clampRating(stressRating);
    const anxiety = clampRating(anxietyRating);
    if (mood === undefined && stress === undefined && anxiety === undefined) {
        res.status(400).json({ error: '请至少提供 moodRating、stressRating 或 anxietyRating 之一（1-10）' });
        return;
    }
    const updated = (0, historyManager_1.updateDialogSelfRating)(uid, time, {
        userSelfRating: mood,
        selfRatedStress: stress,
        selfRatedAnxiety: anxiety
    });
    if (!updated) {
        res.status(404).json({ error: '未找到可更新的咨询记录，请先完成一次对话' });
        return;
    }
    const allSnapshots = (0, historyManager_1.getUserPsychSnapshots)(uid);
    const history = allSnapshots.slice(0, -1);
    const statModel = (0, psychStatsService_1.rebuildStatModelFromSnapshot)(updated, history);
    res.json({
        message: '自评已保存，报告已更新',
        psych: updated,
        statModel
    });
};
exports.postSelfRating = postSelfRating;
function clampRating(v) {
    if (v === undefined || v === null || v === '')
        return undefined;
    const n = Number(v);
    if (!Number.isFinite(n))
        return undefined;
    return Math.min(10, Math.max(1, Math.round(n)));
}
