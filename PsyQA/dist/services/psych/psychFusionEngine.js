"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runThreeLayerFusion = runThreeLayerFusion;
const psychFeatureEngine_1 = require("./psychFeatureEngine");
const psychMLEngine_1 = require("./psychMLEngine");
const psychNeuralEngine_1 = require("./psychNeuralEngine");
function clamp100(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
}
function fuse3(a, b, c, w) {
    return clamp100(a * w.s + b * w.m + c * w.n);
}
function runThreeLayerFusion(emotion, risk, problem, metrics, historySnapshots, statScores) {
    const config = (0, psychMLEngine_1.loadModelWeights)();
    const fw = config.fusionWeights;
    const wSum = fw.statistical + fw.machineLearning + fw.neuralNetwork;
    const w = {
        s: fw.statistical / wSum,
        m: fw.machineLearning / wSum,
        n: fw.neuralNetwork / wSum
    };
    const features = (0, psychFeatureEngine_1.extractPsychFeatures)(emotion, risk, problem, metrics, historySnapshots, statScores.distress, statScores.wellbeing);
    const histStress = historySnapshots.map((s) => s.stressLevel);
    const histAnxiety = historySnapshots.map((s) => s.anxietyLevel);
    const histMood = historySnapshots.map((s) => s.moodStability);
    const ml = (0, psychMLEngine_1.runMLLayer)(metrics, features, emotion.emotion, risk.level, histStress, histAnxiety, histMood);
    const neural = (0, psychNeuralEngine_1.runNeuralFromFeatures)(features);
    const fused = {
        stress: fuse3(metrics.stressLevel, ml.metrics.stressLevel, metrics.stressLevel * 0.55 + neural.predictedNextStress * 0.45, w),
        anxiety: fuse3(metrics.anxietyLevel, ml.metrics.anxietyLevel, metrics.anxietyLevel * 0.7 + neural.predictedNextAnxiety * 0.3, w),
        mood: fuse3(metrics.moodStability, ml.metrics.moodStability, metrics.moodStability * 0.75 + neural.wellbeing * 0.25, w),
        distress: fuse3(statScores.distress, ml.distress, neural.distress, w),
        wellbeing: fuse3(statScores.wellbeing, ml.wellbeing, neural.wellbeing, w),
        functionalCapacity: fuse3(statScores.functionalCapacity, ml.functionalCapacity, neural.functionalCapacity, w)
    };
    return {
        fused,
        statistical: statScores,
        ml,
        neural,
        fusionWeights: fw,
        architectureVersion: '3.0-stat-ml-nn'
    };
}
