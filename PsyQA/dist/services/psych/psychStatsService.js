"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refineMetricsWithSignals = refineMetricsWithSignals;
exports.buildPsychStatModel = buildPsychStatModel;
exports.formatStatisticalReportSection = formatStatisticalReportSection;
exports.applyStatisticalFusion = applyStatisticalFusion;
exports.blendMetricsWithSelfRating = blendMetricsWithSelfRating;
exports.rebuildStatModelFromSnapshot = rebuildStatModelFromSnapshot;
exports.formatStatisticalExecutiveSummary = formatStatisticalExecutiveSummary;
const emotionService_1 = require("./emotionService");
const psychMetrics_1 = require("./psychMetrics");
const psychFusionEngine_1 = require("./psychFusionEngine");
const psychMLEngine_1 = require("./psychMLEngine");
const psychAdvancedMath_1 = require("./psychAdvancedMath");
const RISK_NUMERIC = {
    low: 12,
    medium: 38,
    high: 68,
    critical: 92
};
function clamp(n, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(n)));
}
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
function stdDev(values) {
    if (values.length < 2)
        return 0;
    const m = mean(values);
    const variance = values.reduce((acc, v) => acc + Math.pow((v - m), 2), 0) / values.length;
    return Math.sqrt(variance);
}
function linearSlope(values) {
    if (values.length < 2)
        return 0;
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0)
        return 0;
    return (n * sumXY - sumX * sumY) / denom;
}
function pearsonCorrelation(a, b) {
    if (a.length !== b.length || a.length < 2)
        return 0;
    const ma = mean(a);
    const mb = mean(b);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i++) {
        const xa = a[i] - ma;
        const xb = b[i] - mb;
        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
    }
    const denom = Math.sqrt(da * db);
    return denom === 0 ? 0 : num / denom;
}
function movingAvg(values, window = 3) {
    if (values.length === 0)
        return 0;
    const slice = values.slice(-window);
    return mean(slice);
}
function classifyLevel(value, invert = false) {
    const v = invert ? 100 - value : value;
    if (v < 30)
        return 'low';
    if (v < 55)
        return 'moderate';
    if (v < 75)
        return 'high';
    return 'severe';
}
function classifyTrend(slope, metricKey, dataLen) {
    if (dataLen < 2)
        return 'insufficient_data';
    const threshold = 1.2;
    const higherIsBetter = metricKey === 'mood' || metricKey === 'wellbeing';
    if (Math.abs(slope) < threshold)
        return 'stable';
    if (higherIsBetter)
        return slope > 0 ? 'improving' : 'worsening';
    return slope < 0 ? 'improving' : 'worsening';
}
function trendLabel(t) {
    const map = {
        improving: '改善中',
        stable: '基本稳定',
        worsening: '需关注（上升）',
        insufficient_data: '数据不足'
    };
    return map[t];
}
function percentileRank(value, history) {
    if (history.length < 2)
        return undefined;
    const below = history.filter((v) => v <= value).length;
    return clamp((below / history.length) * 100);
}
function refineMetricsWithSignals(emotion, risk, problem) {
    const base = (0, psychMetrics_1.emotionToChartMetrics)(emotion.emotion);
    let metrics = (0, psychMetrics_1.applyRiskToMetrics)(base, risk.level);
    const conf = emotion.confidence;
    const neutral = (0, psychMetrics_1.emotionToChartMetrics)('neutral');
    const blend = (value, neutralValue) => clamp(value * (0.65 + conf * 0.35) + neutralValue * (1 - conf) * 0.15);
    metrics = {
        stressLevel: blend(metrics.stressLevel, neutral.stressLevel),
        anxietyLevel: blend(metrics.anxietyLevel, neutral.anxietyLevel),
        moodStability: blend(metrics.moodStability, neutral.moodStability)
    };
    const keywordIntensity = Math.min(8, emotion.keywords.length + problem.keywords.length);
    metrics.stressLevel = clamp(metrics.stressLevel + keywordIntensity * 0.6);
    metrics.anxietyLevel = clamp(metrics.anxietyLevel + keywordIntensity * 0.5);
    metrics.moodStability = clamp(metrics.moodStability - keywordIntensity * 0.4);
    const problemBoost = problem.confidence > 0.55 ? (problem.confidence - 0.5) * 12 : 0;
    if (['academic_stress', 'career_future'].includes(problem.category)) {
        metrics.stressLevel = clamp(metrics.stressLevel + problemBoost);
    }
    if (['emotion_regulation', 'interpersonal'].includes(problem.category)) {
        metrics.anxietyLevel = clamp(metrics.anxietyLevel + problemBoost * 0.8);
    }
    if (risk.keywords.length > 0) {
        metrics.stressLevel = clamp(metrics.stressLevel + risk.keywords.length * 1.5);
        metrics.moodStability = clamp(metrics.moodStability - risk.keywords.length);
    }
    return metrics;
}
function computeDistress(metrics) {
    return clamp(metrics.stressLevel * 0.38 + metrics.anxietyLevel * 0.37 + (100 - metrics.moodStability) * 0.25);
}
function computeWellbeing(metrics, emotion) {
    const positive = ['happy', 'hopeful', 'proud', 'neutral'];
    const base = 100 - computeDistress(metrics);
    const boost = positive.includes(emotion) ? 8 : 0;
    return clamp(base + boost);
}
function computeFunctionalCapacity(metrics, distress, risk) {
    const riskPenalty = {
        low: 0,
        medium: 8,
        high: 18,
        critical: 32
    };
    return clamp(100 - distress * 0.55 - riskPenalty[risk]);
}
function buildDistribution(items, labelFn) {
    const counts = new Map();
    items.forEach((item) => {
        const label = labelFn(item);
        counts.set(label, (counts.get(label) || 0) + 1);
    });
    const total = items.length || 1;
    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count, share: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);
}
const EMOTION_CN = {
    happy: '开心',
    sad: '低落',
    anxious: '焦虑',
    angry: '愤怒',
    lonely: '孤独',
    neutral: '平稳',
    hopeful: '希望',
    confused: '迷茫',
    frustrated: '挫败',
    guilty: '内疚',
    shameful: '羞愧',
    proud: '自豪'
};
const RISK_CN = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重'
};
function buildPsychStatModel(emotion, risk, problem, metrics, historySnapshots) {
    const allSnapshots = [...historySnapshots];
    const currentSnapshot = {
        emotion: emotion.emotion,
        risk: risk.level,
        problem: problem.category,
        confidence: emotion.confidence,
        stressLevel: metrics.stressLevel,
        anxietyLevel: metrics.anxietyLevel,
        moodStability: metrics.moodStability
    };
    const series = [...allSnapshots, currentSnapshot];
    const stressSeries = series.map((s) => s.stressLevel);
    const anxietySeries = series.map((s) => s.anxietyLevel);
    const moodSeries = series.map((s) => s.moodStability);
    const distressSeries = series.map((s) => computeDistress({
        stressLevel: s.stressLevel,
        anxietyLevel: s.anxietyLevel,
        moodStability: s.moodStability
    }));
    const wellbeingSeries = series.map((s) => computeWellbeing({ stressLevel: s.stressLevel, anxietyLevel: s.anxietyLevel, moodStability: s.moodStability }, s.emotion));
    const distress = computeDistress(metrics);
    const wellbeing = computeWellbeing(metrics, emotion.emotion);
    const functionalCapacity = computeFunctionalCapacity(metrics, distress, risk.level);
    const histStress = allSnapshots.map((s) => s.stressLevel);
    const histAnxiety = allSnapshots.map((s) => s.anxietyLevel);
    const histMood = allSnapshots.map((s) => s.moodStability);
    const histDistress = allSnapshots.map((s) => computeDistress({
        stressLevel: s.stressLevel,
        anxietyLevel: s.anxietyLevel,
        moodStability: s.moodStability
    }));
    const buildTrend = (name, key, current, seriesValues, historyValues, invertSlope = false) => {
        const prev = seriesValues.length >= 2 ? seriesValues[seriesValues.length - 2] : undefined;
        const slope = linearSlope(seriesValues);
        const adjustedSlope = invertSlope ? -slope : slope;
        return {
            metric: name,
            metricKey: key,
            current,
            previous: prev,
            delta: prev !== undefined ? current - prev : undefined,
            slopePerSession: Number(slope.toFixed(2)),
            movingAvg3: Number(movingAvg(seriesValues, 3).toFixed(1)),
            ewma: Number((0, psychMLEngine_1.ewma)(seriesValues, 0.35).toFixed(1)),
            volatility: Number(stdDev(seriesValues).toFixed(1)),
            trend: classifyTrend(adjustedSlope, key, seriesValues.length)
        };
    };
    const trends = [
        buildTrend('压力指数', 'stress', metrics.stressLevel, stressSeries, histStress),
        buildTrend('焦虑指数', 'anxiety', metrics.anxietyLevel, anxietySeries, histAnxiety),
        buildTrend('情绪平稳度', 'mood', metrics.moodStability, moodSeries, histMood, true),
        buildTrend('心理困扰度', 'distress', distress, distressSeries, histDistress),
        buildTrend('幸福感指数', 'wellbeing', wellbeing, wellbeingSeries, histDistress, true)
    ];
    const stressAnxiety = pearsonCorrelation(stressSeries, anxietySeries);
    const moodDistress = pearsonCorrelation(moodSeries, distressSeries);
    let corrNote = '压力与焦虑呈';
    if (Math.abs(stressAnxiety) >= 0.6) {
        corrNote += stressAnxiety > 0 ? '显著同向波动' : '显著反向波动';
    }
    else {
        corrNote += '弱相关';
    }
    corrNote += `（r≈${stressAnxiety.toFixed(2)}）；情绪平稳度与困扰度`;
    corrNote += Math.abs(moodDistress) >= 0.5 ? '关联明显' : '关联一般';
    corrNote += `（r≈${moodDistress.toFixed(2)}）。`;
    const emotionIntensity = clamp(distress * 0.5 + (1 - emotion.confidence) * 20 + emotion.keywords.length * 2);
    const problemSalience = clamp(problem.confidence * 70 + problem.keywords.length * 3);
    const modelConfidence = clamp(emotion.confidence * 45 + problem.confidence * 35 + (1 - Math.abs(stressAnxiety - 0.5)) * 20);
    const riskScore = clamp(RISK_NUMERIC[risk.level] + risk.keywords.length * 4 + distress * 0.08);
    const summaryLines = [
        `本次为第 ${series.length} 次咨询记录，模型综合置信度 ${modelConfidence}%。`,
        `当前压力 ${metrics.stressLevel}、焦虑 ${metrics.anxietyLevel}、平稳度 ${metrics.moodStability}（0–100）。`,
        `综合困扰度 ${distress}（${classifyLevel(distress).toUpperCase()}），幸福感 ${wellbeing}，功能适应 ${functionalCapacity}。`,
        `近 ${Math.min(series.length, 3)} 次滑动均值：压力 ${movingAvg(stressSeries, 3).toFixed(0)} / 焦虑 ${movingAvg(anxietySeries, 3).toFixed(0)} / 平稳度 ${movingAvg(moodSeries, 3).toFixed(0)}。`
    ];
    trends.forEach((t) => {
        if (t.delta !== undefined && t.trend !== 'insufficient_data') {
            const sign = t.delta > 0 ? '+' : '';
            summaryLines.push(`${t.metric}较上次 ${sign}${t.delta}，趋势：${trendLabel(t.trend)}（斜率 ${t.slopePerSession}/次）。`);
        }
    });
    if (allSnapshots.length >= 3) {
        const avgVol = mean(trends.map((t) => t.volatility || 0));
        summaryLines.push(avgVol >= 12
            ? '近期指标波动较大，建议关注触发事件并记录变化。'
            : '近期指标波动相对温和，可继续观察与自助练习。');
    }
    const totalSessions = series.length;
    const showAdvancedStats = totalSessions >= 5;
    const statsReliability = totalSessions >= 5 ? 'high' : totalSessions >= 3 ? 'medium' : 'low';
    const personalBaseline = allSnapshots.length >= 2
        ? {
            stress: Number(mean(histStress).toFixed(1)),
            anxiety: Number(mean(histAnxiety).toFixed(1)),
            mood: Number(mean(histMood).toFixed(1)),
            samples: allSnapshots.length
        }
        : undefined;
    const statLayerScores = {
        stress: metrics.stressLevel,
        anxiety: metrics.anxietyLevel,
        mood: metrics.moodStability,
        distress,
        wellbeing,
        functionalCapacity
    };
    const fusion = (0, psychFusionEngine_1.runThreeLayerFusion)(emotion, risk, problem, metrics, allSnapshots, statLayerScores);
    const fusedDistress = fusion.fused.distress;
    const fusedWellbeing = fusion.fused.wellbeing;
    const fusedFunctional = fusion.fused.functionalCapacity;
    const intelligentModel = {
        architectureVersion: fusion.architectureVersion,
        fusionWeights: fusion.fusionWeights,
        mlCluster: fusion.ml.clusterLabel,
        mlClusterId: fusion.ml.cluster,
        dynamicWeights: fusion.ml.dynamicWeights,
        bayesianApplied: fusion.ml.bayesianApplied,
        predictions: {
            nextStress: fusion.neural.predictedNextStress,
            nextAnxiety: fusion.neural.predictedNextAnxiety
        },
        hiddenRisk: {
            score: fusion.neural.hiddenRiskScore,
            flag: fusion.neural.hiddenRiskFlag
        },
        primaryConcern: fusion.neural.primaryConcern,
        featureAttention: fusion.neural.featureAttention,
        layerScores: {
            statistical: {
                distress: statLayerScores.distress,
                wellbeing: statLayerScores.wellbeing,
                functional: statLayerScores.functionalCapacity
            },
            ml: {
                distress: fusion.ml.distress,
                wellbeing: fusion.ml.wellbeing,
                functional: fusion.ml.functionalCapacity
            },
            neural: {
                distress: fusion.neural.distress,
                wellbeing: fusion.neural.wellbeing,
                functional: fusion.neural.functionalCapacity
            },
            fused: {
                distress: fusedDistress,
                wellbeing: fusedWellbeing,
                functional: fusedFunctional
            }
        },
        ewmaSmoothed: {
            stress: fusion.ml.smoothedMetrics.stressLevel,
            anxiety: fusion.ml.smoothedMetrics.anxietyLevel,
            mood: fusion.ml.smoothedMetrics.moodStability
        }
    };
    const emotionFreqBuilt = buildDistribution(series.map((s) => s.emotion), (e) => EMOTION_CN[e] || e);
    const emotionCountValues = emotionFreqBuilt.map((e) => e.count);
    const advancedMathematics = (0, psychAdvancedMath_1.computeAdvancedMath)(stressSeries, anxietySeries, moodSeries, emotionCountValues, metrics.stressLevel, metrics.anxietyLevel);
    if (showAdvancedStats) {
        summaryLines.push(`三层融合：统计·ML·神经网络加权 distress=${fusedDistress}（Bayesian${fusion.ml.bayesianApplied ? '已' : '未'}收缩）。`);
        summaryLines.push(`高阶数学：情绪熵 H=${advancedMathematics.emotionEntropy} bit，压力 Z=${advancedMathematics.stressZScore}，马氏距 d_M=${advancedMathematics.mahalanobisDistance}。`);
        if (fusion.neural.hiddenRiskFlag) {
            summaryLines.push(`隐层风险预警分 ${fusion.neural.hiddenRiskScore}，建议加强随访。`);
        }
    }
    const mkDetail = (value, invert, description, history, baseline) => {
        const level = classifyLevel(value, invert);
        return {
            value,
            level,
            levelText: (0, psychAdvancedMath_1.metricLevelText)(level),
            percentile: history && history.length >= 2 ? percentileRank(value, history) : undefined,
            baselineDelta: baseline !== undefined ? Number((value - baseline).toFixed(1)) : undefined,
            description
        };
    };
    const displayDistress = showAdvancedStats ? fusedDistress : distress;
    const displayWellbeing = showAdvancedStats ? fusedWellbeing : wellbeing;
    const displayFunctional = showAdvancedStats ? fusedFunctional : functionalCapacity;
    return {
        sessionIndex: series.length,
        totalSessions,
        showAdvancedStats,
        statsReliability,
        personalBaseline,
        indices: {
            stress: mkDetail(metrics.stressLevel, false, '基于情绪类型、风险等级与文本信号加权估计', histStress, personalBaseline === null || personalBaseline === void 0 ? void 0 : personalBaseline.stress),
            anxiety: mkDetail(metrics.anxietyLevel, false, '反映紧张、担忧与躯体化倾向的综合指数', histAnxiety, personalBaseline === null || personalBaseline === void 0 ? void 0 : personalBaseline.anxiety),
            moodStability: mkDetail(metrics.moodStability, true, '情绪调节能力与波动幅度的间接指标（越高越稳定）', histMood, personalBaseline === null || personalBaseline === void 0 ? void 0 : personalBaseline.mood),
            distress: mkDetail(displayDistress, false, showAdvancedStats
                ? '三层融合 distress = wₛ·统计 + wₘ·ML + wₙ·神经网络'
                : '压力×0.38 + 焦虑×0.37 + (100-平稳度)×0.25'),
            wellbeing: mkDetail(displayWellbeing, true, showAdvancedStats ? '融合层幸福感估计（含 EWMA 平滑）' : '由困扰度反向推算，正向情绪给予小幅修正'),
            functionalCapacity: mkDetail(displayFunctional, true, '评估当前困扰对日常学习/社交功能的影响程度')
        },
        compositeScores: {
            riskScore: clamp(riskScore + (fusion.neural.hiddenRiskFlag ? 8 : 0)),
            riskLevel: risk.level,
            emotionIntensity,
            problemSalience,
            modelConfidence
        },
        distributions: {
            emotionFreq: emotionFreqBuilt.map(({ label, count, share }) => ({ emotion: label, count, share })),
            problemFreq: buildDistribution(series.map((s) => s.problem), (p) => (0, emotionService_1.getCategoryName)(p)).map(({ label, count, share }) => ({ category: label, count, share })),
            riskFreq: buildDistribution(series.map((s) => s.risk), (r) => RISK_CN[r] || r).map(({ label, count, share }) => ({ level: label, count, share }))
        },
        trends,
        correlations: {
            stressAnxiety: Number(stressAnxiety.toFixed(2)),
            moodDistress: Number(moodDistress.toFixed(2)),
            note: corrNote,
            visible: totalSessions >= 3
        },
        intelligentModel,
        advancedMathematics,
        summaryLines
    };
}
function formatStatisticalReportSection(model) {
    const { indices, compositeScores, trends, correlations, distributions, intelligentModel, advancedMathematics } = model;
    const trendBlock = trends
        .map((t) => {
        var _a, _b;
        const deltaStr = t.delta !== undefined ? `，较上次 ${t.delta > 0 ? '+' : ''}${t.delta}` : '';
        const ewmaStr = t.ewma !== undefined ? ` | EWMA ${t.ewma}` : '';
        return `- ${t.metric}：${t.current}${deltaStr} | 3次均值 ${(_a = t.movingAvg3) !== null && _a !== void 0 ? _a : '-'} | 波动 σ≈${(_b = t.volatility) !== null && _b !== void 0 ? _b : '-'}${ewmaStr} | ${trendLabel(t.trend)}`;
    })
        .join('\n');
    const emotionDist = distributions.emotionFreq
        .slice(0, 4)
        .map((e) => `${e.emotion} ${e.share}%`)
        .join('、');
    const fusionBlock = intelligentModel
        ? `
【三层智能融合 · ${intelligentModel.architectureVersion}】
- 融合权重：统计 ${Math.round(intelligentModel.fusionWeights.statistical * 100)}% / ML ${Math.round(intelligentModel.fusionWeights.machineLearning * 100)}% / 神经网络 ${Math.round(intelligentModel.fusionWeights.neuralNetwork * 100)}%
- K-Means 聚类：${intelligentModel.mlCluster} | Bayesian 收缩：${intelligentModel.bayesianApplied ? '已应用' : '样本充足未收缩'}
- 融合困扰度：${intelligentModel.layerScores.fused.distress} | 预测下轮压力 ${intelligentModel.predictions.nextStress} / 焦虑 ${intelligentModel.predictions.nextAnxiety}
- 隐层风险：${intelligentModel.hiddenRisk.score}${intelligentModel.hiddenRisk.flag ? ' ⚠ 预警' : ''}
- ${intelligentModel.primaryConcern}
`.trim()
        : '';
    const mathBlock = advancedMathematics && model.showAdvancedStats
        ? `
【高阶数学指标】
- Shannon 熵 H = ${advancedMathematics.emotionEntropy} bit（${advancedMathematics.emotionEntropyNote}）
- 自相关 ρ(1)：压力 ${advancedMathematics.stressAutocorr} / 焦虑 ${advancedMathematics.anxietyAutocorr}
- Z 分数：压力 Z = ${advancedMathematics.stressZScore}，焦虑 Z = ${advancedMathematics.anxietyZScore}
- 马氏距离 d_M = ${advancedMathematics.mahalanobisDistance}（相对群体先验）
- 卡尔曼估计压力 = ${advancedMathematics.kalmanStressEstimate} | 变异系数 CV = ${advancedMathematics.stressCoefficientOfVariation}
- 综合异常度 = ${advancedMathematics.anomalyScore}/100
`.trim()
        : '';
    const corrBlock = correlations.visible
        ? `【相关结构】\n${correlations.note}`
        : '【相关结构】咨询满 3 次后展示 Pearson 相关分析';
    return `
五、统计建模分析（本次会话）

【核心指数 · 0-100】
- 压力指数：${indices.stress.value}（${indices.stress.level}）${indices.stress.percentile !== undefined ? `，历史分位 P${indices.stress.percentile}` : ''}
- 焦虑指数：${indices.anxiety.value}（${indices.anxiety.level}）${indices.anxiety.percentile !== undefined ? `，历史分位 P${indices.anxiety.percentile}` : ''}
- 情绪平稳度：${indices.moodStability.value}（${indices.moodStability.level}）
- 心理困扰度：${indices.distress.value}（${indices.distress.level}）← 0.38×压力 + 0.37×焦虑 + 0.25×(100-平稳度)
- 幸福感指数：${indices.wellbeing.value}（${indices.wellbeing.level}）
- 功能适应度：${indices.functionalCapacity.value}（${indices.functionalCapacity.level}）

【综合评分】
- 风险量化分：${compositeScores.riskScore}/100（等级：${RISK_CN[compositeScores.riskLevel]}）
- 情绪强度：${compositeScores.emotionIntensity} | 问题显著度：${compositeScores.problemSalience} | 模型置信：${compositeScores.modelConfidence}%

【时序趋势 · 第 ${model.sessionIndex} 次】
${trendBlock}

${corrBlock}

${fusionBlock ? `${fusionBlock}\n\n` : ''}${mathBlock ? `${mathBlock}\n\n` : ''}【历史分布（累计）】
- 情绪：${emotionDist || '暂无'}
- 主要问题：${distributions.problemFreq.slice(0, 2).map((p) => `${p.category} ${p.share}%`).join('、') || '暂无'}

【建模摘要】
${model.summaryLines.map((l) => `· ${l}`).join('\n')}
`.trim();
}
function applyStatisticalFusion(emotion, risk, problem, statModel) {
    var _a, _b, _c;
    let outEmotion = Object.assign({}, emotion);
    let outRisk = Object.assign({}, risk);
    let outProblem = Object.assign({}, problem);
    const riskOrder = {
        low: 0,
        medium: 1,
        high: 2,
        critical: 3
    };
    const levelFromScore = (score) => {
        if (score >= 82)
            return 'critical';
        if (score >= 68)
            return 'high';
        if (score >= 45)
            return 'medium';
        return 'low';
    };
    const elevateRisk = (next, reason) => {
        if (outRisk.level === 'critical')
            return;
        if (riskOrder[next] > riskOrder[outRisk.level]) {
            outRisk = Object.assign(Object.assign({}, outRisk), { level: next, warningMessage: outRisk.warningMessage || reason });
        }
    };
    const composite = statModel.compositeScores;
    if (composite) {
        const statRisk = levelFromScore(composite.riskScore);
        elevateRisk(statRisk, `统计模型综合风险分 ${composite.riskScore}，建议关注当前情绪与行为变化。`);
    }
    const hidden = (_a = statModel.intelligentModel) === null || _a === void 0 ? void 0 : _a.hiddenRisk;
    if (hidden === null || hidden === void 0 ? void 0 : hidden.flag) {
        elevateRisk(outRisk.level === 'low' ? 'medium' : outRisk.level === 'medium' ? 'high' : 'critical', outRisk.warningMessage ||
            `隐层神经网络检测到潜在风险信号（score=${hidden.score}），建议关注情绪变化并必要时寻求专业支持。`);
    }
    const stressTrend = (_b = statModel.trends) === null || _b === void 0 ? void 0 : _b.find((t) => t.metricKey === 'stress');
    const anxietyTrend = (_c = statModel.trends) === null || _c === void 0 ? void 0 : _c.find((t) => t.metricKey === 'anxiety');
    if (((stressTrend === null || stressTrend === void 0 ? void 0 : stressTrend.trend) === 'worsening' || (anxietyTrend === null || anxietyTrend === void 0 ? void 0 : anxietyTrend.trend) === 'worsening') &&
        outEmotion.confidence < 0.88) {
        outEmotion = Object.assign(Object.assign({}, outEmotion), { confidence: Math.min(0.92, outEmotion.confidence + 0.08) });
        if (outRisk.level === 'low') {
            elevateRisk('medium', '近期压力/焦虑趋势呈恶化，建议加强自我关怀与随访。');
        }
    }
    if (composite && composite.problemSalience >= 70 && outProblem.confidence < 0.85) {
        outProblem = Object.assign(Object.assign({}, outProblem), { confidence: Math.min(0.9, outProblem.confidence + 0.1) });
    }
    if (composite && composite.emotionIntensity >= 75 && outEmotion.confidence < 0.8) {
        outEmotion = Object.assign(Object.assign({}, outEmotion), { confidence: Math.min(0.9, outEmotion.confidence + 0.06) });
    }
    return { emotion: outEmotion, risk: outRisk, problem: outProblem };
}
function blendMetricsWithSelfRating(metrics, self) {
    const out = Object.assign({}, metrics);
    if ((self === null || self === void 0 ? void 0 : self.stress) !== undefined)
        out.stressLevel = Math.round((out.stressLevel + self.stress) / 2);
    if ((self === null || self === void 0 ? void 0 : self.anxiety) !== undefined)
        out.anxietyLevel = Math.round((out.anxietyLevel + self.anxiety) / 2);
    if ((self === null || self === void 0 ? void 0 : self.mood) !== undefined)
        out.moodStability = Math.round((out.moodStability + self.mood * 10) / 2);
    return out;
}
function rebuildStatModelFromSnapshot(psych, historySnapshots = []) {
    const emotion = {
        emotion: psych.emotion,
        confidence: psych.confidence,
        keywords: [],
        secondaryEmotions: []
    };
    const risk = {
        level: psych.risk,
        keywords: [],
        warningMessage: '',
        hotline: '全国心理援助热线：400-161-9995'
    };
    const problem = {
        category: psych.problem,
        confidence: 0.75,
        keywords: [],
        subcategories: []
    };
    const metrics = refineMetricsWithSignals(emotion, risk, problem);
    return buildPsychStatModel(emotion, risk, problem, metrics, historySnapshots);
}
function formatStatisticalExecutiveSummary(model) {
    return model.summaryLines.slice(0, 3).map((l) => `· ${l}`).join('\n');
}
