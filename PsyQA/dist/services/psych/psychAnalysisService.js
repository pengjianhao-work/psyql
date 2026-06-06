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
exports.analyzePsychState = analyzePsychState;
const emotionService_1 = require("./emotionService");
const ollamaClient_1 = require("../llm/ollamaClient");
const EMOTION_SET = new Set([
    'happy', 'sad', 'anxious', 'angry', 'lonely', 'neutral',
    'hopeful', 'confused', 'frustrated', 'guilty', 'shameful', 'proud'
]);
const RISK_ORDER = ['low', 'medium', 'high', 'critical'];
const PROBLEM_SET = new Set([
    'academic_stress', 'interpersonal', 'family_relationship', 'romantic_relationship',
    'career_future', 'self_identity', 'emotion_regulation', 'body_image', 'addiction', 'trauma', 'other'
]);
function maxRisk(a, b) {
    return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}
function analyzeWithLlm(text) {
    return __awaiter(this, void 0, void 0, function* () {
        const prompt = `你是心理咨询助理。仅根据用户表述输出 JSON，不要其它文字。

用户文本：
"""
${text.slice(0, 1500)}
"""

字段说明：
- emotion: 主情绪，只能是 happy|sad|anxious|angry|lonely|neutral|hopeful|confused|frustrated|guilty|shameful|proud
- secondaryEmotions: 次要情绪数组，最多3个
- confidence: 0到1之间小数
- risk: low|medium|high|critical（无自伤意图勿用 critical）
- problem: academic_stress|interpersonal|family_relationship|romantic_relationship|career_future|self_identity|emotion_regulation|body_image|addiction|trauma|other
- rationale: 一句中文理由

示例输出：
{"emotion":"anxious","secondaryEmotions":["sad"],"confidence":0.72,"risk":"low","problem":"academic_stress","rationale":"提及考试压力与失眠"}

请输出 JSON：`;
        const raw = yield (0, ollamaClient_1.callOllamaGenerate)(prompt, { temperature: 0.1, maxTokens: 280 });
        if (!raw)
            return null;
        const obj = (0, ollamaClient_1.extractJsonObject)(raw);
        if (!obj)
            return null;
        return obj;
    });
}
function mergeEmotion(rule, llm) {
    if (!(llm === null || llm === void 0 ? void 0 : llm.emotion) || !EMOTION_SET.has(llm.emotion)) {
        return { emotion: rule, source: 'rule' };
    }
    const primary = llm.emotion;
    const secondary = (llm.secondaryEmotions || [])
        .filter((e) => EMOTION_SET.has(e) && e !== primary)
        .slice(0, 3);
    const conf = typeof llm.confidence === 'number'
        ? Math.min(0.95, Math.max(0.2, llm.confidence))
        : Math.max(rule.confidence, 0.5);
    if (rule.confidence >= 0.55 && rule.emotion !== 'neutral' && rule.emotion !== primary) {
        return {
            emotion: {
                emotion: primary,
                confidence: conf * 0.65 + rule.confidence * 0.35,
                keywords: rule.keywords,
                secondaryEmotions: [...new Set([...secondary, ...rule.secondaryEmotions])].slice(0, 3)
            },
            source: 'hybrid'
        };
    }
    return {
        emotion: {
            emotion: primary,
            confidence: conf,
            keywords: rule.keywords,
            secondaryEmotions: secondary.length ? secondary : rule.secondaryEmotions
        },
        source: rule.confidence < 0.45 ? 'llm' : 'hybrid'
    };
}
function mergeRisk(rule, llm) {
    if (!(llm === null || llm === void 0 ? void 0 : llm.risk) || !RISK_ORDER.includes(llm.risk)) {
        return { risk: rule, source: 'rule' };
    }
    const llmLevel = llm.risk;
    const level = maxRisk(rule.level, llmLevel);
    if (level === rule.level) {
        return { risk: rule, source: 'rule' };
    }
    if (level === llmLevel && llmLevel !== rule.level) {
        return {
            risk: Object.assign(Object.assign({}, rule), { level, warningMessage: rule.warningMessage || '模型评估提示需要额外关注，建议与信任的人沟通或寻求专业支持。' }),
            source: 'llm'
        };
    }
    return { risk: rule, source: 'hybrid' };
}
function mergeProblem(rule, llm) {
    if (!(llm === null || llm === void 0 ? void 0 : llm.problem) || !PROBLEM_SET.has(llm.problem)) {
        return { problem: rule, source: 'rule' };
    }
    const cat = llm.problem;
    if (rule.category !== 'other' && rule.category !== cat && rule.confidence >= 0.5) {
        return { problem: rule, source: 'hybrid' };
    }
    return {
        problem: Object.assign(Object.assign({}, rule), { category: cat, confidence: Math.max(rule.confidence, typeof llm.confidence === 'number' ? llm.confidence * 0.5 : 0.45) }),
        source: rule.confidence < 0.45 ? 'llm' : 'hybrid'
    };
}
function analyzePsychState(text, prior, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const ruleEmotion = (0, emotionService_1.analyzeEmotion)(text, prior);
        const ruleRisk = (0, emotionService_1.assessRisk)(text);
        const ruleProblem = (0, emotionService_1.analyzeProblem)(text);
        const tryLlm = (options === null || options === void 0 ? void 0 : options.tryLlm) !== false;
        let llm = null;
        if (tryLlm) {
            llm = yield analyzeWithLlm(text);
        }
        const { emotion, source: emotionSource } = mergeEmotion(ruleEmotion, llm);
        const { risk, source: riskSource } = mergeRisk(ruleRisk, llm);
        const { problem, source: problemSource } = mergeProblem(ruleProblem, llm);
        return {
            emotion,
            risk,
            problem,
            sources: {
                emotion: emotionSource,
                risk: riskSource,
                problem: problemSource
            },
            llmUsed: Boolean(llm),
            llmRationale: typeof (llm === null || llm === void 0 ? void 0 : llm.rationale) === 'string' ? llm.rationale : undefined
        };
    });
}
