"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSeasonalRagBoost = getSeasonalRagBoost;
exports.applySeasonalScoreMultiplier = applySeasonalScoreMultiplier;
/** 校园时序节点 → RAG 分类权重自适应（答辩核心创新点） */
function getSeasonalRagBoost(now = new Date()) {
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const problemBoost = {};
    const emotionBoost = {};
    let label = '常规学期';
    let reason = '默认均衡召回';
    // 期中期末（5-6月、12-1月）
    if (month === 5 || month === 6 || month === 12 || (month === 1 && day <= 20)) {
        problemBoost.academic_stress = 1.45;
        emotionBoost.anxious = 1.25;
        emotionBoost.frustrated = 1.15;
        label = '考试季';
        reason = '考前/期末时段上浮学业压力类知识召回权重';
    }
    // 开学季（9月）
    else if (month === 9) {
        problemBoost.interpersonal = 1.2;
        problemBoost.self_identity = 1.15;
        emotionBoost.lonely = 1.2;
        label = '开学适应期';
        reason = '新生/返校适应期提升人际与自我认同类权重';
    }
    // 换季抑郁高发（3-4月、10-11月）
    else if (month === 3 || month === 4 || month === 10 || month === 11) {
        emotionBoost.sad = 1.35;
        emotionBoost.anxious = 1.2;
        problemBoost.emotion_regulation = 1.3;
        label = '换季情绪关怀期';
        reason = '换季时段提升情绪疏导与调节类知识优先级';
    }
    // 寒暑假前后
    else if (month === 7 || month === 8 || month === 2) {
        problemBoost.family_relationship = 1.15;
        problemBoost.romantic_relationship = 1.1;
        label = '假期前后';
        reason = '假期家庭/亲密关系话题权重适度上浮';
    }
    return { problemBoost, emotionBoost, label, reason };
}
function applySeasonalScoreMultiplier(baseScore, itemProblems, itemEmotions, queryProblem, queryEmotion) {
    const boost = getSeasonalRagBoost();
    let mult = 1;
    if (queryProblem && boost.problemBoost[queryProblem]) {
        if (itemProblems === null || itemProblems === void 0 ? void 0 : itemProblems.includes(queryProblem))
            mult *= boost.problemBoost[queryProblem];
    }
    if (queryEmotion && boost.emotionBoost[queryEmotion]) {
        if (itemEmotions === null || itemEmotions === void 0 ? void 0 : itemEmotions.includes(queryEmotion))
            mult *= boost.emotionBoost[queryEmotion];
    }
    for (const p of itemProblems || []) {
        if (boost.problemBoost[p])
            mult = Math.max(mult, boost.problemBoost[p]);
    }
    for (const e of itemEmotions || []) {
        if (boost.emotionBoost[e])
            mult = Math.max(mult, boost.emotionBoost[e]);
    }
    return baseScore * mult;
}
