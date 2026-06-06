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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCategories = exports.getCategories = exports.findSimilarQuestions = exports.loadQuestions = void 0;
exports.enhanceQueryWithKeywords = enhanceQueryWithKeywords;
const fs = __importStar(require("fs"));
const textProcessor_1 = require("../../utils/textProcessor");
const relevanceFilter_1 = require("../../utils/relevanceFilter");
const paths_1 = require("../../config/paths");
const PSYCHOLOGY_KEYWORDS = [
    '压力', '焦虑', '失眠', '抑郁', '孤独', '自卑', '紧张', '烦躁',
    '失恋', '宿舍', '考试', '学习', '考研', '就业', '人际', '感情',
    '压力大', '焦虑症', '抑郁症', '情绪低落', '心情烦躁', '自我否定'
];
const MIN_SIMILAR_QUESTION_SCORE = 4;
function enhanceQueryWithKeywords(query, extraTerms = []) {
    const terms = new Set(extraTerms);
    for (const keyword of PSYCHOLOGY_KEYWORDS) {
        if (query.includes(keyword))
            terms.add(keyword);
    }
    return (0, textProcessor_1.buildRetrievalQuery)(query, undefined, Array.from(terms));
}
const loadQuestions = () => __awaiter(void 0, void 0, void 0, function* () {
    const dataPath = (0, paths_1.psyqaFullJsonPath)();
    return new Promise((resolve, reject) => {
        fs.readFile(dataPath, 'utf-8', (err, data) => {
            if (err)
                return reject(err);
            try {
                resolve(JSON.parse(data));
            }
            catch (parseError) {
                reject(parseError);
            }
        });
    });
});
exports.loadQuestions = loadQuestions;
const findSimilarQuestions = (query, questions, topN = 3, description) => {
    const rawQuery = description ? `${query} ${description}` : query;
    const queryText = enhanceQueryWithKeywords(rawQuery);
    const scored = questions.map((q) => {
        const relevance = (0, textProcessor_1.computeTextRelevance)(queryText, q.question, q.description);
        const keywordBonus = q.keywords && (0, textProcessor_1.preprocessText)(queryText).includes((0, textProcessor_1.preprocessText)(q.keywords)) ? 2 : 0;
        const blob = `${q.question} ${q.description || ''} ${q.keywords || ''}`;
        const overlapBonus = (0, relevanceFilter_1.hasDirectTopicOverlap)(rawQuery, q.question) || (0, relevanceFilter_1.hasDirectTopicOverlap)(rawQuery, blob) ? 8 : 0;
        return {
            question: q.question,
            description: q.description,
            keywords: q.keywords,
            answers: q.answers,
            similarity: relevance + keywordBonus + overlapBonus
        };
    });
    const sorted = scored
        .filter((s) => {
        if (s.similarity < MIN_SIMILAR_QUESTION_SCORE)
            return false;
        return (s.similarity >= 10 ||
            (0, relevanceFilter_1.hasDirectTopicOverlap)(rawQuery, s.question) ||
            (0, relevanceFilter_1.hasDirectTopicOverlap)(rawQuery, `${s.question} ${s.description || ''}`));
    })
        .sort((a, b) => b.similarity - a.similarity);
    if (sorted.length === 0) {
        return [];
    }
    const topScore = sorted[0].similarity;
    const minScore = Math.max(MIN_SIMILAR_QUESTION_SCORE * 0.55, topScore * 0.5);
    return sorted.filter((s) => s.similarity >= minScore).slice(0, topN);
};
exports.findSimilarQuestions = findSimilarQuestions;
const MAIN_CATEGORIES = [
    { id: 'academic_stress', name: '📚 学业压力', icon: '📚', count: 0 },
    { id: 'interpersonal', name: '👥 人际关系', icon: '👥', count: 0 },
    { id: 'family_relationship', name: '🏠 家庭关系', icon: '🏠', count: 0 },
    { id: 'romantic_relationship', name: '💑 恋爱关系', icon: '💑', count: 0 },
    { id: 'career_future', name: '🚀 职业未来', icon: '🚀', count: 0 },
    { id: 'self_identity', name: '🌟 自我认同', icon: '🌟', count: 0 },
    { id: 'emotion_regulation', name: '🧘 情绪调节', icon: '🧘', count: 0 },
    { id: 'body_image', name: '👗 身体意象', icon: '👗', count: 0 },
    { id: 'addiction', name: '🎮 成瘾问题', icon: '🎮', count: 0 },
    { id: 'trauma', name: '🕊️ 创伤经历', icon: '🕊️', count: 0 }
];
const CATEGORY_KEYWORDS = {
    academic_stress: ['学习', '考试', '考研', '高考', '作业', '成绩', '复习', '论文', '答辩', '挂科', '绩点'],
    interpersonal: ['朋友', '室友', '同学', '社交', '孤独', '孤单', '社恐', '人际沟通', '人际关系'],
    family_relationship: ['父母', '家人', '妈妈', '爸爸', '家庭', '亲情', '家庭矛盾', '父母期望'],
    romantic_relationship: ['恋爱', '失恋', '感情', '喜欢', '分手', '暗恋', '表白', '异地恋'],
    career_future: ['迷茫', '未来', '方向', '目标', '就业', '工作', '职业规划', '前途'],
    self_identity: ['自信', '自卑', '自我', '价值', '自我认同', '自我怀疑', '自尊心'],
    emotion_regulation: ['情绪', '心情', '调节', '控制', '管理', '情绪问题', '焦虑', '抑郁'],
    body_image: ['身材', '外貌', '体重', '颜值', '身材焦虑', '外貌焦虑', '减肥'],
    addiction: ['游戏', '手机', '网络', '熬夜', '上瘾', '沉迷', '游戏上瘾'],
    trauma: ['创伤', '阴影', '回忆', '伤害', '痛苦经历', '心理阴影', '童年阴影']
};
const getCategories = (questions) => {
    const categoryCounts = {};
    MAIN_CATEGORIES.forEach((cat) => {
        categoryCounts[cat.id] = 0;
    });
    questions.forEach((q) => {
        const text = (q.question + ' ' + q.description + ' ' + q.keywords).toLowerCase();
        for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            for (const kw of keywords) {
                if (text.includes(kw.toLowerCase())) {
                    categoryCounts[categoryId]++;
                    break;
                }
            }
        }
    });
    return MAIN_CATEGORIES.map((cat) => (Object.assign(Object.assign({}, cat), { count: categoryCounts[cat.id] })));
};
exports.getCategories = getCategories;
const getAllCategories = () => MAIN_CATEGORIES;
exports.getAllCategories = getAllCategories;
