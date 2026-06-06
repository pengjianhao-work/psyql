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
exports.generateConversationPortrait = generateConversationPortrait;
const emotionService_1 = require("../psych/emotionService");
const ollamaClient_1 = require("../llm/ollamaClient");
function asStringArray(value, max = 5) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((v) => String(v).trim())
        .filter(Boolean)
        .slice(0, max);
}
function normalizeConfidence(value) {
    const v = String(value || '').toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high')
        return v;
    return 'medium';
}
function buildRulePortrait(userQuery, psych, statModel) {
    const emotion = (0, emotionService_1.getEmotionLabel)(psych.emotion);
    const problem = (0, emotionService_1.getCategoryName)(psych.problem);
    const risk = (0, emotionService_1.getRiskLabel)(psych.risk);
    const snippet = userQuery.replace(/\s+/g, ' ').slice(0, 80);
    const patterns = [];
    if (psych.stressLevel >= 70)
        patterns.push('当前压力负荷偏高');
    if (psych.anxietyLevel >= 65)
        patterns.push('焦虑反应较为明显');
    if (psych.moodStability <= 45)
        patterns.push('情绪波动需持续关注');
    if (psych.confidence < 0.5)
        patterns.push('表达中情绪信号不够清晰');
    const strengths = ['主动寻求倾诉与帮助'];
    if (userQuery.length > 40)
        strengths.push('愿意具体描述自身困扰');
    const supportNeeds = [`${problem}相关支持与疏导`];
    if (psych.risk === 'high' || psych.risk === 'critical') {
        supportNeeds.unshift('优先建立安全支持与及时联系');
    }
    const sessionNote = statModel
        ? `本次为第 ${statModel.sessionIndex} 次咨询，综合风险分 ${statModel.compositeScores.riskScore}。`
        : '';
    return {
        summary: `用户呈现${emotion}情绪，主要困扰集中在${problem}，当前风险等级为${risk}。${sessionNote}`.trim(),
        emotionalPresentation: `${emotion}（模型置信 ${Math.round(psych.confidence * 100)}%）`,
        coreConcerns: [problem, snippet].filter(Boolean),
        observedPatterns: patterns.length ? patterns : ['情绪表达尚在初步梳理阶段'],
        strengths,
        supportNeeds,
        recommendedFocus: psych.risk === 'high' || psych.risk === 'critical'
            ? '优先确认安全状态并链接可联系的支持资源'
            : `围绕「${problem}」提供共情与可执行的小步建议`,
        confidence: psych.confidence >= 0.6 ? 'medium' : 'low',
        llmUsed: false,
        generatedAt: new Date().toISOString()
    };
}
function buildLlmPortrait(userQuery, botReply, psych, priorContext, statModel) {
    return __awaiter(this, void 0, void 0, function* () {
        const prompt = `你是高校心理咨询助理，请基于单次对话生成「学生心理画像」（非医学诊断）。

【用户提问】
${userQuery.slice(0, 800)}

【系统结构化评估】
- 主情绪：${(0, emotionService_1.getEmotionLabel)(psych.emotion)}
- 问题领域：${(0, emotionService_1.getCategoryName)(psych.problem)}
- 风险等级：${(0, emotionService_1.getRiskLabel)(psych.risk)}
- 压力/焦虑/平稳度：${psych.stressLevel}/${psych.anxietyLevel}/${psych.moodStability}
${statModel ? `- 咨询次数：第 ${statModel.sessionIndex} 次` : ''}

【历史脉络（如有）】
${priorContext.slice(0, 600) || '暂无'}

【助手回复摘要】
${botReply.slice(0, 400)}

请输出 JSON（不要其它文字）：
{
  "summary": "2-3句中文画像总述，温暖客观",
  "emotionalPresentation": "情绪呈现方式一句话",
  "coreConcerns": ["核心困扰1","核心困扰2"],
  "observedPatterns": ["可观察模式1","模式2"],
  "strengths": ["资源与优势1"],
  "supportNeeds": ["支持需求1"],
  "recommendedFocus": "下次关注重点一句话",
  "confidence": "low|medium|high"
}

要求：不做诊断、不贴病理标签、不编造用户未表达的内容。`;
        const raw = yield (0, ollamaClient_1.callOllamaGenerate)(prompt, { temperature: 0.25, maxTokens: 520, timeoutMs: 35000 });
        if (!raw)
            return null;
        const obj = (0, ollamaClient_1.extractJsonObject)(raw);
        if (!obj || typeof obj.summary !== 'string')
            return null;
        return {
            summary: String(obj.summary).trim(),
            emotionalPresentation: String(obj.emotionalPresentation || (0, emotionService_1.getEmotionLabel)(psych.emotion)).trim(),
            coreConcerns: asStringArray(obj.coreConcerns, 4),
            observedPatterns: asStringArray(obj.observedPatterns, 4),
            strengths: asStringArray(obj.strengths, 4),
            supportNeeds: asStringArray(obj.supportNeeds, 4),
            recommendedFocus: String(obj.recommendedFocus || '').trim() || '继续倾听并巩固支持资源',
            confidence: normalizeConfidence(obj.confidence),
            llmUsed: true,
            generatedAt: new Date().toISOString()
        };
    });
}
function generateConversationPortrait(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const fallback = buildRulePortrait(params.userQuery, params.psych, params.statModel);
        if (params.tryLlm === false)
            return fallback;
        try {
            const llmPortrait = yield buildLlmPortrait(params.userQuery, params.botReply, params.psych, params.priorContext || '', params.statModel);
            if (llmPortrait === null || llmPortrait === void 0 ? void 0 : llmPortrait.summary) {
                return Object.assign(Object.assign({}, llmPortrait), { coreConcerns: llmPortrait.coreConcerns.length ? llmPortrait.coreConcerns : fallback.coreConcerns, observedPatterns: llmPortrait.observedPatterns.length
                        ? llmPortrait.observedPatterns
                        : fallback.observedPatterns, strengths: llmPortrait.strengths.length ? llmPortrait.strengths : fallback.strengths, supportNeeds: llmPortrait.supportNeeds.length ? llmPortrait.supportNeeds : fallback.supportNeeds });
            }
        }
        catch (err) {
            console.warn('Portrait LLM failed, using rule fallback:', err);
        }
        return fallback;
    });
}
