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
exports.resolveReActPlan = resolveReActPlan;
exports.parseReActOutput = parseReActOutput;
exports.runReActCounselAgent = runReActCounselAgent;
const llmClient_1 = require("./llmClient");
const emotionService_1 = require("../psych/emotionService");
const agentPolicy_1 = require("./agentPolicy");
const TOOL_NAMES = [
    'search_knowledge',
    'search_user_memory',
    'reflect_psych',
    'finish'
];
const MIN_ANSWER_CHARS = 80;
function resolveReActPlan(ctx) {
    var _a, _b, _c, _d;
    if ((0, agentPolicy_1.isReactDemoMode)()) {
        return { maxSteps: 4, skipSearchTools: false, prefetchOnly: false };
    }
    const hasPrefetch = ((_b = (_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0 || ((_d = (_c = ctx.prefetchedMemory) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0) > 0;
    if (ctx.risk.level === 'high' || ctx.risk.level === 'critical') {
        return { maxSteps: 2, skipSearchTools: true, prefetchOnly: true };
    }
    if (hasPrefetch) {
        return { maxSteps: 3, skipSearchTools: true, prefetchOnly: true };
    }
    return { maxSteps: 4, skipSearchTools: false, prefetchOnly: false };
}
function truncate(text, max) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : `${t.slice(0, max)}…`;
}
function parseActionInput(raw) {
    if (!(raw === null || raw === void 0 ? void 0 : raw.trim()))
        return {};
    const trimmed = raw.trim();
    try {
        return JSON.parse(trimmed);
    }
    catch (_a) {
        return { query: trimmed, answer: trimmed };
    }
}
function parseReActOutput(text) {
    var _a, _b;
    const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\nAction:|\nAction Input:|$)/i);
    const actionMatch = text.match(/Action:\s*([a-z_]+)/i);
    const inputMatch = text.match(/Action Input:\s*(\{[\s\S]*?\})(?:\s*\n|$)/i) ||
        text.match(/Action Input:\s*([\s\S]*?)(?=\nObservation:|\nThought:|\nAction:|$)/i);
    const action = (_a = actionMatch === null || actionMatch === void 0 ? void 0 : actionMatch[1]) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
    const actionInput = parseActionInput(inputMatch === null || inputMatch === void 0 ? void 0 : inputMatch[1]);
    return {
        thought: (_b = thoughtMatch === null || thoughtMatch === void 0 ? void 0 : thoughtMatch[1]) === null || _b === void 0 ? void 0 : _b.trim(),
        action: action && TOOL_NAMES.includes(action) ? action : undefined,
        actionInput
    };
}
function formatPrefetchKnowledge(items) {
    if (!items.length)
        return '未检索到相关公共知识条目。';
    return items
        .map((k, i) => `${i + 1}. ${truncate(k.question, 50)} → ${truncate(k.answer, 160)}`)
        .join('\n');
}
function formatPrefetchMemory(hits) {
    if (!hits.length)
        return '该用户暂无相关私有记忆。';
    return hits
        .map((h, i) => `${i + 1}. [相似度 ${(h.similarity * 100).toFixed(0)}%] ${truncate(h.answer || h.question, 120)}`)
        .join('\n');
}
function executeTool(action, input, ctx, plan) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const query = String(input.query || input.q || ctx.question).trim() || ctx.question;
        switch (action) {
            case 'search_knowledge': {
                if (plan.prefetchOnly && ((_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length)) {
                    return `[预检索缓存]\n${formatPrefetchKnowledge(ctx.prefetchedKnowledge)}`;
                }
                if (plan.skipSearchTools && ((_b = ctx.prefetchedKnowledge) === null || _b === void 0 ? void 0 : _b.length)) {
                    return formatPrefetchKnowledge(ctx.prefetchedKnowledge);
                }
                const { retrieveKnowledge } = yield Promise.resolve().then(() => __importStar(require('../knowledge/ragService')));
                const items = yield retrieveKnowledge(query, 2, ctx.problem.category, ctx.emotion.emotion);
                return formatPrefetchKnowledge(items);
            }
            case 'search_user_memory': {
                if (plan.prefetchOnly && ((_c = ctx.prefetchedMemory) === null || _c === void 0 ? void 0 : _c.length)) {
                    return `[预检索缓存]\n${formatPrefetchMemory(ctx.prefetchedMemory)}`;
                }
                if (plan.skipSearchTools && ((_d = ctx.prefetchedMemory) === null || _d === void 0 ? void 0 : _d.length)) {
                    return formatPrefetchMemory(ctx.prefetchedMemory);
                }
                const { searchBlendedUserMemory } = yield Promise.resolve().then(() => __importStar(require('../user/userMemoryService')));
                const hits = yield searchBlendedUserMemory(ctx.userId, query, 3);
                return formatPrefetchMemory(hits);
            }
            case 'reflect_psych':
                return executeReflectPsych(ctx);
            case 'finish': {
                const ans = String(input.answer || input.response || input.text || '').trim();
                return ans ? `已生成最终回复（${ans.length} 字）` : 'finish 缺少 answer 字段。';
            }
            default:
                return `未知工具 ${action}，可用：${TOOL_NAMES.join(', ')}`;
        }
    });
}
function executeReflectPsych(ctx) {
    return [
        `情绪：${ctx.emotion.emotion}（置信 ${(ctx.emotion.confidence * 100).toFixed(0)}%）`,
        `风险：${ctx.risk.level}`,
        `问题域：${(0, emotionService_1.getCategoryName)(ctx.problem.category)}`,
        `干预框架：${ctx.intervention.frameworkName}`,
        ctx.llmRationale ? `分析要点：${ctx.llmRationale}` : ''
    ]
        .filter(Boolean)
        .join('；');
}
function buildReActSystemPrompt(ctx, plan) {
    const prefetchNote = plan.prefetchOnly
        ? '\n编排层已预检索知识与记忆，优先 reflect_psych 后直接 finish，勿重复 search。'
        : '';
    return `你是大学生心理健康陪伴 AI，使用 ReAct（推理+行动）模式工作。

可用工具：
- search_knowledge：检索公共心理知识库，Action Input: {"query":"检索词"}
- search_user_memory：检索该用户历史咨询私有记忆，Action Input: {"query":"检索词"}
- reflect_psych：查看当前已融合的心理分析结论（无需参数）
- finish：输出最终回复，Action Input: {"answer":"给用户的完整中文回复"}

每步严格输出（不要 Markdown 代码块）：
Thought: （简短推理，中文）
Action: （工具名）
Action Input: （JSON）

收到 Observation 后继续推理，直到调用 finish。
最终 answer 须：温暖共情、约 280–480 字、两大块（共情+建议）、不做医疗诊断。${prefetchNote}
语气：${ctx.tone}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();
}
function buildReActUserPrompt(ctx, trajectory) {
    var _a, _b;
    const parts = [
        `【用户提问】${ctx.question}`,
        ctx.description ? `【补充】${ctx.description}` : '',
        ctx.historySummary ? `【历史摘要】${truncate(ctx.historySummary, 200)}` : '',
        `【开场参考】${ctx.intervention.openingPhrase}`,
        `【结尾参考】${ctx.intervention.closingPhrase}`
    ].filter(Boolean);
    if ((_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length) {
        parts.push('', '【已预检索知识】', formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2)));
    }
    if ((_b = ctx.prefetchedMemory) === null || _b === void 0 ? void 0 : _b.length) {
        parts.push('', '【已预检索记忆】', formatPrefetchMemory(ctx.prefetchedMemory.slice(0, 2)));
    }
    if (trajectory) {
        parts.push('', '【已执行步骤】', trajectory, '', '请继续下一步（或 finish）。');
    }
    else {
        parts.push('', '请先 Thought，再选择工具检索必要信息，最后 finish 输出回复。');
    }
    return parts.join('\n');
}
function generateFinishAnswer(ctx, trajectory, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const systemPrompt = buildReActSystemPrompt(ctx, { maxSteps: 1, skipSearchTools: true, prefetchOnly: true });
        const userPrompt = [
            buildReActUserPrompt(ctx, trajectory),
            '',
            '请直接输出给用户的完整中文回复（不要 Thought/Action 格式）。'
        ].join('\n');
        if (options === null || options === void 0 ? void 0 : options.onToken) {
            return ((yield (0, llmClient_1.callLlmGenerateStream)(userPrompt, {
                systemPrompt,
                temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.45,
                maxTokens: 1024,
                timeoutMs: (_b = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _b !== void 0 ? _b : 90000,
                onToken: options.onToken
            })) || '');
        }
        return ((yield (0, llmClient_1.callLlmGenerate)(userPrompt, {
            systemPrompt,
            temperature: (_c = options === null || options === void 0 ? void 0 : options.temperature) !== null && _c !== void 0 ? _c : 0.45,
            maxTokens: 1024,
            timeoutMs: (_d = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _d !== void 0 ? _d : 90000
        })) || '');
    });
}
function buildPrefetchTrajectory(ctx) {
    var _a, _b;
    const parts = [];
    if ((_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length) {
        parts.push(`Observation [prefetch]: ${formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2))}`);
    }
    if ((_b = ctx.prefetchedMemory) === null || _b === void 0 ? void 0 : _b.length) {
        parts.push(`Observation [prefetch]: ${formatPrefetchMemory(ctx.prefetchedMemory.slice(0, 2))}`);
    }
    parts.push(`Observation: ${executeReflectPsych(ctx)}`);
    return parts.join('\n');
}
function pushStep(steps, step, onStep) {
    steps.push(step);
    onStep === null || onStep === void 0 ? void 0 : onStep(step);
}
function buildResult(answer, steps, reactMode) {
    const success = answer.length >= MIN_ANSWER_CHARS;
    return {
        answer: success ? answer : '',
        steps,
        success,
        reactUsed: reactMode === 'full',
        reactMode: success ? reactMode : 'off'
    };
}
function runReActCounselAgent(ctx, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const plan = resolveReActPlan(ctx);
        const maxSteps = (_a = options === null || options === void 0 ? void 0 : options.maxSteps) !== null && _a !== void 0 ? _a : plan.maxSteps;
        const steps = [];
        let trajectory = '';
        let finalAnswer = '';
        if (plan.prefetchOnly) {
            trajectory = buildPrefetchTrajectory(ctx);
            finalAnswer = yield generateFinishAnswer(ctx, trajectory, options);
            if (finalAnswer.length >= MIN_ANSWER_CHARS) {
                pushStep(steps, {
                    step: 1,
                    thought: '编排层已注入预检索结果，单次生成最终回复',
                    action: 'finish',
                    actionInput: {},
                    observation: `已生成（${finalAnswer.length} 字）`
                }, options === null || options === void 0 ? void 0 : options.onStep);
                return buildResult(finalAnswer, steps, 'prefetch');
            }
            finalAnswer = '';
        }
        const systemPrompt = buildReActSystemPrompt(ctx, plan);
        for (let step = 1; step <= maxSteps; step += 1) {
            const userPrompt = buildReActUserPrompt(ctx, trajectory);
            const raw = (yield (0, llmClient_1.callLlmGenerate)(`${userPrompt}\n\n请输出 Thought / Action / Action Input。`, {
                systemPrompt,
                temperature: (_b = options === null || options === void 0 ? void 0 : options.temperature) !== null && _b !== void 0 ? _b : 0.42,
                maxTokens: step >= maxSteps ? 1024 : 400,
                timeoutMs: (_c = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _c !== void 0 ? _c : 90000
            })) || '';
            const parsed = parseReActOutput(raw);
            if (!parsed.action) {
                finalAnswer = yield generateFinishAnswer(ctx, trajectory, options);
                if (finalAnswer.length >= MIN_ANSWER_CHARS) {
                    pushStep(steps, {
                        step,
                        thought: parsed.thought || '解析失败，直接生成最终回复',
                        action: 'finish',
                        actionInput: {},
                        observation: `已生成（${finalAnswer.length} 字）`
                    }, options === null || options === void 0 ? void 0 : options.onStep);
                    break;
                }
                pushStep(steps, {
                    step,
                    thought: parsed.thought || raw.slice(0, 120),
                    action: 'parse_error',
                    actionInput: {},
                    observation: '未能解析 Action，终止 ReAct 循环。'
                }, options === null || options === void 0 ? void 0 : options.onStep);
                break;
            }
            if (parsed.action === 'finish') {
                finalAnswer = String(parsed.actionInput.answer || parsed.actionInput.response || parsed.actionInput.text || '').trim();
                if (!finalAnswer || finalAnswer.length < MIN_ANSWER_CHARS) {
                    finalAnswer = yield generateFinishAnswer(ctx, trajectory, options);
                }
                pushStep(steps, {
                    step,
                    thought: parsed.thought,
                    action: 'finish',
                    actionInput: parsed.actionInput,
                    observation: finalAnswer
                        ? `已生成最终回复（${finalAnswer.length} 字）`
                        : 'finish 缺少 answer 字段。'
                }, options === null || options === void 0 ? void 0 : options.onStep);
                break;
            }
            const observation = yield executeTool(parsed.action, parsed.actionInput, ctx, plan);
            pushStep(steps, {
                step,
                thought: parsed.thought,
                action: parsed.action,
                actionInput: parsed.actionInput,
                observation
            }, options === null || options === void 0 ? void 0 : options.onStep);
            trajectory += [
                trajectory ? '\n' : '',
                `Step ${step}`,
                parsed.thought ? `Thought: ${parsed.thought}` : '',
                `Action: ${parsed.action}`,
                `Action Input: ${JSON.stringify(parsed.actionInput)}`,
                `Observation: ${observation}`
            ]
                .filter(Boolean)
                .join('\n');
            if (step === maxSteps && !finalAnswer) {
                finalAnswer = yield generateFinishAnswer(ctx, trajectory, options);
                if (finalAnswer.length >= MIN_ANSWER_CHARS) {
                    pushStep(steps, {
                        step: step + 1,
                        thought: '达到步数上限，生成最终回复',
                        action: 'finish',
                        actionInput: {},
                        observation: `已生成（${finalAnswer.length} 字）`
                    }, options === null || options === void 0 ? void 0 : options.onStep);
                }
            }
        }
        const reactMode = steps.some((s) => s.action === 'search_knowledge' || s.action === 'search_user_memory')
            ? 'full'
            : steps.length > 1
                ? 'full'
                : 'prefetch';
        return buildResult(finalAnswer, steps, reactMode);
    });
}
