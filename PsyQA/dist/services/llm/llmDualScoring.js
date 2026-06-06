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
exports.isDualLlmEnabled = isDualLlmEnabled;
exports.generateWithDualScoring = generateWithDualScoring;
const ollamaAvailability_1 = require("./ollamaAvailability");
const zhipuClient_1 = require("./zhipuClient");
const ollamaClient_1 = require("./ollamaClient");
function scoreAnswerRelevance(question, answer) {
    if (!answer || answer.length < 20)
        return 0;
    const qTokens = new Set(question.replace(/\s+/g, '').slice(0, 80));
    let overlap = 0;
    for (const ch of answer.replace(/\s+/g, '').slice(0, 400)) {
        if (qTokens.has(ch))
            overlap += 1;
    }
    const lenScore = Math.min(answer.length / 600, 1) * 30;
    const overlapScore = Math.min(overlap / 12, 1) * 40;
    const structureScore = /【|建议|可以|理解/.test(answer) ? 20 : 5;
    const ethicsScore = /专业|诊断|热线|支持/.test(answer) ? 10 : 0;
    return Math.round(lenScore + overlapScore + structureScore + ethicsScore);
}
function isDualLlmEnabled() {
    return process.env.PSYQA_DUAL_LLM === '1';
}
/** 智谱 + Ollama 并行预推理，相关性打分择优 */
function generateWithDualScoring(prompt, question, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isDualLlmEnabled()) {
            return { answer: '', provider: 'single', dualMode: false };
        }
        const zhipuOk = (0, zhipuClient_1.isZhipuConfigured)();
        const ollamaOk = yield (0, ollamaAvailability_1.isOllamaAvailable)();
        if (!zhipuOk && !ollamaOk) {
            return { answer: '', provider: 'single', dualMode: false };
        }
        if (zhipuOk && !ollamaOk) {
            const answer = (yield (0, zhipuClient_1.callZhipuGenerate)(prompt, options)) || '';
            return { answer, provider: 'zhipu', dualMode: false };
        }
        if (!zhipuOk && ollamaOk) {
            const answer = (yield (0, ollamaClient_1.callOllamaGenerate)(prompt, options)) || '';
            return { answer, provider: 'ollama', dualMode: false };
        }
        const [zhipuAns, ollamaAns] = yield Promise.all([
            (0, zhipuClient_1.callZhipuGenerate)(prompt, options).catch(() => ''),
            (0, ollamaClient_1.callOllamaGenerate)(prompt, options).catch(() => '')
        ]);
        const zhipuText = zhipuAns || '';
        const ollamaText = ollamaAns || '';
        const zhipuScore = scoreAnswerRelevance(question, zhipuText);
        const ollamaScore = scoreAnswerRelevance(question, ollamaText);
        if (zhipuScore >= ollamaScore) {
            return {
                answer: zhipuText || ollamaText,
                provider: 'zhipu',
                zhipuScore,
                ollamaScore,
                dualMode: true
            };
        }
        return {
            answer: ollamaText || zhipuText,
            provider: 'ollama',
            zhipuScore,
            ollamaScore,
            dualMode: true
        };
    });
}
