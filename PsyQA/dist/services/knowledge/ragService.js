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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRAGAnswer = exports.retrieveKnowledge = exports.loadKnowledgeBase = exports.reloadKnowledgeBase = exports.getKnowledgeBaseCount = void 0;
exports.scoreKnowledgeItem = scoreKnowledgeItem;
exports.mergeRankedReferences = mergeRankedReferences;
const fs = __importStar(require("fs"));
const textProcessor_1 = require("../../utils/textProcessor");
const emotionService_1 = require("../psych/emotionService");
const psychTextAnalysis_1 = require("../../utils/psychTextAnalysis");
const paths_1 = require("../../config/paths");
let knowledgeBase = [];
const MIN_KNOWLEDGE_SCORE = 3;
const MIN_RELATIVE_RATIO = 0.5;
const resolveKnowledgePath = () => (0, paths_1.resolveDataFile)('mental_dataset.json');
const getKnowledgeBaseCount = () => knowledgeBase.length;
exports.getKnowledgeBaseCount = getKnowledgeBaseCount;
const reloadKnowledgeBase = () => {
    (0, exports.loadKnowledgeBase)();
};
exports.reloadKnowledgeBase = reloadKnowledgeBase;
const loadKnowledgeBase = () => {
    const dataPath = resolveKnowledgePath();
    try {
        const content = fs.readFileSync(dataPath, 'utf-8');
        const dataset = JSON.parse(content);
        knowledgeBase = (dataset.knowledge || []);
        console.log(`Loaded ${knowledgeBase.length} knowledge items (tagged: ${knowledgeBase.filter((k) => k.tags).length})`);
    }
    catch (error) {
        console.error('Error loading knowledge base:', error);
    }
};
exports.loadKnowledgeBase = loadKnowledgeBase;
function tagBoost(item, problemCategory, emotion) {
    let boost = 0;
    if (!item.tags)
        return boost;
    if (problemCategory && problemCategory !== 'other' && item.tags.problems.includes(problemCategory)) {
        boost += 2.5;
    }
    if (emotion && emotion !== 'neutral' && item.tags.emotions.includes(emotion)) {
        boost += 1.5;
    }
    return boost;
}
function scoreKnowledgeItem(query, item, options) {
    let score = (0, textProcessor_1.computeTextRelevance)(query, item.question, item.answer);
    if ((options === null || options === void 0 ? void 0 : options.problemCategory) && options.problemCategory !== 'other') {
        const { score: catScore } = (0, psychTextAnalysis_1.scoreKeywordMatches)((0, textProcessor_1.preprocessText)(`${item.question} ${item.answer}`), emotionService_1.PROBLEM_KEYWORDS[options.problemCategory] || []);
        score += catScore * 0.8;
    }
    score += tagBoost(item, options === null || options === void 0 ? void 0 : options.problemCategory, options === null || options === void 0 ? void 0 : options.emotion);
    if (options === null || options === void 0 ? void 0 : options.vectorSimilarity) {
        score += options.vectorSimilarity * 5;
    }
    return score;
}
function filterByRelativeScore(items, minAbsolute) {
    if (items.length === 0)
        return [];
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const topScore = sorted[0].score;
    const minScore = Math.max(minAbsolute, topScore * MIN_RELATIVE_RATIO);
    return sorted.filter((item) => item.score >= minScore);
}
const retrieveKnowledge = (query, topK = 3, problemCategory, emotion) => {
    if (knowledgeBase.length === 0)
        return [];
    const scoredItems = knowledgeBase.map((item) => (Object.assign(Object.assign({}, item), { score: scoreKnowledgeItem(query, item, { problemCategory, emotion }) })));
    const filtered = filterByRelativeScore(scoredItems, MIN_KNOWLEDGE_SCORE);
    return filtered.slice(0, topK).map((_a) => {
        var { score } = _a, item = __rest(_a, ["score"]);
        return (Object.assign(Object.assign({}, item), { relevance: score }));
    });
};
exports.retrieveKnowledge = retrieveKnowledge;
function mergeRankedReferences(query, retrievedKnowledge, vectorResults, problemCategory, emotion, topK = 3) {
    var _a;
    const merged = new Map();
    for (const item of retrievedKnowledge) {
        const score = (_a = item.relevance) !== null && _a !== void 0 ? _a : scoreKnowledgeItem(query, item, { problemCategory, emotion });
        const existing = merged.get(item.question);
        if (!existing || score > existing.score) {
            merged.set(item.question, Object.assign(Object.assign({}, item), { score }));
        }
    }
    for (const result of vectorResults) {
        const item = { question: result.question, answer: result.answer };
        const score = scoreKnowledgeItem(query, item, {
            problemCategory,
            emotion,
            vectorSimilarity: result.similarity
        });
        const existing = merged.get(item.question);
        if (!existing || score > existing.score) {
            merged.set(item.question, Object.assign(Object.assign({}, item), { score }));
        }
    }
    const ranked = filterByRelativeScore(Array.from(merged.values()), MIN_KNOWLEDGE_SCORE);
    return ranked.slice(0, topK).map((_a) => {
        var { score } = _a, item = __rest(_a, ["score"]);
        return (Object.assign(Object.assign({}, item), { relevance: score }));
    });
}
const generateRAGAnswer = (question, retrievedKnowledge) => {
    if (retrievedKnowledge.length === 0) {
        return generateDefaultAnswer(question);
    }
    const knowledgeText = retrievedKnowledge
        .map((k, i) => `${i + 1}. ${k.answer}`)
        .join('\n\n');
    return `
根据专业心理知识库，我为您提供以下建议：

${knowledgeText}

针对您的问题"${question}"，希望这些建议对您有所帮助。记住，寻求帮助是勇敢的表现。
  `.trim();
};
exports.generateRAGAnswer = generateRAGAnswer;
function generateDefaultAnswer(question) {
    return `
感谢您的信任。关于"${question}"，我建议您：

1. 首先接纳自己的感受，这是正常的
2. 尝试与信任的人分享您的困扰
3. 如果情况持续，可以寻求学校心理咨询中心的帮助

您并不孤单，很多人都经历过类似的困扰。
  `.trim();
}
(0, exports.loadKnowledgeBase)();
