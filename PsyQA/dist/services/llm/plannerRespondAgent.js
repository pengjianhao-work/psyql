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
exports.runPlannerRespondAgent = runPlannerRespondAgent;
const llmClient_1 = require("./llmClient");
function truncate(text, max) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : `${t.slice(0, max)}…`;
}
function ruleBasedPlan(ctx) {
    var _a, _b, _c, _d, _e, _f;
    const hasKnowledge = ((_b = (_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0;
    const hasMemory = ((_d = (_c = ctx.prefetchedMemory) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0) > 0;
    const complex = ctx.question.length > 80 ||
        Boolean(ctx.description) ||
        ((_f = (_e = ctx.historySummary) === null || _e === void 0 ? void 0 : _e.length) !== null && _f !== void 0 ? _f : 0) > 120;
    return {
        useKnowledge: hasKnowledge,
        useMemory: hasMemory,
        usePsych: true,
        reason: complex ? '多轮/长文本，启用完整上下文' : '标准咨询，精简上下文'
    };
}
function llmPlanner(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const raw = (yield (0, llmClient_1.callLlmGenerate)(`用户问题：${ctx.question}
${ctx.description ? `补充：${ctx.description}` : ''}
已有知识条数：${(_b = (_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0}
已有记忆条数：${(_d = (_c = ctx.prefetchedMemory) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0}
风险：${ctx.risk.level}

输出 JSON（仅 JSON）：{"useKnowledge":true/false,"useMemory":true/false,"usePsych":true/false,"reason":"一句话"}`, { temperature: 0.2, maxTokens: 120, timeoutMs: 15000 })) || '';
        try {
            const m = raw.match(/\{[\s\S]*\}/);
            if (!m)
                return null;
            return JSON.parse(m[0]);
        }
        catch (_e) {
            return null;
        }
    });
}
function formatPrefetchContext(ctx, plan) {
    var _a, _b;
    const parts = [];
    if (plan.usePsych) {
        parts.push(`【心理分析】情绪 ${ctx.emotion.emotion}；风险 ${ctx.risk.level}；领域 ${ctx.problem.category}`);
        if (ctx.llmRationale)
            parts.push(`要点：${ctx.llmRationale}`);
    }
    if (plan.useKnowledge && ((_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length)) {
        parts.push('【参考知识】\n' +
            ctx.prefetchedKnowledge
                .map((k, i) => `${i + 1}. ${truncate(k.question, 40)} → ${truncate(k.answer, 140)}`)
                .join('\n'));
    }
    if (plan.useMemory && ((_b = ctx.prefetchedMemory) === null || _b === void 0 ? void 0 : _b.length)) {
        parts.push('【用户记忆】\n' +
            ctx.prefetchedMemory
                .map((h, i) => `${i + 1}. [${(h.similarity * 100).toFixed(0)}%] ${truncate(h.answer || h.question, 120)}`)
                .join('\n'));
    }
    return parts.join('\n\n');
}
function buildResponderSystem(ctx) {
    return `你是大学生心理健康陪伴 AI。温暖共情、约 280–480 字、两大块（共情+建议）、不做医疗诊断。
语气：${ctx.tone}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();
}
function runPlannerRespondAgent(ctx, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const steps = [];
        const emit = (step) => {
            var _a;
            steps.push(step);
            (_a = options === null || options === void 0 ? void 0 : options.onStep) === null || _a === void 0 ? void 0 : _a.call(options, step);
        };
        const useLlmPlanner = (_a = options === null || options === void 0 ? void 0 : options.useLlmPlanner) !== null && _a !== void 0 ? _a : process.env.PSYQA_AGENT_PLANNER === '1';
        const plan = useLlmPlanner ? (_b = (yield llmPlanner(ctx))) !== null && _b !== void 0 ? _b : ruleBasedPlan(ctx) : ruleBasedPlan(ctx);
        emit({
            step: 1,
            thought: plan.reason,
            action: 'plan',
            actionInput: Object.assign({}, plan),
            observation: `知识=${plan.useKnowledge} 记忆=${plan.useMemory} 心理=${plan.usePsych}`
        });
        const contextBlock = formatPrefetchContext(ctx, plan);
        const userPrompt = [
            `【用户提问】${ctx.question}`,
            ctx.description ? `【补充】${ctx.description}` : '',
            ctx.historySummary ? `【历史摘要】${truncate(ctx.historySummary, 200)}` : '',
            contextBlock,
            `【开场参考】${ctx.intervention.openingPhrase}`,
            `【结尾参考】${ctx.intervention.closingPhrase}`,
            '',
            '请直接输出给用户的完整中文回复（不要 Thought/Action 格式）。'
        ]
            .filter(Boolean)
            .join('\n');
        const systemPrompt = buildResponderSystem(ctx);
        let finalAnswer = '';
        if (options === null || options === void 0 ? void 0 : options.onToken) {
            finalAnswer =
                (yield (0, llmClient_1.callLlmGenerateStream)(userPrompt, {
                    systemPrompt,
                    temperature: (_c = options === null || options === void 0 ? void 0 : options.temperature) !== null && _c !== void 0 ? _c : 0.45,
                    maxTokens: 1024,
                    timeoutMs: (_d = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _d !== void 0 ? _d : 90000,
                    onToken: options.onToken
                })) || '';
        }
        else {
            finalAnswer =
                (yield (0, llmClient_1.callLlmGenerate)(userPrompt, {
                    systemPrompt,
                    temperature: (_e = options === null || options === void 0 ? void 0 : options.temperature) !== null && _e !== void 0 ? _e : 0.45,
                    maxTokens: 1024,
                    timeoutMs: (_f = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _f !== void 0 ? _f : 90000
                })) || '';
        }
        emit({
            step: 2,
            thought: '基于规划上下文生成回复',
            action: 'respond',
            actionInput: {},
            observation: finalAnswer ? `已生成（${finalAnswer.length} 字）` : '生成失败'
        });
        const success = finalAnswer.length >= 80;
        const reactMode = success ? 'planner' : 'off';
        return {
            answer: success ? finalAnswer : '',
            steps,
            success,
            reactUsed: success,
            reactMode
        };
    });
}
