"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasDirectTopicOverlap = hasDirectTopicOverlap;
exports.filterSimilarQuestionsForDisplay = filterSimilarQuestionsForDisplay;
exports.filterKnowledgeForDisplay = filterKnowledgeForDisplay;
const textProcessor_1 = require("./textProcessor");
/** 同义/近义主题词：命中任一词即视为与组内其他词有主题重叠 */
const TOPIC_SYNONYM_GROUPS = [
    ['舍友', '室友', '宿舍', '寝室'],
    ['失眠', '睡不着', '入睡'],
    ['焦虑', '紧张', '担心'],
    ['抑郁', '低落', '难过']
];
function expandWithSynonyms(text) {
    let expanded = text;
    for (const group of TOPIC_SYNONYM_GROUPS) {
        if (group.some((w) => text.includes(w))) {
            expanded += group.join('');
        }
    }
    return expanded;
}
/** 用户原话与目标文本是否共享足够长的中文片段（避免仅因泛化词命中） */
function hasDirectTopicOverlap(query, target, minChars = 2) {
    const q = expandWithSynonyms(query.replace(/[^\u4e00-\u9fa5]/g, '').trim());
    const t = expandWithSynonyms(target.replace(/[^\u4e00-\u9fa5]/g, ''));
    if (q.length < minChars || !t)
        return false;
    const maxLen = Math.min(8, q.length);
    for (let len = maxLen; len >= minChars; len--) {
        for (let i = 0; i <= q.length - len; i++) {
            if (t.includes(q.slice(i, i + len)))
                return true;
        }
    }
    return false;
}
const MIN_DISPLAY_SIMILAR_SCORE = 7;
const MIN_DISPLAY_KNOWLEDGE_SCORE = 5.5;
const STRONG_SIMILAR_SCORE = 11;
const STRONG_KNOWLEDGE_SCORE = 9;
function filterSimilarQuestionsForDisplay(query, description, items, max = 2) {
    const raw = [query, description].filter(Boolean).join(' ').trim();
    if (!raw)
        return [];
    return items
        .filter((sq) => {
        var _a;
        const score = (_a = sq.similarity) !== null && _a !== void 0 ? _a : 0;
        if (score < MIN_DISPLAY_SIMILAR_SCORE)
            return false;
        if (score >= STRONG_SIMILAR_SCORE)
            return true;
        const blob = `${sq.question} ${sq.description || ''}`;
        return hasDirectTopicOverlap(raw, sq.question) || hasDirectTopicOverlap(raw, blob);
    })
        .slice(0, max);
}
function filterKnowledgeForDisplay(query, items, max = 2) {
    const raw = query.trim();
    if (!raw)
        return [];
    return items
        .filter((k) => {
        var _a;
        const score = (_a = k.relevance) !== null && _a !== void 0 ? _a : (0, textProcessor_1.computeTextRelevance)(raw, k.question, k.answer);
        if (score < MIN_DISPLAY_KNOWLEDGE_SCORE)
            return false;
        if (score >= STRONG_KNOWLEDGE_SCORE)
            return true;
        return (hasDirectTopicOverlap(raw, k.question) ||
            hasDirectTopicOverlap(raw, k.answer));
    })
        .slice(0, max);
}
