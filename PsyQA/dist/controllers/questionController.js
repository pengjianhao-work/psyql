"use strict";
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
exports.getSystemStats = exports.clearUserHistoryData = exports.getGroupedHistory = exports.getUserProgressText = exports.getUserProgress = exports.getInsightsStatus = exports.getAllCategories = exports.askQuestionStream = exports.askQuestion = exports.getQuestionById = exports.getQuestions = void 0;
const questionService_1 = require("../services/questionService");
const historyManager_1 = require("../services/historyManager");
const accountService_1 = require("../services/accountService");
const resolveUserId_1 = require("../utils/resolveUserId");
const schoolAlertService_1 = require("../services/schoolAlertService");
const schoolStatsCache_1 = require("../services/schoolStatsCache");
const ragService_1 = require("../services/ragService");
const vectorDBService_1 = require("../services/vectorDBService");
const memoryCache_1 = require("../utils/memoryCache");
const env_1 = require("../config/env");
const insightsStatus_1 = require("../services/insightsStatus");
let questions = [];
let questionsLoadPromise = null;
const inFlightUsers = new Set();
let activeRequests = 0;
const MAX_ACTIVE_REQUESTS = process.env.PSYQA_LOAD_TEST === '1' ? 8 : 4;
const SLOW_REQUEST_MS = 15000;
const userMetrics = new Map();
const updateUserMetrics = (userId, responseTimeMs, isFailure, riskLevel) => {
    const current = userMetrics.get(userId) || {
        userId,
        totalRequests: 0,
        slowRequests: 0,
        failedRequests: 0,
        avgResponseTimeMs: 0,
        lastResponseTimeMs: 0,
        lastRiskLevel: 'unknown',
        lastSeenAt: new Date().toISOString()
    };
    const nextTotal = current.totalRequests + 1;
    const nextAvg = (current.avgResponseTimeMs * current.totalRequests + responseTimeMs) / nextTotal;
    userMetrics.set(userId, Object.assign(Object.assign({}, current), { totalRequests: nextTotal, slowRequests: current.slowRequests + (responseTimeMs >= SLOW_REQUEST_MS ? 1 : 0), failedRequests: current.failedRequests + (isFailure ? 1 : 0), avgResponseTimeMs: Math.round(nextAvg), lastResponseTimeMs: responseTimeMs, lastRiskLevel: riskLevel, lastSeenAt: new Date().toISOString() }));
};
function validateAskRequest(req, res) {
    var _a;
    const { question: userQuestion, description } = req.body;
    const normalizedUserId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
    if (!normalizedUserId)
        return null;
    if (!userQuestion) {
        res.status(400).json({ error: 'Question is required' });
        return null;
    }
    if (String(userQuestion).length > 1200) {
        res.status(400).json({ error: 'Question is too long (max 1200 characters)' });
        return null;
    }
    if (inFlightUsers.has(normalizedUserId)) {
        res.status(429).json({ error: '上一条消息还在处理中，请稍候再发送' });
        return null;
    }
    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
        res.status(503).json({ error: '服务繁忙，请等待几秒后重试' });
        return null;
    }
    return { userQuestion: String(userQuestion), description, activeUserId: normalizedUserId };
}
function recordAskSideEffects(activeUserId, userQuestion, result, requestStart) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const elapsedMs = (_a = result.responseTime) !== null && _a !== void 0 ? _a : Date.now() - requestStart;
        const riskLevel = (_c = (_b = result.risk) === null || _b === void 0 ? void 0 : _b.level) !== null && _c !== void 0 ? _c : 'unknown';
        updateUserMetrics(activeUserId, elapsedMs, false, riskLevel);
        if (elapsedMs >= SLOW_REQUEST_MS) {
            console.warn(`Slow user request detected: user=${activeUserId}, duration=${elapsedMs}ms, risk=${riskLevel}`);
        }
        const account = activeUserId.startsWith('acc_') ? yield (0, accountService_1.getUserById)(activeUserId) : null;
        if (result.emotion && result.problem && result.risk) {
            (0, schoolStatsCache_1.recordConsultationForSchool)({
                orgId: (account === null || account === void 0 ? void 0 : account.orgId) || 'default',
                studentId: activeUserId,
                psych: {
                    emotion: result.emotion.emotion,
                    risk: result.risk.level,
                    problem: result.problem.category,
                    stressLevel: (_g = (_f = (_e = (_d = result.statModel) === null || _d === void 0 ? void 0 : _d.indices) === null || _e === void 0 ? void 0 : _e.stress) === null || _f === void 0 ? void 0 : _f.value) !== null && _g !== void 0 ? _g : 50
                }
            });
        }
        if (riskLevel === 'high' || riskLevel === 'critical') {
            (0, schoolAlertService_1.recordRiskAlert)({
                studentId: activeUserId,
                displayName: account === null || account === void 0 ? void 0 : account.displayName,
                orgId: account === null || account === void 0 ? void 0 : account.orgId,
                riskLevel,
                summary: result.summary || String(userQuestion).slice(0, 120),
                riskKeywords: ((_h = result.risk) === null || _h === void 0 ? void 0 : _h.keywords) || [],
                dialogId: result.dialogId || `dlg_${Date.now()}`,
                dialogTime: new Date().toISOString()
            });
        }
        return elapsedMs;
    });
}
function buildAskResponsePayload(userQuestion, description, result, elapsedMs) {
    var _a, _b, _c, _d, _e;
    return {
        question: userQuestion,
        description,
        knowledgeSources: result.knowledgeSources,
        similarQuestions: result.similarQuestions,
        answer: result.answer,
        summary: result.summary,
        emotion: result.emotion,
        risk: result.risk,
        problem: result.problem,
        emotionStyle: result.emotionStyle,
        intervention: result.intervention,
        carePlan: result.carePlan,
        analysisSources: result.analysisSources,
        llmUsed: result.llmUsed,
        report: result.report,
        statModel: result.statModel,
        responseTimeMs: elapsedMs,
        dialogId: result.dialogId,
        portrait: result.portrait,
        portraitPending: (_c = (_b = (_a = result.portrait) === null || _a === void 0 ? void 0 : _a.summary) === null || _b === void 0 ? void 0 : _b.includes('生成中')) !== null && _c !== void 0 ? _c : false,
        reportPending: (_e = (_d = result.report) === null || _d === void 0 ? void 0 : _d.includes('详细心理评估报告生成中')) !== null && _e !== void 0 ? _e : false
    };
}
const ensureQuestionsLoaded = () => __awaiter(void 0, void 0, void 0, function* () {
    if (questions.length > 0)
        return;
    if (!questionsLoadPromise) {
        questionsLoadPromise = (0, questionService_1.loadQuestions)()
            .then((data) => {
            questions = data;
            console.log(`Loaded ${questions.length} questions`);
        })
            .catch((error) => {
            console.error('Failed to load questions:', error);
            throw error;
        })
            .finally(() => {
            questionsLoadPromise = null;
        });
    }
    yield questionsLoadPromise;
});
void ensureQuestionsLoaded();
const getQuestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield ensureQuestionsLoaded();
    const keyword = String(req.query.keyword || '');
    const category = String(req.query.category || '');
    const limit = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;
    let filteredQuestions = questions;
    if (keyword) {
        const kw = keyword.toLowerCase();
        filteredQuestions = filteredQuestions.filter((q) => q.question.toLowerCase().includes(kw) ||
            q.description.toLowerCase().includes(kw) ||
            q.keywords.toLowerCase().includes(kw));
    }
    if (category) {
        filteredQuestions = filteredQuestions.filter((q) => q.keywords.toLowerCase().includes(category.toLowerCase()));
    }
    const startIdx = (Number(page) - 1) * Number(limit);
    const endIdx = startIdx + Number(limit);
    res.json({
        total: filteredQuestions.length,
        questions: filteredQuestions.slice(startIdx, endIdx)
    });
});
exports.getQuestions = getQuestions;
const getQuestionById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield ensureQuestionsLoaded();
    const id = Number(req.params.id);
    const question = questions.find((q) => q.questionID === id);
    if (!question) {
        return res.status(404).json({ error: 'Question not found' });
    }
    res.json(question);
});
exports.getQuestionById = getQuestionById;
const askQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsed = validateAskRequest(req, res);
    if (!parsed)
        return;
    const { userQuestion, description, activeUserId } = parsed;
    const requestStart = Date.now();
    try {
        inFlightUsers.add(activeUserId);
        activeRequests += 1;
        yield ensureQuestionsLoaded();
        const similarQuestions = (0, questionService_1.findSimilarQuestions)(userQuestion, questions, 3, description);
        const result = yield (0, questionService_1.generateAIAnswer)(userQuestion, description, similarQuestions, activeUserId);
        const elapsedMs = yield recordAskSideEffects(activeUserId, userQuestion, result, requestStart);
        res.json(buildAskResponsePayload(userQuestion, description, result, elapsedMs));
    }
    catch (error) {
        const elapsedMs = Date.now() - requestStart;
        updateUserMetrics(activeUserId, elapsedMs, true, 'unknown');
        console.error('Error generating answer:', error);
        res.status(500).json({ error: '生成回复失败，请稍后重试' });
    }
    finally {
        inFlightUsers.delete(activeUserId);
        activeRequests = Math.max(activeRequests - 1, 0);
    }
});
exports.askQuestion = askQuestion;
const askQuestionStream = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const parsed = validateAskRequest(req, res);
    if (!parsed)
        return;
    const { userQuestion, description, activeUserId } = parsed;
    const requestStart = Date.now();
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    (_a = res.flushHeaders) === null || _a === void 0 ? void 0 : _a.call(res);
    const sendEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    try {
        inFlightUsers.add(activeUserId);
        activeRequests += 1;
        yield ensureQuestionsLoaded();
        const similarQuestions = (0, questionService_1.findSimilarQuestions)(userQuestion, questions, 3, description);
        const result = yield (0, questionService_1.generateAIAnswer)(userQuestion, description, similarQuestions, activeUserId, {
            onToken: (text) => sendEvent({ type: 'token', text })
        });
        const elapsedMs = yield recordAskSideEffects(activeUserId, userQuestion, result, requestStart);
        sendEvent(Object.assign({ type: 'done' }, buildAskResponsePayload(userQuestion, description, result, elapsedMs)));
        res.end();
    }
    catch (error) {
        const elapsedMs = Date.now() - requestStart;
        updateUserMetrics(activeUserId, elapsedMs, true, 'unknown');
        console.error('Error generating stream answer:', error);
        sendEvent({ type: 'error', error: '生成回复失败，请稍后重试' });
        res.end();
    }
    finally {
        inFlightUsers.delete(activeUserId);
        activeRequests = Math.max(activeRequests - 1, 0);
    }
});
exports.askQuestionStream = askQuestionStream;
const getAllCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const categories = yield (0, memoryCache_1.cacheGetOrSet)('categories:all', env_1.env.categoriesCacheTtlMs, () => __awaiter(void 0, void 0, void 0, function* () {
        yield ensureQuestionsLoaded();
        return (0, questionService_1.getCategories)(questions);
    }));
    res.json(categories);
});
exports.getAllCategories = getAllCategories;
const getInsightsStatus = (req, res) => {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    res.json((0, insightsStatus_1.getInsightsStatusForUser)(userId));
};
exports.getInsightsStatus = getInsightsStatus;
const getUserProgress = (req, res) => {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const progress = (0, questionService_1.getUserProgressData)(userId);
    res.json(progress);
};
exports.getUserProgress = getUserProgress;
const getUserProgressText = (req, res) => {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const progressText = (0, questionService_1.getUserProgress)(userId);
    res.json({ progress: progressText });
};
exports.getUserProgressText = getUserProgressText;
const getGroupedHistory = (req, res) => {
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, req.query.userId);
    if (!userId)
        return;
    const groups = (0, historyManager_1.getGroupedUserHistory)(userId);
    res.json({ userId, groups });
};
exports.getGroupedHistory = getGroupedHistory;
const clearUserHistoryData = (req, res) => {
    var _a;
    const userId = (0, resolveUserId_1.resolveStudentUserId)(req, res, (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId);
    if (!userId)
        return;
    (0, questionService_1.clearUserHistory)(userId);
    res.json({ message: 'History cleared successfully' });
};
exports.clearUserHistoryData = clearUserHistoryData;
const getSystemStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield ensureQuestionsLoaded();
    const categories = (0, questionService_1.getCategories)(questions);
    const totalQuestions = questions.length;
    const totalCategories = categories.length;
    const totalQACount = categories.reduce((sum, cat) => sum + cat.count, 0);
    res.json({
        stats: {
            totalQuestions,
            totalCategories,
            totalQACount,
            knowledgeBaseCount: (0, ragService_1.getKnowledgeBaseCount)(),
            vectorDbCount: vectorDBService_1.vectorDb.getDocumentCount(),
            emotionTypes: 12,
            problemCategories: 11
        },
        features: [
            {
                id: 'emotion_recognition',
                name: '情绪识别',
                description: '支持12种情绪类型实时识别，包括开心、低落、焦虑、愤怒、孤独等',
                icon: '🎭'
            },
            {
                id: 'crisis_warning',
                name: '危机预警',
                description: '智能检测自杀、自残等高危关键词，自动触发干预机制',
                icon: '⚠️'
            },
            {
                id: 'rag_search',
                name: 'RAG检索',
                description: '基于22341条专业心理知识库，提供精准知识支持',
                icon: '🔍'
            },
            {
                id: 'trend_tracking',
                name: '趋势追踪',
                description: '可视化展示压力值、焦虑值、情绪平稳度变化趋势',
                icon: '📊'
            },
            {
                id: 'report_generation',
                name: '报告生成',
                description: '自动生成专业心理咨询报告，支持导出分析',
                icon: '📝'
            },
            {
                id: 'multi_user',
                name: '多用户支持',
                description: '支持多用户独立会话记录，保护个人隐私',
                icon: '👥'
            }
        ],
        modelInfo: {
            name: 'GLM-4-Flash',
            provider: 'Zhipu',
            quantization: 'cloud',
            features: ['RAG增强', '情绪感知', '上下文理解', '多轮对话']
        }
    });
});
exports.getSystemStats = getSystemStats;
