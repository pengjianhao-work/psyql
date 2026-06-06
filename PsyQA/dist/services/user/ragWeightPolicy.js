"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_USER_RAG_WEIGHT = exports.TIMELINE_ANCHORS = exports.PHASE_LABELS = void 0;
exports.roundWeight = roundWeight;
exports.computeTimelineUserWeight = computeTimelineUserWeight;
exports.computeMemoryBoost = computeMemoryBoost;
exports.resolvePhaseFromMonths = resolvePhaseFromMonths;
/** 三阶段标签（用于 UI / Prompt 文案） */
exports.PHASE_LABELS = {
    collect: '特征采集期（0-6月）',
    shape: '人格成型期（7-18月）',
    mature: '专属Agent定型（19-24月）'
};
/** 时间轴锚点：月数 → 私有记忆权重 */
exports.TIMELINE_ANCHORS = [
    { month: 0, user: 0.3 },
    { month: 6, user: 0.45 },
    { month: 18, user: 0.7 },
    { month: 24, user: 0.85 }
];
exports.MAX_USER_RAG_WEIGHT = 0.92;
function roundWeight(n) {
    return Math.round(n * 1000) / 1000;
}
/** 按首条咨询月数在锚点间线性插值 */
function computeTimelineUserWeight(monthsElapsed) {
    const m = Math.max(0, monthsElapsed);
    const last = exports.TIMELINE_ANCHORS[exports.TIMELINE_ANCHORS.length - 1];
    if (m >= last.month)
        return last.user;
    for (let i = 0; i < exports.TIMELINE_ANCHORS.length - 1; i += 1) {
        const a = exports.TIMELINE_ANCHORS[i];
        const b = exports.TIMELINE_ANCHORS[i + 1];
        if (m >= a.month && m <= b.month) {
            const span = b.month - a.month || 1;
            const t = (m - a.month) / span;
            return roundWeight(a.user + (b.user - a.user) * t);
        }
    }
    return exports.TIMELINE_ANCHORS[0].user;
}
/** 记忆密度加成：已向量化的对话越多，私有检索权重略升 */
function computeMemoryBoost(memoryCount) {
    if (memoryCount >= 50)
        return 0.05;
    if (memoryCount >= 20)
        return 0.03;
    if (memoryCount >= 5)
        return 0.015;
    return 0;
}
function resolvePhaseFromMonths(months) {
    if (months < 6)
        return 'collect';
    if (months < 18)
        return 'shape';
    return 'mature';
}
