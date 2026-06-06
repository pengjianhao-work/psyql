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
exports.postAnalyzePsych = void 0;
const psychAnalysisService_1 = require("../services/psychAnalysisService");
const carePlanHints_1 = require("../services/carePlanHints");
const emotionService_1 = require("../services/emotionService");
const interventionService_1 = require("../services/interventionService");
const psychStatsService_1 = require("../services/psychStatsService");
const postAnalyzePsych = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { text, tryLlm } = req.body;
    if (!text || !String(text).trim()) {
        res.status(400).json({ error: '请提供 text 字段' });
        return;
    }
    const bundle = yield (0, psychAnalysisService_1.analyzePsychState)(String(text).trim(), undefined, {
        tryLlm: tryLlm !== false
    });
    const intervention = (0, interventionService_1.getInterventionPlan)(bundle.emotion.emotion, bundle.problem.category, bundle.risk.level);
    const carePlan = (0, carePlanHints_1.getCarePlanSuggestion)(bundle.problem.category);
    const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(bundle.emotion, bundle.risk, bundle.problem);
    const statModel = (0, psychStatsService_1.buildPsychStatModel)(bundle.emotion, bundle.risk, bundle.problem, metrics, []);
    const baseReport = (0, emotionService_1.formatEmotionReport)(bundle.emotion, bundle.risk, bundle.problem, intervention.frameworkName);
    const report = `${baseReport}\n\n${(0, psychStatsService_1.formatStatisticalReportSection)(statModel)}`;
    res.json(Object.assign(Object.assign({}, bundle), { emotionStyle: (0, emotionService_1.getEmotionStyle)(bundle.emotion.emotion), intervention: {
            frameworkId: intervention.frameworkId,
            frameworkName: intervention.frameworkName
        }, carePlan,
        statModel,
        report, problemName: (0, emotionService_1.getCategoryName)(bundle.problem.category) }));
});
exports.postAnalyzePsych = postAnalyzePsych;
