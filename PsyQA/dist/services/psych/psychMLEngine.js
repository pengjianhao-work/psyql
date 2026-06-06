"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLUSTER_LABELS = void 0;
exports.loadModelWeights = loadModelWeights;
exports.ewma = ewma;
exports.bayesianShrinkMetrics = bayesianShrinkMetrics;
exports.runMLLayer = runMLLayer;
const fs = __importStar(require("fs"));
const paths_1 = require("../../config/paths");
exports.CLUSTER_LABELS = {
    stable: '平稳正常',
    mild_fluctuation: '轻度波动',
    moderate_stress: '中度压力',
    high_risk: '高危预警'
};
const CLUSTER_CENTROIDS = [
    { id: 'stable', center: [35, 30, 75] },
    { id: 'mild_fluctuation', center: [55, 50, 55] },
    { id: 'moderate_stress', center: [72, 68, 42] },
    { id: 'high_risk', center: [85, 82, 28] }
];
let cachedWeights = null;
function loadModelWeights() {
    if (cachedWeights)
        return cachedWeights;
    const filePath = (0, paths_1.resolveDataFile)('psych_model_weights.json');
    try {
        cachedWeights = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch (_a) {
        cachedWeights = {
            version: '1.0',
            distressWeights: { stress: 0.36, anxiety: 0.38, moodInstability: 0.26 },
            wellbeingBias: 8,
            functionalDistressFactor: 0.55,
            populationPrior: { stress: 48, anxiety: 44, mood: 58 },
            bayesianPriorStrength: 3,
            fusionWeights: { statistical: 0.3, machineLearning: 0.4, neuralNetwork: 0.3 }
        };
    }
    return cachedWeights;
}
function clamp100(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
}
function ewma(values, alpha = 0.4) {
    if (values.length === 0)
        return 0;
    let smoothed = values[0];
    for (let i = 1; i < values.length; i++) {
        smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }
    return smoothed;
}
function bayesianShrinkMetrics(metrics, sessionCount, config) {
    const n = sessionCount;
    const k = config.bayesianPriorStrength;
    if (n >= 5) {
        return { metrics, applied: false };
    }
    const w = n / (n + k);
    const prior = config.populationPrior;
    return {
        metrics: {
            stressLevel: clamp100(metrics.stressLevel * w + prior.stress * (1 - w)),
            anxietyLevel: clamp100(metrics.anxietyLevel * w + prior.anxiety * (1 - w)),
            moodStability: clamp100(metrics.moodStability * w + prior.mood * (1 - w))
        },
        applied: true
    };
}
function kMeansAssign(stress, anxiety, mood) {
    let best = 'stable';
    let bestDist = Infinity;
    for (const c of CLUSTER_CENTROIDS) {
        const [cs, ca, cm] = c.center;
        const d = Math.pow((stress - cs), 2) + Math.pow((anxiety - ca), 2) + Math.pow((mood - cm), 2);
        if (d < bestDist) {
            bestDist = d;
            best = c.id;
        }
    }
    return best;
}
function mlComputeDistress(metrics, weights) {
    const moodInstability = 100 - metrics.moodStability;
    return clamp100(metrics.stressLevel * weights.stress +
        metrics.anxietyLevel * weights.anxiety +
        moodInstability * weights.moodInstability);
}
function mlComputeWellbeing(distress, emotion, bias) {
    const positive = ['happy', 'hopeful', 'proud', 'neutral'];
    const boost = positive.includes(emotion) ? bias : 0;
    return clamp100(100 - distress + boost);
}
function mlComputeFunctional(distress, riskLevel, factor) {
    var _a;
    const riskPenalty = { low: 0, medium: 8, high: 18, critical: 32 };
    return clamp100(100 - distress * factor - ((_a = riskPenalty[riskLevel]) !== null && _a !== void 0 ? _a : 0));
}
function runMLLayer(rawMetrics, features, emotion, riskLevel, historyStress, historyAnxiety, historyMood) {
    const config = loadModelWeights();
    const { metrics: shrunk, applied } = bayesianShrinkMetrics(rawMetrics, features.sessionIndex - 1, config);
    const smoothedMetrics = {
        stressLevel: clamp100(historyStress.length > 0 ? ewma([...historyStress, shrunk.stressLevel]) : shrunk.stressLevel),
        anxietyLevel: clamp100(historyAnxiety.length > 0 ? ewma([...historyAnxiety, shrunk.anxietyLevel]) : shrunk.anxietyLevel),
        moodStability: clamp100(historyMood.length > 0 ? ewma([...historyMood, shrunk.moodStability]) : shrunk.moodStability)
    };
    const distress = mlComputeDistress(smoothedMetrics, config.distressWeights);
    const wellbeing = mlComputeWellbeing(distress, emotion, config.wellbeingBias);
    const functionalCapacity = mlComputeFunctional(distress, riskLevel, config.functionalDistressFactor);
    const cluster = kMeansAssign(smoothedMetrics.stressLevel, smoothedMetrics.anxietyLevel, smoothedMetrics.moodStability);
    return {
        metrics: smoothedMetrics,
        distress,
        wellbeing,
        functionalCapacity,
        cluster,
        clusterLabel: exports.CLUSTER_LABELS[cluster],
        dynamicWeights: config.distressWeights,
        bayesianApplied: applied,
        smoothedMetrics
    };
}
