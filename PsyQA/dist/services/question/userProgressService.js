"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLatestAssessment = buildLatestAssessment;
exports.getUserProgressData = getUserProgressData;
const historyManager_1 = require("../common/historyManager");
const psychStatsService_1 = require("../psych/psychStatsService");
const emotionService_1 = require("../psych/emotionService");
const interventionService_1 = require("../psych/interventionService");
function buildFullReport(emotion, risk, problem, interventionName, statModel) {
    const base = (0, emotionService_1.formatEmotionReport)(emotion, risk, problem, interventionName);
    return base;
}
function buildLatestAssessment(userId) {
    const snapshots = (0, historyManager_1.getUserPsychSnapshots)(userId);
    if (!snapshots.length)
        return null;
    const last = snapshots[snapshots.length - 1];
    const history = snapshots.slice(0, -1);
    const emotion = {
        emotion: last.emotion,
        confidence: last.confidence,
        keywords: [],
        secondaryEmotions: []
    };
    const risk = {
        level: last.risk,
        keywords: [],
        warningMessage: last.risk === 'high' || last.risk === 'critical' ? '请关注当前风险等级，必要时寻求专业支持。' : '',
        hotline: '全国心理援助热线：400-161-9995'
    };
    const problem = {
        category: last.problem,
        confidence: 0.7,
        keywords: [],
        subcategories: []
    };
    const statModel = (0, psychStatsService_1.rebuildStatModelFromSnapshot)(last, history);
    const fused = (0, psychStatsService_1.applyStatisticalFusion)(emotion, risk, problem, statModel);
    const intervention = (0, interventionService_1.getInterventionPlan)(fused.emotion.emotion, fused.problem.category, fused.risk.level);
    const userData = (0, historyManager_1.getUserHistory)(userId);
    const lastDialog = userData === null || userData === void 0 ? void 0 : userData.dialogs[userData.dialogs.length - 1];
    const report = (lastDialog === null || lastDialog === void 0 ? void 0 : lastDialog.report) ||
        buildFullReport(fused.emotion, fused.risk, fused.problem, intervention.frameworkName, statModel);
    return {
        emotion: fused.emotion,
        risk: fused.risk,
        problem: fused.problem,
        report,
        statModel,
        emotionStyle: (0, emotionService_1.getEmotionStyle)(fused.emotion.emotion)
    };
}
function getUserProgressData(userId) {
    var _a;
    const userData = (0, historyManager_1.getUserHistory)(userId);
    if (!userData) {
        return { totalTimes: 0, history: [] };
    }
    const latestAssessment = (_a = buildLatestAssessment(userId)) !== null && _a !== void 0 ? _a : undefined;
    return {
        totalTimes: userData.total_times,
        latestAssessment,
        history: userData.dialogs.map((d) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return ({
                time: d.time,
                user: d.user,
                bot: d.bot,
                summary: d.summary,
                report: d.report || (d.psych ? (0, historyManager_1.rebuildReportFromPsych)(d.psych) : d.summary),
                stressLevel: (_a = d.psych) === null || _a === void 0 ? void 0 : _a.stressLevel,
                anxietyLevel: (_b = d.psych) === null || _b === void 0 ? void 0 : _b.anxietyLevel,
                moodStability: (_c = d.psych) === null || _c === void 0 ? void 0 : _c.moodStability,
                emotion: (_d = d.psych) === null || _d === void 0 ? void 0 : _d.emotion,
                risk: (_e = d.psych) === null || _e === void 0 ? void 0 : _e.risk,
                problem: (_f = d.psych) === null || _f === void 0 ? void 0 : _f.problem,
                userSelfRating: (_g = d.psych) === null || _g === void 0 ? void 0 : _g.userSelfRating,
                selfRatedStress: (_h = d.psych) === null || _h === void 0 ? void 0 : _h.selfRatedStress,
                selfRatedAnxiety: (_j = d.psych) === null || _j === void 0 ? void 0 : _j.selfRatedAnxiety,
                portrait: d.portrait
                    ? {
                        summary: d.portrait.summary,
                        emotionalPresentation: d.portrait.emotionalPresentation,
                        recommendedFocus: d.portrait.recommendedFocus,
                        llmUsed: d.portrait.llmUsed
                    }
                    : undefined
            });
        })
    };
}
