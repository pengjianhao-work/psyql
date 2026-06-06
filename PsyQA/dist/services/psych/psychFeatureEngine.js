"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalize100 = normalize100;
exports.extractPsychFeatures = extractPsychFeatures;
exports.featuresToNeuralInput = featuresToNeuralInput;
const emotionService_1 = require("./emotionService");
const RISK_NUM = {
    low: 0.12,
    medium: 0.38,
    high: 0.68,
    critical: 0.92
};
const ALL_EMOTIONS = [
    'happy', 'sad', 'anxious', 'angry', 'lonely', 'neutral',
    'hopeful', 'confused', 'frustrated', 'guilty', 'shameful', 'proud'
];
function normalize100(v) {
    return Math.max(0, Math.min(1, v / 100));
}
function extractPsychFeatures(emotion, risk, problem, metrics, historySnapshots, statDistress, statWellbeing) {
    const series = [...historySnapshots];
    const stressSeries = series.map((s) => s.stressLevel);
    const anxietySeries = series.map((s) => s.anxietyLevel);
    const slope = (vals) => {
        if (vals.length < 2)
            return 0;
        return (vals[vals.length - 1] - vals[0]) / (vals.length - 1);
    };
    const std = (vals) => {
        if (vals.length < 2)
            return 0;
        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        return Math.sqrt(vals.reduce((a, v) => a + Math.pow((v - m), 2), 0) / vals.length);
    };
    const baselineStress = stressSeries.length > 0
        ? stressSeries.slice(0, Math.min(3, stressSeries.length)).reduce((a, b) => a + b, 0) /
            Math.min(3, stressSeries.length)
        : metrics.stressLevel;
    const baselineAnxiety = anxietySeries.length > 0
        ? anxietySeries.slice(0, Math.min(3, anxietySeries.length)).reduce((a, b) => a + b, 0) /
            Math.min(3, anxietySeries.length)
        : metrics.anxietyLevel;
    const last = series[series.length - 1];
    const emotionOneHot = ALL_EMOTIONS.reduce((acc, e) => {
        acc[e] = emotion.emotion === e ? 1 : 0;
        return acc;
    }, {});
    return {
        stress: normalize100(metrics.stressLevel),
        anxiety: normalize100(metrics.anxietyLevel),
        mood: normalize100(metrics.moodStability),
        distress: normalize100(statDistress),
        wellbeing: normalize100(statWellbeing),
        emotionConfidence: emotion.confidence,
        problemConfidence: problem.confidence,
        riskNumeric: RISK_NUM[risk.level],
        keywordIntensity: Math.min(1, (emotion.keywords.length + problem.keywords.length) / 8),
        selfRatedStress: (last === null || last === void 0 ? void 0 : last.selfRatedStress) !== undefined ? last.selfRatedStress / 10 : undefined,
        selfRatedAnxiety: (last === null || last === void 0 ? void 0 : last.selfRatedAnxiety) !== undefined ? last.selfRatedAnxiety / 10 : undefined,
        selfRatedMood: (last === null || last === void 0 ? void 0 : last.userSelfRating) !== undefined ? last.userSelfRating / 10 : undefined,
        slopeStress: slope(stressSeries) / 100,
        slopeAnxiety: slope(anxietySeries) / 100,
        volatilityStress: std(stressSeries) / 100,
        baselineDeltaStress: (metrics.stressLevel - baselineStress) / 100,
        baselineDeltaAnxiety: (metrics.anxietyLevel - baselineAnxiety) / 100,
        sessionIndex: series.length + 1,
        emotionOneHot,
        problemCategory: (0, emotionService_1.getCategoryName)(problem.category)
    };
}
function featuresToNeuralInput(f) {
    var _a, _b, _c, _d, _e, _f;
    const positiveEmotion = ((_a = f.emotionOneHot.happy) !== null && _a !== void 0 ? _a : 0) + ((_b = f.emotionOneHot.hopeful) !== null && _b !== void 0 ? _b : 0) + ((_c = f.emotionOneHot.proud) !== null && _c !== void 0 ? _c : 0);
    return [
        f.stress,
        f.anxiety,
        f.mood,
        f.distress,
        f.wellbeing,
        f.emotionConfidence,
        f.problemConfidence,
        f.riskNumeric,
        f.keywordIntensity,
        (_d = f.selfRatedStress) !== null && _d !== void 0 ? _d : f.stress,
        (_e = f.selfRatedAnxiety) !== null && _e !== void 0 ? _e : f.anxiety,
        (_f = f.selfRatedMood) !== null && _f !== void 0 ? _f : f.mood,
        f.slopeStress,
        f.slopeAnxiety,
        f.volatilityStress,
        f.baselineDeltaStress,
        f.baselineDeltaAnxiety,
        Math.min(1, f.sessionIndex / 10),
        positiveEmotion
    ];
}
