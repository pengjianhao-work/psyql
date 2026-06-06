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
exports.REPORT_PENDING_MARKER = void 0;
exports.buildPlaceholderReport = buildPlaceholderReport;
exports.isReportPendingText = isReportPendingText;
exports.scheduleReportEnrichment = scheduleReportEnrichment;
const historyManager_1 = require("./historyManager");
const psychStatsService_1 = require("../psych/psychStatsService");
const emotionService_1 = require("../psych/emotionService");
const psychAnalysisService_1 = require("../psych/psychAnalysisService");
const interventionService_1 = require("../psych/interventionService");
const ollamaAvailability_1 = require("../llm/ollamaAvailability");
const portraitQueue_1 = require("../user/portraitQueue");
exports.REPORT_PENDING_MARKER = '详细心理评估报告生成中';
const inFlight = new Set();
function buildFullReport(emotion, risk, problem, interventionName, statModel) {
    const base = (0, emotionService_1.formatEmotionReport)(emotion, risk, problem, interventionName);
    return `${(0, psychStatsService_1.formatStatisticalExecutiveSummary)(statModel)}\n\n${base}\n\n${(0, psychStatsService_1.formatStatisticalReportSection)(statModel)}`;
}
function buildPlaceholderReport(psych) {
    const brief = (0, historyManager_1.rebuildReportFromPsych)(psych);
    return `📊 ${exports.REPORT_PENDING_MARKER}…\n\n（以下为初步概览，完整统计与趋势稍后自动更新）\n\n${brief}`;
}
function isReportPendingText(report) {
    return Boolean(report === null || report === void 0 ? void 0 : report.includes(exports.REPORT_PENDING_MARKER));
}
function scheduleReportEnrichment(params) {
    const key = `${params.userId}:${params.dialogTime}`;
    if (inFlight.has(key))
        return;
    inFlight.add(key);
    void (() => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            const useLlm = !params.loadTestFast && (0, ollamaAvailability_1.shouldUseOllamaLlm)();
            const ollamaOk = useLlm && (yield (0, ollamaAvailability_1.isOllamaAvailable)());
            const psychBundle = ollamaOk
                ? yield (0, psychAnalysisService_1.analyzePsychState)(params.fullText, params.priorEmotion, { tryLlm: true })
                : null;
            const emotion = (_a = psychBundle === null || psychBundle === void 0 ? void 0 : psychBundle.emotion) !== null && _a !== void 0 ? _a : {
                emotion: params.psychSnapshot.emotion,
                confidence: params.psychSnapshot.confidence,
                keywords: [],
                secondaryEmotions: []
            };
            const risk = (_b = psychBundle === null || psychBundle === void 0 ? void 0 : psychBundle.risk) !== null && _b !== void 0 ? _b : {
                level: params.psychSnapshot.risk,
                keywords: [],
                warningMessage: params.psychSnapshot.risk === 'high' || params.psychSnapshot.risk === 'critical'
                    ? '请关注当前风险等级，必要时寻求专业支持。'
                    : '',
                hotline: '全国心理援助热线：400-161-9995'
            };
            const problem = (_c = psychBundle === null || psychBundle === void 0 ? void 0 : psychBundle.problem) !== null && _c !== void 0 ? _c : {
                category: params.psychSnapshot.problem,
                confidence: 0.75,
                keywords: [],
                subcategories: []
            };
            const historySnapshots = (0, historyManager_1.getUserPsychSnapshots)(params.userId);
            const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(emotion, risk, problem);
            const statModel = (0, psychStatsService_1.buildPsychStatModel)(emotion, risk, problem, metrics, historySnapshots);
            const fused = (0, psychStatsService_1.applyStatisticalFusion)(emotion, risk, problem, statModel);
            statModel.compositeScores.riskLevel = fused.risk.level;
            const intervention = (0, interventionService_1.getInterventionPlan)(fused.emotion.emotion, fused.problem.category, fused.risk.level);
            const fullReport = buildFullReport(fused.emotion, fused.risk, fused.problem, intervention.frameworkName, statModel);
            (0, historyManager_1.updateDialogReport)(params.userId, params.dialogTime, fullReport);
            const refinedPsych = Object.assign(Object.assign({}, params.psychSnapshot), { emotion: fused.emotion.emotion, risk: fused.risk.level, problem: fused.problem.category, confidence: fused.emotion.confidence, stressLevel: metrics.stressLevel, anxietyLevel: metrics.anxietyLevel, moodStability: metrics.moodStability, frameworkId: intervention.frameworkId, analysisSources: (_d = psychBundle === null || psychBundle === void 0 ? void 0 : psychBundle.sources) !== null && _d !== void 0 ? _d : params.psychSnapshot.analysisSources });
            (0, historyManager_1.updateDialogPsych)(params.userId, params.dialogTime, refinedPsych);
            (0, portraitQueue_1.schedulePortraitGeneration)({
                userId: params.userId,
                dialogTime: params.dialogTime,
                question: params.question,
                answer: params.answer,
                psychSnapshot: refinedPsych,
                statModel,
                tryLlm: Boolean(psychBundle === null || psychBundle === void 0 ? void 0 : psychBundle.llmUsed) && ollamaOk
            });
        }
        catch (err) {
            console.warn('Async report enrichment failed:', err);
            const fallback = (0, historyManager_1.rebuildReportFromPsych)(params.psychSnapshot);
            (0, historyManager_1.updateDialogReport)(params.userId, params.dialogTime, fallback);
        }
        finally {
            inFlight.delete(key);
        }
    }))();
}
