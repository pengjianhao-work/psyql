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
exports.generateAIAnswer = void 0;
const ragService_1 = require("../knowledge/ragService");
const historyManager_1 = require("../common/historyManager");
const userProfileService_1 = require("../user/userProfileService");
const userMemoryService_1 = require("../user/userMemoryService");
const psychStatsService_1 = require("../psych/psychStatsService");
const portraitQueue_1 = require("../user/portraitQueue");
const reportQueue_1 = require("../common/reportQueue");
const emotionService_1 = require("../psych/emotionService");
const interventionService_1 = require("../psych/interventionService");
const psychAnalysisService_1 = require("../psych/psychAnalysisService");
const llmEnhanceService_1 = require("./llmEnhanceService");
const carePlanHints_1 = require("../psych/carePlanHints");
const ollamaClient_1 = require("../llm/ollamaClient");
const ollamaAvailability_1 = require("../llm/ollamaAvailability");
const llmClient_1 = require("../llm/llmClient");
const counselAgent_1 = require("../llm/counselAgent");
const zhipuClient_1 = require("../llm/zhipuClient");
const questionCatalog_1 = require("./questionCatalog");
const relevanceFilter_1 = require("../../utils/relevanceFilter");
const answerSanitizer_1 = require("../../utils/answerSanitizer");
const implicitNeedsService_1 = require("../psych/implicitNeedsService");
const seasonalRagPolicy_1 = require("../knowledge/seasonalRagPolicy");
const OLLAMA_GENERATE_URL = (0, ollamaClient_1.resolveOllamaGenerateUrl)();
const MODEL_CONFIGS = {
    'qwen:7b': {
        name: 'Qwen-7B',
        apiUrl: OLLAMA_GENERATE_URL,
        options: {
            temperature: 0.45,
            num_predict: 1024,
            top_p: 0.92,
            top_k: 40,
            repeat_penalty: 1.05
        }
    },
    'qwen:14b': {
        name: 'Qwen-14B',
        apiUrl: OLLAMA_GENERATE_URL,
        options: {
            temperature: 0.4,
            num_predict: 1200,
            top_p: 0.9,
            top_k: 30,
            repeat_penalty: 1.05
        }
    },
    'deepseek-chat:6.7b': {
        name: 'DeepSeek-Chat-6.7B',
        apiUrl: OLLAMA_GENERATE_URL,
        options: {
            temperature: 0.45,
            num_predict: 1200,
            top_p: 0.95,
            top_k: 50,
            repeat_penalty: 1.04
        }
    }
};
/** 聊天区展示上限（不含 ethics 页脚）*/
const MAX_ANSWER_CHARS = 900;
const MIN_ANSWER_CHARS = 120;
const KNOWLEDGE_SNIPPET_CHARS = 90;
const MAX_KNOWLEDGE_IN_BODY = 2;
const CURRENT_MODEL = (0, ollamaClient_1.getOllamaModel)();
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const cache = new Map();
const CACHE_TTL = 300000;
const CACHE_MAX_SIZE = 1000;
function getCacheKey(userId, question, riskLevel, context) {
    return `v5:${userId}:${riskLevel}:${question}:${context}`.substring(0, 320);
}
function shouldSkipAnswerCache(riskLevel) {
    return riskLevel === 'high' || riskLevel === 'critical';
}
function waitForLlmWithBackoff() {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield (0, llmClient_1.isLlmAvailable)())
            return true;
        const delays = [300, 600, 1200];
        for (const ms of delays) {
            yield new Promise((r) => setTimeout(r, ms));
            if (yield (0, llmClient_1.isLlmAvailable)(true))
                return true;
        }
        return false;
    });
}
/** 统一回复结构：共情详、建议简；去掉「今日3步」与正文内专业参考长段*/
function normalizeAnswerStructure(answer) {
    let text = answer.trim();
    text = text.replace(/\*\*今天就能开始的\s*3\s*个小步骤\*\*[\s\S]*?(?=\n\n\*\*|\n\n---|\n\n【重要说明】|$)/gi, '');
    text = text.replace(/\*\*今天\s*可做的\s*3\s*步\*\*[\s\S]*?(?=\n\n|$)/gi, '');
    text = text.replace(/\*\*今天\s*3\s*步\*\*[\s\S]*?(?=\n\n|$)/gi, '');
    text = text.replace(/\*\*专业参考\*\*[\s\S]*?(?=\n\n\*\*今天|\n\n---|\n\n【重要说明】|$)/gi, '');
    text = text.replace(/(?:\*\*参考建议\s*\d+\*\*[\s\S]*?)(?=(?:\n\n\*\*参考建议\s*\d+|\n\n\*\*今天|\n\n---|\n\n【重要说明】|$))/gi, '');
    text = text.replace(/\*\*我们可以这样理解当下\*\*\s*\n+[\s\S]*?(?=\n\n\*\*)/, '困扰往往与压力、人际或自我期待交织；先让情绪被看见，再慢慢找办法，会比逼自己立刻好起来更可持续。\n\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
}
/** 去掉 LLM 开头复述用户原话 — 见 utils/answerSanitizer.ts */
function simplifyStructureHint(hint) {
    return hint
        .replace(/[①②③④⑤]/g, '')
        .split(/[；\n]/)
        .map((s) => s.replace(/^\s*\d+\.\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((s) => (s.length > 28 ? `${s.slice(0, 28)}…` : s))
        .join(' · ');
}
function truncateSnippet(text, maxLen) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen)
        return t;
    return `${t.slice(0, maxLen)}…`;
}
function formatKnowledgeBrief(knowledge, maxItems = MAX_KNOWLEDGE_IN_BODY) {
    if (knowledge.length === 0)
        return '';
    return knowledge
        .slice(0, maxItems)
        .map((k, i) => `${i + 1}. ${truncateSnippet(k.answer, KNOWLEDGE_SNIPPET_CHARS)}`)
        .join('\n');
}
function formatKnowledgeForPrompt(knowledge) {
    return knowledge
        .map((k, i) => `${i + 1}. 问：${truncateSnippet(k.question, 40)}\n   要点：${truncateSnippet(k.answer, 120)}`)
        .join('\n\n');
}
function clampAnswerLength(answer, maxLen = MAX_ANSWER_CHARS) {
    const trimmed = answer.trim();
    if (trimmed.length <= maxLen)
        return trimmed;
    const cut = trimmed.slice(0, maxLen);
    const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('。'), cut.lastIndexOf('！'));
    if (lastBreak > maxLen * 0.55) {
        return `${cut.slice(0, lastBreak + 1).trim()}\n\n（内容较多，更多参考见下方卡片。）`;
    }
    return `${cut.trim()}…\n\n（更多参考见下方卡片。）`;
}
function getCachedAnswer(key) {
    const cached = cache.get(key);
    if (!cached) {
        return null;
    }
    if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.answer;
    }
    cache.delete(key);
    return null;
}
function setCachedAnswer(key, answer) {
    cache.set(key, { answer, timestamp: Date.now() });
    if (cache.size > CACHE_MAX_SIZE) {
        let oldestKey;
        let oldestTimestamp = Number.POSITIVE_INFINITY;
        for (const [currentKey, value] of cache.entries()) {
            if (value.timestamp < oldestTimestamp) {
                oldestTimestamp = value.timestamp;
                oldestKey = currentKey;
            }
        }
        if (oldestKey) {
            cache.delete(oldestKey);
        }
    }
}
function callLlmServiceWithRetry(prompt, config) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const text = yield (0, llmClient_1.callLlmGenerate)(prompt, {
                    temperature: config.options.temperature,
                    maxTokens: config.options.num_predict,
                    timeoutMs: 45000
                });
                if (text)
                    return text;
                (0, ollamaAvailability_1.markOllamaUnavailable)();
            }
            catch (error) {
                console.warn(`LLM 调用失败 (尝试 ${attempt}/${MAX_RETRIES}):`, error);
                (0, ollamaAvailability_1.markOllamaUnavailable)();
            }
            if (attempt < MAX_RETRIES) {
                yield new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
            }
        }
        return '';
    });
}
function buildExpandedFallbackAnswer(question, intervention, knowledge, description) {
    const empathyBlock = [
        intervention.openingPhrase,
        `听到你说「${truncateSnippet(question, 80)}」，我能感受到这对你来说并不容易。愿意把这些说出来，本身就需要勇气——你的感受是真实、值得被认真对待的，并不是「想太多」或「不够坚强」。`,
        description
            ? `你也补充提到「${truncateSnippet(description, 100)}。这些细节说明你在认真面对自己的处境，这本身就很不容易。`
            : '', '在人际、学业或生活环境里感到压抑或委屈时，不必急着给自己下结论；允许自己先停一停、把情绪放在前面被看见，往往比立刻「必须好起来」更能找到可持续的调整方式。'
    ]
        .filter(Boolean)
        .join('\n\n');
    const hintShort = simplifyStructureHint(intervention.structureHint);
    const knowledgeLine = knowledge.length > 0
        ? `（相关经验见下方「参考」卡片：${formatKnowledgeBrief(knowledge, 1)}）`
        : '';
    const adviceBlock = [`**${intervention.frameworkName}**${hintShort}${knowledgeLine}`].join('\n');
    const body = [empathyBlock, adviceBlock, intervention.closingPhrase].join('\n\n');
    return clampAnswerLength(normalizeAnswerStructure(body));
}
function ensureAnswerLength(answer, question, intervention, knowledge) {
    let trimmed = clampAnswerLength(answer.trim());
    if (trimmed.length >= MIN_ANSWER_CHARS) {
        return trimmed;
    }
    const tail = [
        intervention.closingPhrase,
        knowledge.length > 0 ? `可参考：${formatKnowledgeBrief(knowledge, 1)}` : ''
    ]
        .filter(Boolean)
        .join('\n');
    trimmed = trimmed
        ? `${trimmed}\n\n${tail}`
        : buildExpandedFallbackAnswer(question, intervention, knowledge);
    return clampAnswerLength(normalizeAnswerStructure(trimmed));
}
const buildPsychSnapshot = (emotion, risk, problem, frameworkId, sources) => {
    const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(emotion, risk, problem);
    return {
        emotion: emotion.emotion,
        risk: risk.level,
        problem: problem.category,
        confidence: emotion.confidence,
        stressLevel: metrics.stressLevel,
        anxietyLevel: metrics.anxietyLevel,
        moodStability: metrics.moodStability,
        modelStressLevel: metrics.stressLevel,
        modelAnxietyLevel: metrics.anxietyLevel,
        modelMoodStability: metrics.moodStability,
        frameworkId,
        analysisSources: sources
    };
};
function ruleOnlyPsychBundle(emotion, risk, problem) {
    return {
        emotion,
        risk,
        problem,
        sources: { emotion: 'rule', risk: 'rule', problem: 'rule' },
        llmUsed: false
    };
}
const generateAIAnswer = (question_1, description_1, similarQuestions_1, ...args_1) => __awaiter(void 0, [question_1, description_1, similarQuestions_1, ...args_1], void 0, function* (question, description, similarQuestions, userId = 'default_user', stream) {
    var _a;
    const startTime = Date.now();
    const loadTestFast = process.env.PSYQA_LOAD_TEST === '1';
    const fullText = question + (description || '');
    const lastPsych = (0, historyManager_1.getLastPsychSnapshot)(userId);
    const priorEmotion = lastPsych
        ? { emotion: lastPsych.emotion, confidence: lastPsych.confidence }
        : undefined;
    const ruleEmotion = (0, emotionService_1.analyzeEmotion)(fullText, priorEmotion);
    const ruleRisk = (0, emotionService_1.assessRisk)(fullText);
    const ruleProblem = (0, emotionService_1.analyzeProblem)(fullText);
    if (ruleRisk.level === 'critical') {
        const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(ruleEmotion, ruleRisk, ruleProblem);
        const historySnapshots = (0, historyManager_1.getUserPsychSnapshots)(userId);
        const statModel = (0, psychStatsService_1.buildPsychStatModel)(ruleEmotion, ruleRisk, ruleProblem, metrics, historySnapshots);
        const intervention = (0, interventionService_1.getInterventionPlan)(ruleEmotion.emotion, ruleProblem.category, ruleRisk.level);
        const carePlan = (0, carePlanHints_1.getCarePlanSuggestion)(ruleProblem.category);
        const emotionStyle = (0, emotionService_1.getEmotionStyle)(ruleEmotion.emotion);
        const psychSnapshot = buildPsychSnapshot(ruleEmotion, ruleRisk, ruleProblem, intervention.frameworkId, {
            emotion: 'rule',
            risk: 'rule',
            problem: 'rule'
        });
        const placeholderReport = (0, reportQueue_1.buildPlaceholderReport)(psychSnapshot);
        const priorityAnswer = `
⚠️ 我非常重视你现在的状态，你的安全是第一位的?
【安全计划· 请按顺序完成?1. 环境安全：远离可能伤害自己或他人的物品或场景
2. 当下冷静：离开冲突现场，深呼吸 10 ?3. 支持资源：联系辅导员/室友信任的同伴，并拨?${ruleRisk.hotline}
4. 如有受伤或持续冲突：拨打 120 / 110

你不是一个人。请先确保人身安全，再考虑沟通与和解读${interventionService_1.ETHICS_FOOTER}
    `.trim();
        const summary = (0, historyManager_1.generateSummary)(question, priorityAnswer, psychSnapshot);
        const dialogId = (0, historyManager_1.saveDialog)(userId, question, priorityAnswer, summary, psychSnapshot, placeholderReport);
        try {
            (0, userProfileService_1.refreshUserProfile)(userId);
            void (0, userMemoryService_1.indexUserDialogMemory)({
                userId,
                dialogTime: dialogId,
                userText: question,
                botText: priorityAnswer,
                psych: psychSnapshot
            }).catch(() => undefined);
        }
        catch (_b) {
            /* profile refresh is best-effort */
        }
        (0, reportQueue_1.scheduleReportEnrichment)({
            userId,
            dialogTime: dialogId,
            question,
            answer: priorityAnswer,
            fullText,
            priorEmotion,
            psychSnapshot,
            frameworkId: intervention.frameworkId,
            frameworkName: intervention.frameworkName,
            loadTestFast
        });
        return {
            answer: priorityAnswer,
            knowledgeSources: [],
            similarQuestions,
            vectorDbResults: [],
            summary,
            emotion: ruleEmotion,
            risk: ruleRisk,
            problem: ruleProblem,
            emotionStyle,
            intervention: { frameworkId: intervention.frameworkId, frameworkName: intervention.frameworkName },
            carePlan: { categoryName: carePlan.categoryName, suggestion: carePlan.suggestion },
            analysisSources: { emotion: 'rule', risk: 'rule', problem: 'rule' },
            llmUsed: false,
            report: placeholderReport,
            reportPending: true,
            statModel,
            modelUsed: 'Safety-Priority-Fast',
            responseTime: Date.now() - startTime,
            dialogId,
            portrait: (0, portraitQueue_1.buildPlaceholderPortrait)()
        };
    }
    const useLlm = !loadTestFast && (0, llmClient_1.shouldUseLlm)();
    let llmOk = useLlm && (yield (0, llmClient_1.isLlmAvailable)());
    if (useLlm && !llmOk) {
        llmOk = yield waitForLlmWithBackoff();
    }
    const ruleBundle = ruleOnlyPsychBundle(ruleEmotion, ruleRisk, ruleProblem);
    const ruleRetrievalQuery = (0, questionCatalog_1.enhanceQueryWithKeywords)(fullText, [
        ...ruleProblem.keywords,
        ...ruleProblem.subcategories
    ]);
    const psychPromise = llmOk
        ? (0, psychAnalysisService_1.analyzePsychState)(fullText, priorEmotion, { tryLlm: true })
        : Promise.resolve(ruleBundle);
    const retrievalPromise = Promise.resolve((0, ragService_1.retrieveKnowledge)(ruleRetrievalQuery, 3, ruleProblem.category, ruleEmotion.emotion));
    const memoryPromise = (0, userMemoryService_1.searchBlendedUserMemory)(userId, ruleRetrievalQuery, 5);
    const [psychBundle, retrievedKnowledge, vectorDbResults] = yield Promise.all([
        psychPromise,
        retrievalPromise,
        memoryPromise
    ]);
    const { emotion: rawEmotion, risk: rawRisk, problem: rawProblem, sources, llmUsed: psychLlmUsed, llmRationale } = psychBundle;
    const historySnapshots = (0, historyManager_1.getUserPsychSnapshots)(userId);
    const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(rawEmotion, rawRisk, rawProblem);
    const statModel = (0, psychStatsService_1.buildPsychStatModel)(rawEmotion, rawRisk, rawProblem, metrics, historySnapshots);
    const { emotion, risk, problem } = (0, psychStatsService_1.applyStatisticalFusion)(rawEmotion, rawRisk, rawProblem, statModel);
    statModel.compositeScores.riskLevel = risk.level;
    const intervention = (0, interventionService_1.getInterventionPlan)(emotion.emotion, problem.category, risk.level);
    const carePlan = (0, carePlanHints_1.getCarePlanSuggestion)(problem.category);
    const emotionStyle = (0, emotionService_1.getEmotionStyle)(emotion.emotion);
    const modelConfig = (_a = MODEL_CONFIGS[CURRENT_MODEL]) !== null && _a !== void 0 ? _a : MODEL_CONFIGS['qwen:7b'];
    const psychSnapshot = buildPsychSnapshot(emotion, risk, problem, intervention.frameworkId, sources);
    const placeholderReport = (0, reportQueue_1.buildPlaceholderReport)(psychSnapshot);
    const historySummaryRaw = (0, historyManager_1.getUserSummaries)(userId);
    const historySummary = historySummaryRaw.length > 400 ? `${historySummaryRaw.slice(0, 400)}…` : historySummaryRaw;
    const retrievalQuery = (0, questionCatalog_1.enhanceQueryWithKeywords)(fullText, [
        ...problem.keywords,
        ...problem.subcategories
    ]);
    const rerankedKnowledge = (0, relevanceFilter_1.filterKnowledgeForDisplay)(fullText, (0, ragService_1.mergeRankedReferencesRRF)(retrievalQuery, retrievedKnowledge, vectorDbResults, problem.category, emotion.emotion, 3), 2);
    const knowledgeContext = formatKnowledgeForPrompt(rerankedKnowledge);
    const tone = emotionStyle.tone;
    const intensityLabel = emotion.confidence >= 0.75 ? '较强' : emotion.confidence >= 0.45 ? '中等' : '轻度';
    const emotionDescription = {
        happy: '用户心情不错，保持积极、鼓励的回应',
        sad: '用户情绪低落，需要温柔安抚和情感支持',
        anxious: '用户感到焦虑，需要耐心引导和放松建议',
        angry: '用户感到愤怒，需要冷静包容和情绪疏导',
        lonely: '用户感到孤独，需要温暖陪伴和情感连接',
        neutral: '用户情绪平稳，可以正常交流',
        hopeful: '用户充满希望，给予积极鼓励和支持',
        confused: '用户感到迷茫，需要耐心引导和分析',
        frustrated: '用户感到挫败，需要理解和鼓励',
        guilty: '用户感到内疚，需要宽容和接纳',
        shameful: '用户感到羞愧，需要包容和支持',
        proud: '用户感到自豪，给予肯定和赞赏'
    }[emotion.emotion];
    const systemPrompt = `
你是一位专业的大学生心理健康陪伴AI，具备以下特质：
- 温柔、耐心、共情能力强
- 严格遵守心理咨询伦理准则
- 不做医疗诊断，只提供心理支持和建议
- 引导用户寻求专业帮助（如需要）

你的任务是：
1. 认真倾听用户的困扰
2. 给予情感上的理解和支持
3. 提供科学、实用的心理调节建议
4. 当检测到危机信号时，立即提供援助热线信息

注意事项：
- 回答要温暖、真诚，避免生硬的专业术语
- 尊重用户隐私，不评判用户的感受
- 如果不确定如何回答，坦诚说明并建议咨询专业人士
- 仅基于提供的参考知识回答，不编造信息
  `.trim();
    const recentRiskNote = lastPsych && (lastPsych.risk === 'medium' || lastPsych.risk === 'high')
        ? '近几次对话风险偏高，请缩短建议、优先提供可联系的支持资源，语气稳定克制。'
        : '';
    const agentContext = (0, userMemoryService_1.buildAgentPromptContext)(userId);
    const prompt = `
${systemPrompt}
${agentContext ? `\n${agentContext}\n` : ''}

【话术参考 · 开场】${intervention.openingPhrase}

【用户历史心理状态 · 摘要】${historySummary || '暂无历史记录'}

【问题领域】主要类型「${(0, emotionService_1.getCategoryName)(problem.category)}」
可能涉及：${problem.subcategories.length > 0 ? problem.subcategories.join('、') : '暂无'}
问题相关词：${problem.keywords.length > 0 ? problem.keywords.join('、') : '无'}

【当前情绪状态 · 大模型与规则融合】${emotionDescription}
情绪强度：${intensityLabel}
检测到的情绪关键词：${emotion.keywords.length > 0 ? emotion.keywords.join('、') : '无'}
情绪置信度：${(emotion.confidence * 100).toFixed(0)}%（若偏低请谨慎推断）
${llmRationale ? `智能分析要点：${llmRationale}` : ''}

【咨询干预框架】框架：${intervention.frameworkName}
请按以下结构展开（每一段都要写完整句子，不要只写标题或关键词）：${intervention.structureHint}
${recentRiskNote}

【回答篇幅与结构 · 必须遵守】
- 全文约 **280–480 汉字**，分 **两大块**，不要第三块行动清单
- **第一块（详细共情，约 150–220 字）**：用 2–3 段回应用户原话，肯定感受、说明「愿意说出来很不容易」、可点到宿舍/人际/学业等情境，但不要诊断
- **第二块（简要建议，约 80–120 字）**：只写框架名「${intervention.frameworkName}」+ **2–3 条**极短建议（用「·」分隔，每条不超过 20 字）；知识库最多一句「详见下方参考」
- 最后单独一句结尾：${intervention.closingPhrase}
- **禁止**：「我们可以这样理解当下」长段论述、「专业参考/参考建议」标题、粘贴知识库原文、**「今天就能开始的 3 个小步骤」或任何 3 步清单**

【参考知识 · 仅提炼要点，勿复制原文】${knowledgeContext || '暂无'}

【用户提问】
问题：${question}
${description ? `补充描述：${description}` : ''}

【回答要求】
- 以${tone}的语气，像辅导员面对面简短交流
- 先共情，再给建议；不做医疗诊断
- **禁止**以重复或复述用户原话作为开头（不要写「${question.slice(0, 30)}…」这类开场）
- 若有参考知识，最多用一两句话概括，不要展开成多篇

请直接开始回答（不要元话语、不用 Markdown 小标题堆砌）：`.trim();
    let displaySimilarQuestions = (0, relevanceFilter_1.filterSimilarQuestionsForDisplay)(question, description, similarQuestions, 2);
    const cacheKey = getCacheKey(userId, question, risk.level, historySummary.substring(0, 80));
    let answer;
    let answerLlmUsed = false;
    let reactUsed = false;
    let reactMode = 'off';
    let reactTrace;
    const cachedAnswer = !shouldSkipAnswerCache(risk.level) ? getCachedAnswer(cacheKey) : null;
    if (cachedAnswer && cachedAnswer.length >= MIN_ANSWER_CHARS) {
        console.log('使用缓存答案');
        answer = normalizeAnswerStructure(cachedAnswer);
        answerLlmUsed = llmOk;
    }
    else if (loadTestFast) {
        answer = buildExpandedFallbackAnswer(question, intervention, rerankedKnowledge, description);
    }
    else if (llmOk) {
        let llmAnswer = '';
        const tryAgent = (0, counselAgent_1.shouldRunCounselAgent)();
        if (tryAgent) {
            try {
                const agentResult = yield (0, counselAgent_1.runCounselAgent)({
                    userId,
                    question,
                    description,
                    emotion,
                    risk,
                    problem,
                    intervention,
                    historySummary,
                    agentContext,
                    tone,
                    llmRationale,
                    prefetchedKnowledge: rerankedKnowledge,
                    prefetchedMemory: vectorDbResults
                }, {
                    temperature: modelConfig.options.temperature,
                    timeoutMs: 90000,
                    onToken: stream === null || stream === void 0 ? void 0 : stream.onToken,
                    onStep: stream === null || stream === void 0 ? void 0 : stream.onReactStep
                });
                reactTrace = agentResult.steps;
                reactMode = agentResult.reactMode;
                reactUsed = agentResult.reactMode === 'full' || agentResult.reactMode === 'planner';
                if (agentResult.success && agentResult.answer.length >= MIN_ANSWER_CHARS) {
                    llmAnswer = agentResult.answer;
                }
            }
            catch (err) {
                console.warn('[counsel-agent]', err instanceof Error ? err.message : err);
            }
        }
        if (!llmAnswer) {
            try {
                if (stream === null || stream === void 0 ? void 0 : stream.onToken) {
                    const { callLlmGenerateStream } = yield Promise.resolve().then(() => __importStar(require('../llm/llmClient')));
                    llmAnswer =
                        (yield callLlmGenerateStream(prompt, {
                            temperature: modelConfig.options.temperature,
                            maxTokens: modelConfig.options.num_predict,
                            timeoutMs: 90000,
                            onToken: stream.onToken
                        })) || '';
                }
                else {
                    llmAnswer = yield callLlmServiceWithRetry(prompt, modelConfig);
                }
            }
            catch (_c) {
                llmAnswer = '';
                const { markZhipuUnavailable } = yield Promise.resolve().then(() => __importStar(require('../llm/zhipuClient')));
                markZhipuUnavailable();
            }
        }
        if (llmAnswer) {
            answerLlmUsed = true;
            answer = ensureAnswerLength((0, answerSanitizer_1.stripUserQuestionEcho)(normalizeAnswerStructure(llmAnswer), question), question, intervention, rerankedKnowledge);
            if (answer.length >= MIN_ANSWER_CHARS && !shouldSkipAnswerCache(risk.level)) {
                setCachedAnswer(cacheKey, answer);
            }
        }
        else if (rerankedKnowledge.length > 0) {
            answer = buildExpandedFallbackAnswer(question, intervention, rerankedKnowledge, description);
        }
        else if (displaySimilarQuestions.length > 0) {
            const contextAnswers = displaySimilarQuestions.flatMap((sq) => sq.answers.map((a) => a.answer_text));
            answer = generateAnswerWithContext(question, description, contextAnswers, intervention);
        }
        else {
            answer = buildExpandedFallbackAnswer(question, intervention, [], description);
        }
    }
    else {
        answer = buildExpandedFallbackAnswer(question, intervention, rerankedKnowledge, description);
    }
    if (llmOk && answer.length >= MIN_ANSWER_CHARS) {
        try {
            const llmFollowUps = yield Promise.race([
                (0, llmEnhanceService_1.generateFollowUpQuestions)(question, answer, (0, llmEnhanceService_1.getProblemLabel)(problem.category)),
                new Promise((resolve) => setTimeout(() => resolve([]), 4000))
            ]);
            const mapped = (0, llmEnhanceService_1.mapFollowUpsToSimilarQuestions)(llmFollowUps);
            if (mapped.length > 0) {
                displaySimilarQuestions = mapped;
            }
        }
        catch (err) {
            console.warn('[follow-up-questions]', err instanceof Error ? err.message : err);
        }
    }
    if (risk.level === 'high') {
        answer = `
⚠️ ${risk.warningMessage}

📞 ${risk.hotline}

${interventionService_1.HIGH_RISK_CLARIFICATION}

---

${answer}
    `.trim();
    }
    answer = clampAnswerLength((0, answerSanitizer_1.stripUserQuestionEcho)(normalizeAnswerStructure(answer), question));
    if (!answer.includes('不能替代医疗诊断')) {
        answer = `${answer}\n\n---\n\n${interventionService_1.ETHICS_FOOTER}`;
    }
    const activeModelLabel = (0, llmClient_1.getLastActiveLlmProvider)() === 'zhipu'
        ? `Zhipu-${(0, zhipuClient_1.getZhipuModel)()}${reactUsed ? '+ReAct' : ''}`
        : answerLlmUsed
            ? `${modelConfig.name}${reactUsed ? '+ReAct' : ''}`
            : 'Rule+Knowledge';
    const summary = (0, historyManager_1.generateSummary)(question, answer, psychSnapshot);
    const dialogId = (0, historyManager_1.saveDialog)(userId, question, answer, summary, psychSnapshot, placeholderReport);
    try {
        (0, userProfileService_1.refreshUserProfile)(userId);
        void (0, userMemoryService_1.indexUserDialogMemory)({
            userId,
            dialogTime: dialogId,
            userText: question,
            botText: answer,
            psych: psychSnapshot
        }).catch(() => undefined);
    }
    catch (_d) {
        /* profile refresh is best-effort */
    }
    (0, reportQueue_1.scheduleReportEnrichment)({
        userId,
        dialogTime: dialogId,
        question,
        answer,
        fullText,
        priorEmotion,
        psychSnapshot,
        frameworkId: intervention.frameworkId,
        frameworkName: intervention.frameworkName,
        loadTestFast
    });
    const responseTime = Date.now() - startTime;
    let generationHint = 'llm_ok';
    if (!useLlm || loadTestFast) {
        generationHint = rerankedKnowledge.length > 0 ? 'fast_kb' : 'rule_only';
    }
    else if (!llmOk) {
        generationHint = 'rule_only';
    }
    else if (!answerLlmUsed) {
        generationHint = rerankedKnowledge.length === 0 ? 'kb_empty' : 'llm_fallback';
    }
    const implicitHints = (0, implicitNeedsService_1.mineImplicitNeeds)(userId, question);
    const seasonal = (0, seasonalRagPolicy_1.getSeasonalRagBoost)();
    const briefReportLines = [
        `【即时简易报告】`,
        summary,
        `情绪：${emotion.emotion}（置信 ${(emotion.confidence * 100).toFixed(0)}%）`,
        `风险：${risk.level}${risk.warningMessage ? ` · ${risk.warningMessage.slice(0, 40)}` : ''}`,
        `关注领域：${(0, emotionService_1.getCategoryName)(problem.category)}`,
        `干预框架：${intervention.frameworkName}`
    ];
    if (implicitHints.length) {
        briefReportLines.push('', '【隐性关注提示】', ...implicitHints.map((h) => `· ${h.implicitConcern}`));
    }
    briefReportLines.push('', '完整评估报告正在后台生成，稍后可在侧栏查看。');
    const briefReport = briefReportLines.join('\n');
    return {
        answer,
        knowledgeSources: rerankedKnowledge,
        similarQuestions: displaySimilarQuestions,
        vectorDbResults,
        summary,
        emotion,
        risk,
        problem,
        emotionStyle,
        intervention: {
            frameworkId: intervention.frameworkId,
            frameworkName: intervention.frameworkName
        },
        carePlan: { categoryName: carePlan.categoryName, suggestion: carePlan.suggestion },
        analysisSources: sources,
        llmUsed: answerLlmUsed || psychLlmUsed,
        reactUsed,
        reactMode,
        reactTrace,
        generationHint,
        briefReport,
        implicitNeeds: implicitHints.map((h) => ({
            id: h.id,
            implicitConcern: h.implicitConcern,
            suggestedPrompt: h.suggestedPrompt,
            confidence: h.confidence
        })),
        seasonalRagLabel: seasonal.label,
        report: placeholderReport,
        reportPending: true,
        statModel,
        modelUsed: activeModelLabel,
        responseTime,
        dialogId,
        portrait: (0, portraitQueue_1.buildPlaceholderPortrait)()
    };
});
exports.generateAIAnswer = generateAIAnswer;
const generateAnswerWithContext = (question, description, contextAnswers, intervention) => {
    const empathyBlock = [
        intervention.openingPhrase,
        `听到你说「${truncateSnippet(question, 80)}」，不少同学也会在类似情境里感到为难。你的感受很重要，也值得被认真看见。`,
        description ? `你提到：${truncateSnippet(description, 100)}。` : '',
        '愿意把这些讲出来本身就需要勇气，不必急着给自己贴标签或立刻找到完美答案。'
    ]
        .filter(Boolean)
        .join('\n\n');
    const refLine = contextAnswers.length > 0
        ? `（相似情境要点见下方参考：${truncateSnippet(contextAnswers[0], 60)}）`
        : '';
    const body = [
        empathyBlock,
        `**${intervention.frameworkName}**${simplifyStructureHint(intervention.structureHint)}${refLine}`,
        intervention.closingPhrase
    ].join('\n\n');
    return clampAnswerLength(normalizeAnswerStructure(body));
};
