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
    return {
        sessionIndex: series.length,
        totalSessions: series.length,
        indices: {
            stress: {
                value: metrics.stressLevel,
                level: classifyLevel(metrics.stressLevel),
                percentile: percentileRank(metrics.stressLevel, histStress),
                description: '基于情绪类型、风险等级与文本信号加权估计'
            },
            anxiety: {
                value: metrics.anxietyLevel,
                level: classifyLevel(metrics.anxietyLevel),
                percentile: percentileRank(metrics.anxietyLevel, histAnxiety),
                description: '反映紧张、担忧与躯体化倾向的综合指数'
            },
            moodStability: {
                value: metrics.moodStability,
                level: classifyLevel(metrics.moodStability, true),
                percentile: percentileRank(metrics.moodStability, histMood),
                description: '情绪调节能力与波动幅度的间接指标（越高越稳定）'
            },
            distress: {
                value: distress,
                level: classifyLevel(distress),
                description: '压力×0.38 + 焦虑×0.37 + (100-平稳度)×0.25'
            },
            wellbeing: {
                value: wellbeing,
                level: classifyLevel(wellbeing, true),
                description: '由困扰度反向推算，正向情绪给予小幅修正'
            },
            functionalCapacity: {
                value: functionalCapacity,
                level: classifyLevel(functionalCapacity, true),
                description: '评估当前困扰对日常学习/社交功能的影响程度'
            }
        },
        compositeScores: {
            riskScore,
            riskLevel: risk.level,
            emotionIntensity,
            problemSalience,
            modelConfidence
        },
        distributions: {
            emotionFreq: buildDistribution(series.map((s) => s.emotion), (e) => EMOTION_CN[e] || e).map(({ label, count, share }) => ({ emotion: label, count, share })),
            problemFreq: buildDistribution(series.map((s) => s.problem), (p) => (0, emotionService_1.getCategoryName)(p)).map(({ label, count, share }) => ({ category: label, count, share })),
            riskFreq: buildDistribution(series.map((s) => s.risk), (r) => RISK_CN[r] || r).map(({ label, count, share }) => ({ level: label, count, share }))
        },
        trends,
        correlations: {
            stressAnxiety: Number(stressAnxiety.toFixed(2)),
            moodDistress: Number(moodDistress.toFixed(2)),
            note: corrNote
        },
        summaryLines
    };
}
function formatStatisticalReportSection(model) {
    const { indices, compositeScores, trends, correlations, distributions } = model;
    const trendBlock = trends
        .map((t) => {
        var _a, _b;
        const deltaStr = t.delta !== undefined ? `，较上次 ${t.delta > 0 ? '+' : ''}${t.delta}` : '';
        return `- ${t.metric}：${t.current}${deltaStr} | 3次均值 ${(_a = t.movingAvg3) !== null && _a !== void 0 ? _a : '-'} | 波动 σ≈${(_b = t.volatility) !== null && _b !== void 0 ? _b : '-'} | ${trendLabel(t.trend)}`;
    })
        .join('\n');
    const emotionDist = distributions.emotionFreq
        .slice(0, 4)
        .map((e) => `${e.emotion} ${e.share}%`)
        .join('、');
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

【相关结构】
${correlations.note}

【历史分布（累计）】
- 情绪：${emotionDist || '暂无'}
- 主要问题：${distributions.problemFreq.slice(0, 2).map((p) => `${p.category} ${p.share}%`).join('、') || '暂无'}

【建模摘要】
${model.summaryLines.map((l) => `· ${l}`).join('\n')}
`.trim();
}
function applyStatisticalFusion(emotion, risk, problem, _statModel) {
    return { emotion, risk, problem };
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
