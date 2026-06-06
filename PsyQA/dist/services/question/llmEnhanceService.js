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
exports.generateFollowUpQuestions = generateFollowUpQuestions;
exports.mapFollowUpsToSimilarQuestions = mapFollowUpsToSimilarQuestions;
exports.generateStudentReportBrief = generateStudentReportBrief;
exports.getProblemLabel = getProblemLabel;
const ollamaClient_1 = require("../llm/ollamaClient");
const llmClient_1 = require("../llm/llmClient");
const emotionService_1 = require("../psych/emotionService");
/** 大模型生成的 1–2 个「继续聊」话术 */
function generateFollowUpQuestions(userQuery, botReply, problemLabel) {
    return __awaiter(this, void 0, void 0, function* () {
        const prompt = `你是高校心理咨询助理。根据本轮对话，给出 2 个学生可能想继续聊的中文短问句。

要求：
- 必须紧扣用户原话与助手回复，不要泛泛的「如何调节情绪」
- 每个问句 12–18 字，像学生自己会输入的那种
- 不要重复用户已经问过的话
- 输出 JSON 数组，不要其它文字

【用户】${userQuery.slice(0, 400)}
${problemLabel ? `【主题】${problemLabel}` : ''}
【助手回复摘要】${botReply.slice(0, 350)}

示例：["和舍友冷战后怎么开口？","担心冲突再来怎么办？"]

请输出 JSON 数组：`;
        const raw = yield (0, llmClient_1.callLlmGenerate)(prompt, {
            temperature: 0.35,
            maxTokens: 180,
            timeoutMs: 14000
        });
        if (!raw)
            return [];
        const obj = (0, ollamaClient_1.extractJsonObject)(raw);
        if (obj && Array.isArray(obj.items)) {
            return sanitizeFollowUps(obj.items);
        }
        const arrMatch = raw.match(/\[[\s\S]*\]/);
        if (arrMatch) {
            try {
                const parsed = JSON.parse(arrMatch[0]);
                if (Array.isArray(parsed))
                    return sanitizeFollowUps(parsed);
            }
            catch (_a) {
                /* ignore */
            }
        }
        return [];
    });
}
function sanitizeFollowUps(items) {
    return items
        .map((x) => String(x).replace(/\s+/g, ' ').trim())
        .filter((q) => q.length >= 8 && q.length <= 60)
        .slice(0, 2);
}
function mapFollowUpsToSimilarQuestions(questions) {
    return questions.map((q) => ({
        question: q,
        description: '结合本轮对话智能推荐',
        keywords: '大模型推荐',
        answers: [],
        similarity: 12
    }));
}
/** 报告顶部的学生可读摘要（大模型生成） */
function generateStudentReportBrief(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const prompt = `你是心理咨询助理。请用温暖、非诊断的语气，为学生写一段「本次咨询摘要」（80–120 汉字）。

要求：3 句话以内；第一句共情；第二句点出主要困扰与情绪；第三句一句可行建议或鼓励求助（若风险偏高须提示联系学校心理中心/热线，但不要恐吓）。

【用户原话】${params.userQuery.slice(0, 300)}
【情绪】${params.emotionLabel}
【困扰类型】${params.problemLabel}
【风险】${params.riskLabel}
【压力指数】${params.stressLevel}/100

直接输出摘要正文，不要标题、不用 JSON：`;
        const raw = yield (0, llmClient_1.callLlmGenerate)(prompt, {
            temperature: 0.4,
            maxTokens: 220,
            timeoutMs: 16000
        });
        if (!raw)
            return null;
        const text = raw.replace(/^["'「]|["'」]$/g, '').trim();
        return text.length >= 20 ? text.slice(0, 280) : null;
    });
}
function getProblemLabel(category) {
    return (0, emotionService_1.getCategoryName)(category);
}
