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
exports.formatTurnMemory = formatTurnMemory;
exports.parseReActOutput = parseReActOutput;
exports.runReActCounselAgent = runReActCounselAgent;
const llmClient_1 = require("./llmClient");
const emotionService_1 = require("../psych/emotionService");
const agentPolicy_1 = require("./agentPolicy");
const userMemoryService_1 = require("../user/userMemoryService");
const counselReplyPolicy_1 = require("./counselReplyPolicy");
const forumStyleSanitizer_1 = require("../../utils/forumStyleSanitizer");
const wikiService_1 = require("../wiki/wikiService");
const counselTools_1 = require("./counselTools");
const MIN_ANSWER_CHARS = 80;
function resolveReActPlan(ctx) {
    var _a, _b, _c, _d;
    if ((0, agentPolicy_1.isStrictFullReAct)()) {
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
function formatTurnMemory(ctx) {
    const continuing = ctx.continuePrevious === true;
    return [
        ctx.recentDialogs
            ? continuing
                ? `【短期会话记忆】用户在接着上一轮说。接这些原话往下说。\n${ctx.recentDialogs}`
                : `【短期会话记忆】这是上一轮，只供认识对方。这轮如果换了话题，不要把这些内容写进回答。\n${ctx.recentDialogs}`
            : '',
        ctx.workingMemory
            ? continuing
                ? `【工作记忆】沿着上一轮议题往下做。\n${ctx.workingMemory}`
                : `【工作记忆】下面是上一轮的议题和情绪，不是这轮要回答的问题。\n${ctx.workingMemory}`
            : '',
        ctx.durableMemory
            ? `【长期记忆 · 习惯与做过的事】只用来调整语气、避开敏感点、沿用对方觉得有用的做法。不要把旧议题当成这轮的问题。\n${ctx.durableMemory}`
            : '',
        !ctx.workingMemory && ctx.historySummary
            ? `【历史摘要】只说明这个人，不要把摘要里的旧事写进这轮回答。\n${truncate(ctx.historySummary, 240)}`
            : '',
        ctx.intentDirective ? `【意图要求】${ctx.intentDirective}` : '',
        ctx.answerVariationHint || ''
    ].filter(Boolean);
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
function parseActionInputJson(raw) {
    const start = raw.indexOf('{');
    if (start < 0)
        return undefined;
    let depth = 0;
    for (let i = start; i < raw.length; i += 1) {
        const ch = raw[i];
        if (ch === '{')
            depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0)
                return raw.slice(start, i + 1);
        }
    }
    return undefined;
}
function normalizeReActAction(text) {
    var _a, _b;
    const line = ((_b = (_a = text.match(/Action:\s*([^\n]+)/i)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.trim().toLowerCase()) || '';
    if (!line)
        return undefined;
    if (line.startsWith('finish'))
        return 'finish';
    if (line.includes('reflect') || line.includes('psych'))
        return 'reflect_psych';
    if (line.includes('micro') || line.includes('training'))
        return 'suggest_micro_training';
    if (line.includes('video'))
        return 'recommend_video';
    if (line.includes('memory'))
        return 'search_user_memory';
    if (line.includes('checkin') || line.includes('check_in') || line.includes('打卡') || line.includes('mood')) {
        return 'log_mood_checkin';
    }
    if (line.includes('counseling') || line.includes('resource') || line.includes('求助')) {
        return 'suggest_counseling_resource';
    }
    if (line.includes('wiki'))
        return 'search_wiki';
    if (line.includes('profile') || line.includes('画像'))
        return 'get_user_profile';
    if (line.includes('knowledge') || line === 'search')
        return 'search_knowledge';
    const token = line.replace(/\s+/g, '_');
    return counselTools_1.TOOL_NAMES.includes(token) ? token : undefined;
}
function parseReActOutput(text) {
    var _a;
    const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\nAction:|\nAction Input:|$)/i);
    const action = normalizeReActAction(text);
    const inputMarker = text.match(/Action Input:\s*/i);
    let actionInput = {};
    if (inputMarker && inputMarker.index !== undefined) {
        const tail = text.slice(inputMarker.index + inputMarker[0].length);
        const jsonBlock = parseActionInputJson(tail);
        actionInput = parseActionInput(jsonBlock || tail.split('\n')[0]);
    }
    return {
        thought: (_a = thoughtMatch === null || thoughtMatch === void 0 ? void 0 : thoughtMatch[1]) === null || _a === void 0 ? void 0 : _a.trim(),
        action,
        actionInput
    };
}
function formatPrefetchKnowledge(items) {
    if (!items.length)
        return '未检索到相关公共知识条目。';
    return items
        .map((k, i) => {
        const question = (0, forumStyleSanitizer_1.sanitizeForumStyle)(k.question);
        const answer = (0, forumStyleSanitizer_1.sanitizeForumStyle)(k.answer);
        return `${i + 1}. ${truncate(question, 50)} → ${truncate(answer, 160)}`;
    })
        .join('\n');
}
function formatPrefetchMemory(ctx, hits) {
    return ((0, userMemoryService_1.formatPersonalMemories)(hits, ctx.recentDialogs, {
        question: ctx.question,
        continuePrevious: ctx.continuePrevious
    }) || '没有和这轮问题相关的更早原话。');
}
function groundedQuery(ctx, toolQuery) {
    if (ctx.continuePrevious)
        return toolQuery.trim() || ctx.question;
    return ctx.question;
}
function executeTool(action, input, ctx, plan) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const query = groundedQuery(ctx, String(input.query || input.q || ctx.question));
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
                    return `[预检索缓存]\n${formatPrefetchMemory(ctx, ctx.prefetchedMemory)}`;
                }
                if (plan.skipSearchTools && ((_d = ctx.prefetchedMemory) === null || _d === void 0 ? void 0 : _d.length)) {
                    return formatPrefetchMemory(ctx, ctx.prefetchedMemory);
                }
                const { searchBlendedUserMemory } = yield Promise.resolve().then(() => __importStar(require('../user/userMemoryService')));
                const hits = yield searchBlendedUserMemory(ctx.userId, query, 3);
                return formatPrefetchMemory(ctx, hits);
            }
            case 'search_wiki': {
                if (ctx.risk.level === 'high' || ctx.risk.level === 'critical') {
                    return '高风险或危机时不注入主题知识页，优先安全与求助通道。';
                }
                const hits = yield (0, wikiService_1.searchWiki)(query, { category: ctx.problem.category, topK: 2 });
                return hits.length ? (0, wikiService_1.formatWikiForPrompt)(hits) : '没有匹配的主题知识页。';
            }
            case 'get_user_profile': {
                const { getOrRefreshUserProfile } = yield Promise.resolve().then(() => __importStar(require('../user/userProfileService')));
                const profile = getOrRefreshUserProfile(ctx.userId);
                if (!profile.sessionCount) {
                    return '该用户还没有咨询记录，暂无画像。';
                }
                const concerns = profile.topConcerns.map((c) => `${c.label}×${c.count}`).join('、');
                return [
                    profile.summary,
                    concerns ? `困扰分布：${concerns}` : '',
                    profile.recentThemes.length ? `反复主题：${profile.recentThemes.join('、')}` : ''
                ]
                    .filter(Boolean)
                    .join('\n');
            }
            case 'log_mood_checkin': {
                const mood = String(input.mood || '').trim();
                if (!mood)
                    return 'log_mood_checkin 缺少 mood 字段。';
                const { addMoodCheckin } = yield Promise.resolve().then(() => __importStar(require('../user/moodCheckinService')));
                const checkin = addMoodCheckin(ctx.userId, mood, input.note ? String(input.note) : undefined);
                return `已记录情绪打卡：${checkin.mood}${checkin.note ? `（${checkin.note}）` : ''}`;
            }
            case 'suggest_counseling_resource':
                return [
                    '现实求助渠道（不要编造具体电话或地址）：',
                    '· 身边可信任的人：室友、家人、辅导员或班主任',
                    '· 学校心理咨询中心：通过学校官方渠道查询预约方式',
                    `· ${ctx.risk.hotline || '全国心理援助热线：400-161-9995'}`
                ].join('\n');
            case 'reflect_psych':
                return executeReflectPsych(ctx);
            case 'suggest_micro_training': {
                const { suggestMicroTrainings, formatMicroTrainingObservation } = yield Promise.resolve().then(() => __importStar(require('../psych/microTrainingCatalog')));
                return formatMicroTrainingObservation(suggestMicroTrainings({
                    emotion: ctx.emotion.emotion,
                    problem: ctx.problem.category,
                    risk: ctx.risk.level,
                    limit: 2
                }));
            }
            case 'recommend_video': {
                if (ctx.risk.level === 'high' || ctx.risk.level === 'critical') {
                    return '高风险或危机时不推荐视频，优先安全与求助通道。';
                }
                const { shouldRecommendVideos, recommendVideos } = yield Promise.resolve().then(() => __importStar(require('../video/videoRecommendationService')));
                if (!shouldRecommendVideos(ctx.emotion, ctx.risk)) {
                    return '当前情绪/风险不适合推视频，可继续共情与小步支持。';
                }
                const videos = yield recommendVideos({
                    userId: ctx.userId,
                    question: ctx.question,
                    emotion: ctx.emotion,
                    problem: ctx.problem
                });
                if (!videos.length)
                    return '未匹配到合适视频。';
                return videos
                    .slice(0, 2)
                    .map((v, i) => `${i + 1}. ${truncate(v.title, 40)}（${v.url}）`)
                    .join('\n');
            }
            case 'finish': {
                const ans = String(input.answer || input.response || input.text || '').trim();
                return ans ? `已生成最终回复（${ans.length} 字）` : 'finish 缺少 answer 字段。';
            }
            default:
                return `未知工具 ${action}，可用：${counselTools_1.TOOL_NAMES.join(', ')}`;
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
        ? '\n编排层已预检索知识与记忆，优先 reflect_psych 后直接 finish，勿重复 search。高风险时禁止微训练与视频工具。'
        : '';
    return `你是大学生心理健康陪伴 AI，使用 ReAct（推理+行动）模式工作。

可用工具：
${counselTools_1.COUNSEL_TOOL_DEFS.map((def) => `- ${def.signature}`).join('\n')}


每步严格输出（不要 Markdown 代码块）：
Thought: （简短推理，中文）
Action: （工具名）
Action Input: （JSON）

收到 Observation 后继续推理，直到调用 finish。
最终 answer 须遵守：${counselReplyPolicy_1.CAMPUS_REPLY_REQUIREMENT}
${ctx.replyGuidance ? `本轮语气与结构要求：${ctx.replyGuidance}` : '温暖共情、约 350–600 字、两大块（共情+建议）。'}${prefetchNote}

【finish 的 answer 格式（必须遵守）】
第一段用 2–3 句接住用户这轮原话；第二段用「·」逐条换行列 3–4 条建议，每条 20–45 字，单独一行；最后一句鼓励收尾。
不要用 Markdown 标题，不要罗列工具名、视频标题或“已检索”字样；不要一次只给一个动作。
${ctx.replyGuidance ? '' : `语气：${ctx.tone}`}

${userMemoryService_1.MEMORY_BOUNDARY}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();
}
function buildReActUserPrompt(ctx, trajectory) {
    var _a, _b, _c;
    const parts = [
        `【用户提问】${ctx.question}`,
        ctx.description ? `【补充】${ctx.description}` : '',
        ...formatTurnMemory(ctx),
        ctx.replyGuidance ? '' : `【开场参考】${ctx.intervention.openingPhrase}`,
        ctx.replyGuidance ? '' : `【结尾参考】${ctx.intervention.closingPhrase}`
    ].filter(Boolean);
    if ((_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length) {
        parts.push('', '【已预检索知识】', formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2)));
    }
    if ((_b = ctx.prefetchedWiki) === null || _b === void 0 ? void 0 : _b.length) {
        parts.push('', '【内部主题背景 · 只帮你把握方向，不要复述、不要照抄、不要改变对用户的共情】', (0, wikiService_1.formatWikiForPrompt)(ctx.prefetchedWiki));
    }
    if ((_c = ctx.prefetchedMemory) === null || _c === void 0 ? void 0 : _c.length) {
        parts.push('', '【已预检索记忆】', formatPrefetchMemory(ctx, ctx.prefetchedMemory.slice(0, 2)));
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
        parts.push(`Observation [prefetch]: ${formatPrefetchMemory(ctx, ctx.prefetchedMemory.slice(0, 2))}`);
    }
    parts.push(`Observation: ${executeReflectPsych(ctx)}`);
    return parts.join('\n');
}
function pushStep(steps, step, onStep) {
    steps.push(step);
    onStep === null || onStep === void 0 ? void 0 : onStep(step);
}
function buildResult(answer, steps, reactMode, minAnswerChars) {
    const success = answer.trim().length >= minAnswerChars;
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
        const minAnswerChars = ctx.replyGuidance ? 1 : MIN_ANSWER_CHARS;
        const plan = resolveReActPlan(ctx);
        const maxSteps = (_a = options === null || options === void 0 ? void 0 : options.maxSteps) !== null && _a !== void 0 ? _a : plan.maxSteps;
        const steps = [];
        let trajectory = '';
        let finalAnswer = '';
        if (plan.prefetchOnly) {
            trajectory = buildPrefetchTrajectory(ctx);
            finalAnswer = yield generateFinishAnswer(ctx, trajectory, options);
            if (finalAnswer.length >= minAnswerChars) {
                pushStep(steps, {
                    step: 1,
                    thought: '编排层已注入预检索结果，单次生成最终回复',
                    action: 'finish',
                    actionInput: {},
                    observation: `已生成（${finalAnswer.length} 字）`
                }, options === null || options === void 0 ? void 0 : options.onStep);
                return buildResult(finalAnswer, steps, 'prefetch', minAnswerChars);
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
                if (finalAnswer.length >= minAnswerChars) {
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
                if (!finalAnswer || finalAnswer.length < minAnswerChars) {
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
                if (finalAnswer.length >= minAnswerChars) {
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
        return buildResult(finalAnswer, steps, reactMode, minAnswerChars);
    });
}
