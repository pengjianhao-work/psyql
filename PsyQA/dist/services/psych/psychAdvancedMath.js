"use strict";
/** 心理统计建模 · 高阶数学工具（熵、自相关、Z 分数、卡尔曼、马氏距离） */
Object.defineProperty(exports, "__esModule", { value: true });
exports.shannonEntropy = shannonEntropy;
exports.autocorrelation = autocorrelation;
exports.zScore = zScore;
exports.mahalanobisDiagonal = mahalanobisDiagonal;
exports.kalmanFilter1D = kalmanFilter1D;
exports.coefficientOfVariation = coefficientOfVariation;
exports.metricLevelText = metricLevelText;
exports.computeAdvancedMath = computeAdvancedMath;
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
function stdDev(values) {
    if (values.length < 2)
        return 0;
    const m = mean(values);
    return Math.sqrt(values.reduce((acc, v) => acc + Math.pow((v - m), 2), 0) / values.length);
}
/** Shannon 熵（比特） */
function shannonEntropy(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= 0)
        return 0;
    let h = 0;
    for (const c of counts) {
        if (c <= 0)
            continue;
        const p = c / total;
        h -= p * Math.log2(p);
    }
    return Number(h.toFixed(3));
}
/** lag-k 样本自相关系数 */
function autocorrelation(values, lag = 1) {
    if (values.length <= lag + 1)
        return 0;
    const n = values.length - lag;
    const x1 = values.slice(0, n);
    const x2 = values.slice(lag);
    const m1 = mean(x1);
    const m2 = mean(x2);
    let num = 0;
    let d1 = 0;
    let d2 = 0;
    for (let i = 0; i < n; i++) {
        const a = x1[i] - m1;
        const b = x2[i] - m2;
        num += a * b;
        d1 += a * a;
        d2 += b * b;
    }
    const denom = Math.sqrt(d1 * d2);
    return denom === 0 ? 0 : Number((num / denom).toFixed(3));
}
function zScore(value, history) {
    if (history.length < 2)
        return 0;
    const m = mean(history);
    const s = stdDev(history);
    if (s === 0)
        return 0;
    return Number(((value - m) / s).toFixed(2));
}
/** 简化马氏距离：对角协方差 Σ=diag(σ²) */
function mahalanobisDiagonal(point, prior, sigmas) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
        const sigma = Math.max(sigmas[i], 1e-6);
        const d = (point[i] - prior[i]) / sigma;
        sum += d * d;
    }
    return Number(Math.sqrt(sum).toFixed(2));
}
/** 标量卡尔曼滤波：Q 过程噪声，R 观测噪声 */
function kalmanFilter1D(observations, processNoise = 4, measurementNoise = 9) {
    if (observations.length === 0)
        return 0;
    let estimate = observations[0];
    let errorCov = 10;
    for (const z of observations) {
        const predCov = errorCov + processNoise;
        const gain = predCov / (predCov + measurementNoise);
        estimate = estimate + gain * (z - estimate);
        errorCov = (1 - gain) * predCov;
    }
    return Math.round(estimate);
}
function coefficientOfVariation(values) {
    const m = mean(values);
    if (m === 0)
        return 0;
    return Number((stdDev(values) / m).toFixed(3));
}
const LEVEL_CN = {
    low: '低',
    moderate: '中等',
    high: '偏高',
    severe: '高'
};
function metricLevelText(level) {
    var _a;
    return (_a = LEVEL_CN[level]) !== null && _a !== void 0 ? _a : level;
}
function computeAdvancedMath(stressSeries, anxietySeries, moodSeries, emotionCounts, currentStress, currentAnxiety) {
    var _a;
    const emotionEntropy = shannonEntropy(emotionCounts);
    const maxEntropy = Math.log2(Math.max(emotionCounts.filter((c) => c > 0).length, 1)) || 1;
    const entropyRatio = maxEntropy > 0 ? emotionEntropy / maxEntropy : 0;
    const stressAutocorr = autocorrelation(stressSeries, 1);
    const anxietyAutocorr = autocorrelation(anxietySeries, 1);
    const stressZ = zScore(currentStress, stressSeries.slice(0, -1));
    const anxietyZ = zScore(currentAnxiety, anxietySeries.slice(0, -1));
    const prior = [48, 44, 58];
    const sigmas = [
        Math.max(stdDev(stressSeries), 8),
        Math.max(stdDev(anxietySeries), 8),
        Math.max(stdDev(moodSeries), 8)
    ];
    const mahalanobisDistance = mahalanobisDiagonal([currentStress, currentAnxiety, (_a = moodSeries[moodSeries.length - 1]) !== null && _a !== void 0 ? _a : 58], prior, sigmas);
    const kalmanStressEstimate = kalmanFilter1D(stressSeries);
    const stressCV = coefficientOfVariation(stressSeries);
    const anomalyScore = Math.min(100, Math.round(Math.abs(stressZ) * 18 +
        Math.abs(anxietyZ) * 15 +
        mahalanobisDistance * 8 +
        (entropyRatio > 0.85 ? 12 : 0) +
        (stressAutocorr > 0.6 ? 10 : 0)));
    let emotionEntropyNote = '情绪分布较集中';
    if (entropyRatio >= 0.75)
        emotionEntropyNote = '情绪类型切换频繁，状态不稳定';
    else if (entropyRatio >= 0.45)
        emotionEntropyNote = '情绪分布中等离散';
    return {
        emotionEntropy,
        emotionEntropyNote,
        stressAutocorr,
        anxietyAutocorr,
        stressZScore: stressZ,
        anxietyZScore: anxietyZ,
        mahalanobisDistance,
        kalmanStressEstimate,
        stressCoefficientOfVariation: stressCV,
        anomalyScore,
        formulas: [
            'H = -Σ pᵢ log₂(pᵢ)',
            'ρ(1) = Cov(Xₜ, Xₜ₋₁) / Var(X)',
            'Z = (x - μ) / σ',
            'd_M = √((x-μ)ᵀ Σ⁻¹ (x-μ))',
            'Kalman: x̂ₜ = x̂ₜ₋₁ + K(zₜ - x̂ₜ₋₁)'
        ]
    };
}
