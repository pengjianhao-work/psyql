import type { KnowledgeItem } from '../knowledge/ragService';
import type { SearchResult } from '../knowledge/vectorDBService';
import { formatPersonalMemories, MEMORY_BOUNDARY } from '../user/userMemoryService';
import { getCategoryName, type EmotionAnalysis, type RiskAssessment, type ProblemAnalysis, type ProblemCategory } from '../psych/emotionService';
import { callLlmGenerate, callLlmGenerateStream } from './llmClient';
import { isStrictFullReAct } from './agentPolicy';
import type { ReactMode } from './agentPolicy';
import { isValidCounselAnswer, sanitizeCounselAnswer } from './counselAnswerSanitizer';
import { CAMPUS_REPLY_REQUIREMENT } from './counselReplyPolicy';

export interface ReActStep {
  step: number;
  thought?: string;
  action: string;
  actionInput: Record<string, unknown>;
  observation: string;
}

export interface ReActCounselContext {
  userId: string;
  question: string;
  description?: string;
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem: ProblemAnalysis;
  intervention: {
    frameworkName: string;
    structureHint: string;
    openingPhrase: string;
    closingPhrase: string;
  };
  historySummary: string;
  /** 上一轮及更早的用户原话和回应，供多轮接着说 */
  recentDialogs?: string;
  /** 当前议题、情绪走向、上一轮用过的方法 */
  workingMemory?: string;
  /** 沟通习惯、反复议题、以往用过的方法 */
  durableMemory?: string;
  /** 这轮是在接着上一轮说。新话题时为 false，旧事不能进入回答和检索 */
  continuePrevious?: boolean;
  agentContext: string;
  tone: string;
  llmRationale?: string;
  prefetchedKnowledge?: KnowledgeItem[];
  prefetchedMemory?: SearchResult[];
  /** 重复提问时提示模型换表述，避免与上次雷同 */
  answerVariationHint?: string;
  /** 本轮意图对回答姿态的要求 */
  intentDirective?: string;
}

export interface ReActCounselResult {
  answer: string;
  steps: ReActStep[];
  success: boolean;
  /** @deprecated 使用 reactMode */
  reactUsed: boolean;
  reactMode: ReactMode;
}

export interface ReActPlan {
  maxSteps: number;
  skipSearchTools: boolean;
  prefetchOnly: boolean;
}

const TOOL_NAMES = [
  'search_knowledge',
  'search_user_memory',
  'reflect_psych',
  'finish'
] as const;

const MIN_ANSWER_CHARS = 80;

export function resolveReActPlan(ctx: ReActCounselContext): ReActPlan {
  if (isStrictFullReAct()) {
    return { maxSteps: 4, skipSearchTools: false, prefetchOnly: false };
  }

  const hasPrefetch =
    (ctx.prefetchedKnowledge?.length ?? 0) > 0 || (ctx.prefetchedMemory?.length ?? 0) > 0;

  if (ctx.risk.level === 'high' || ctx.risk.level === 'critical') {
    return { maxSteps: 2, skipSearchTools: true, prefetchOnly: true };
  }
  if (hasPrefetch) {
    return { maxSteps: 3, skipSearchTools: true, prefetchOnly: true };
  }
  return { maxSteps: 4, skipSearchTools: false, prefetchOnly: false };
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function parseActionInput(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { query: trimmed, answer: trimmed };
  }
}

function parseActionInputJson(raw: string): string | undefined {
  const start = raw.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return undefined;
}

function normalizeReActAction(text: string): string | undefined {
  const line = text.match(/Action:\s*([^\n]+)/i)?.[1]?.trim().toLowerCase() || '';
  if (!line) return undefined;
  if (line.startsWith('finish')) return 'finish';
  if (line.includes('reflect') || line.includes('psych')) return 'reflect_psych';
  if (line.includes('memory')) return 'search_user_memory';
  if (line.includes('knowledge') || line === 'search') return 'search_knowledge';
  const token = line.replace(/\s+/g, '_');
  return TOOL_NAMES.includes(token as (typeof TOOL_NAMES)[number]) ? token : undefined;
}

export function parseReActOutput(text: string): {
  thought?: string;
  action?: string;
  actionInput: Record<string, unknown>;
} {
  const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\nAction:|\nAction Input:|$)/i);
  const action = normalizeReActAction(text);
  const inputMarker = text.match(/Action Input:\s*/i);
  let actionInput: Record<string, unknown> = {};
  if (inputMarker && inputMarker.index !== undefined) {
    const tail = text.slice(inputMarker.index + inputMarker[0].length);
    const jsonBlock = parseActionInputJson(tail);
    actionInput = parseActionInput(jsonBlock || tail.split('\n')[0]);
  }

  return {
    thought: thoughtMatch?.[1]?.trim(),
    action,
    actionInput
  };
}

function formatPrefetchKnowledge(items: KnowledgeItem[]): string {
  if (!items.length) return '未检索到相关公共知识条目。';
  return items
    .map((k, i) => `${i + 1}. ${truncate(k.question, 50)} → ${truncate(k.answer, 180)}`)
    .join('\n');
}

function formatPrefetchMemory(ctx: ReActCounselContext, hits: SearchResult[]): string {
  return (
    formatPersonalMemories(hits, ctx.recentDialogs, {
      question: ctx.question,
      continuePrevious: ctx.continuePrevious
    }) || '没有和这轮问题相关的更早原话。'
  );
}

function groundedQuery(ctx: ReActCounselContext, toolQuery: string): string {
  if (ctx.continuePrevious) return toolQuery.trim() || ctx.question;
  return ctx.question;
}

async function executeTool(
  action: string,
  input: Record<string, unknown>,
  ctx: ReActCounselContext,
  plan: ReActPlan
): Promise<string> {
  const query = groundedQuery(ctx, String(input.query || input.q || ctx.question));

  switch (action) {
    case 'search_knowledge': {
      if (plan.prefetchOnly && ctx.prefetchedKnowledge?.length) {
        return `[预检索缓存]\n${formatPrefetchKnowledge(ctx.prefetchedKnowledge)}`;
      }
      if (plan.skipSearchTools && ctx.prefetchedKnowledge?.length) {
        return formatPrefetchKnowledge(ctx.prefetchedKnowledge);
      }
      const { searchVectorDb } = await import('../knowledge/vectorDBService');
      const hits = await searchVectorDb(query, 3);
      return formatPrefetchKnowledge(
        hits.map((hit) => ({ question: hit.question, answer: hit.answer }))
      );
    }
    case 'search_user_memory': {
      if (plan.prefetchOnly && ctx.prefetchedMemory?.length) {
        return `[预检索缓存]\n${formatPrefetchMemory(ctx, ctx.prefetchedMemory)}`;
      }
      if (plan.skipSearchTools && ctx.prefetchedMemory?.length) {
        return formatPrefetchMemory(ctx, ctx.prefetchedMemory);
      }
      const { searchPersonalMemories } = await import('../user/userMemoryService');
      const hits = await searchPersonalMemories(ctx.userId, query, 4);
      return formatPrefetchMemory(ctx, hits);
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
}

function executeReflectPsych(ctx: ReActCounselContext): string {
  return [
    `情绪：${ctx.emotion.emotion}（置信 ${(ctx.emotion.confidence * 100).toFixed(0)}%）`,
    `风险：${ctx.risk.level}`,
    `问题域：${getCategoryName(ctx.problem.category as ProblemCategory)}`,
    ctx.intentDirective || '',
    `干预框架：${ctx.intervention.frameworkName}`,
    ctx.llmRationale ? `分析要点：${ctx.llmRationale}` : ''
  ]
    .filter(Boolean)
    .join('；');
}

function buildReActSystemPrompt(ctx: ReActCounselContext, plan: ReActPlan): string {
  const strictNote = isStrictFullReAct()
    ? `\n【完整 ReAct】必须严格完成 ${plan.maxSteps} 步：前 ${plan.maxSteps - 1} 步只能使用 search_knowledge、search_user_memory、reflect_psych；第 ${plan.maxSteps} 步才允许 finish。建议顺序：检索知识库 → 检索用户记忆 → 心理回顾 → 生成回复。`
    : '';
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
最终 answer 须遵守：${CAMPUS_REPLY_REQUIREMENT}
${ctx.intentDirective || ''}${strictNote}${prefetchNote}
语气：${ctx.tone}
${MEMORY_BOUNDARY}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();
}

export function formatTurnMemory(ctx: ReActCounselContext): string[] {
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
      : ''
  ].filter(Boolean);
}

function buildReActUserPrompt(ctx: ReActCounselContext, trajectory: string): string {
  const parts = [
    `【用户提问】${ctx.question}`,
    ctx.description ? `【补充】${ctx.description}` : '',
    ...formatTurnMemory(ctx),
    `【开场参考】${ctx.intervention.openingPhrase}`,
    `【结尾参考】${ctx.intervention.closingPhrase}`
  ].filter(Boolean);

  if (ctx.answerVariationHint) {
    parts.push('', ctx.answerVariationHint);
  }

  if (ctx.prefetchedKnowledge?.length) {
    parts.push('', '【已预检索知识】', formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2)));
  }
  if (ctx.prefetchedMemory?.length) {
    parts.push('', '【长期向量记忆】', formatPrefetchMemory(ctx, ctx.prefetchedMemory));
  }

  if (trajectory) {
    parts.push('', '【已执行步骤】', trajectory, '', '请继续下一步（或 finish）。');
  } else {
    parts.push('', '请先 Thought，再选择工具检索必要信息，最后 finish 输出回复。');
  }

  return parts.join('\n');
}

async function generateFinishAnswer(
  ctx: ReActCounselContext,
  trajectory: string,
  options?: { temperature?: number; timeoutMs?: number; onToken?: (chunk: string) => void }
): Promise<string> {
  const systemPrompt = buildReActSystemPrompt(ctx, { maxSteps: 1, skipSearchTools: true, prefetchOnly: true });
  const userPrompt = [
    buildReActUserPrompt(ctx, trajectory),
    '',
    '请直接输出给用户的完整中文回复（不要 Thought/Action 格式）。'
  ].join('\n');

  if (options?.onToken) {
    const full =
      (await callLlmGenerateStream(userPrompt, {
        systemPrompt,
        temperature: options?.temperature ?? 0.45,
        maxTokens: 1024,
        timeoutMs: options?.timeoutMs ?? 90_000,
        onToken: options.onToken
      })) || '';
    return sanitizeCounselAnswer(full);
  }
  const raw =
    (await callLlmGenerate(userPrompt, {
      systemPrompt,
      temperature: options?.temperature ?? 0.45,
      maxTokens: 1024,
      timeoutMs: options?.timeoutMs ?? 90_000
    })) || '';
  return sanitizeCounselAnswer(raw);
}

function buildPrefetchTrajectory(ctx: ReActCounselContext): string {
  const parts: string[] = [];
  if (ctx.prefetchedKnowledge?.length) {
    parts.push(`Observation [prefetch]: ${formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2))}`);
  }
  if (ctx.prefetchedMemory?.length) {
    parts.push(`Observation [prefetch]: ${formatPrefetchMemory(ctx, ctx.prefetchedMemory)}`);
  }
  parts.push(`Observation: ${executeReflectPsych(ctx)}`);
  return parts.join('\n');
}

function pushStep(
  steps: ReActStep[],
  step: ReActStep,
  onStep?: (s: ReActStep) => void
): void {
  steps.push(step);
  onStep?.(step);
}

function buildResult(
  answer: string,
  steps: ReActStep[],
  reactMode: ReactMode
): ReActCounselResult {
  const cleaned = sanitizeCounselAnswer(answer);
  const success = isValidCounselAnswer(cleaned);
  return {
    answer: success ? cleaned : '',
    steps,
    success,
    reactUsed: reactMode === 'full',
    reactMode: success ? reactMode : 'off'
  };
}

export async function runReActCounselAgent(
  ctx: ReActCounselContext,
  options?: {
    maxSteps?: number;
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
    onStep?: (step: ReActStep) => void;
    onStreamReset?: () => void;
  }
): Promise<ReActCounselResult> {
  const plan = resolveReActPlan(ctx);
  const maxSteps = options?.maxSteps ?? plan.maxSteps;
  const steps: ReActStep[] = [];
  let trajectory = '';
  let finalAnswer = '';

  const skillsReady =
    (ctx.prefetchedKnowledge?.length ?? 0) > 0 || (ctx.prefetchedMemory?.length ?? 0) > 0;

  if (plan.prefetchOnly || skillsReady) {
    if (ctx.prefetchedKnowledge?.length) {
      pushStep(
        steps,
        {
          step: 1,
          thought: '按这轮问题检索知识',
          action: 'search_knowledge',
          actionInput: { query: ctx.question },
          observation: formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2))
        },
        options?.onStep
      );
    }
    if (ctx.prefetchedMemory?.length) {
      pushStep(
        steps,
        {
          step: 2,
          thought: '只保留和这轮有关的个人记忆',
          action: 'search_user_memory',
          actionInput: { query: ctx.question },
          observation: formatPrefetchMemory(ctx, ctx.prefetchedMemory)
        },
        options?.onStep
      );
    }
    pushStep(
      steps,
      {
        step: 3,
        thought: '核对这轮的情绪和问题',
        action: 'reflect_psych',
        actionInput: {},
        observation: executeReflectPsych(ctx)
      },
      options?.onStep
    );
    trajectory = buildPrefetchTrajectory(ctx);
    finalAnswer = await generateFinishAnswer(ctx, trajectory, options);
    if (finalAnswer.length >= MIN_ANSWER_CHARS) {
      pushStep(
        steps,
        {
          step: 4,
          thought: '三个技能已经完成，直接写这轮回答',
          action: 'finish',
          actionInput: {},
          observation: `已生成（${finalAnswer.length} 字）`
        },
        options?.onStep
      );
      return buildResult(finalAnswer, steps, plan.prefetchOnly ? 'prefetch' : 'full');
    }
    options?.onStreamReset?.();
    finalAnswer = '';
    steps.length = 0;
  }

  const systemPrompt = buildReActSystemPrompt(ctx, plan);

  for (let step = 1; step <= maxSteps; step += 1) {
    const userPrompt = buildReActUserPrompt(ctx, trajectory);
    const raw =
      (await callLlmGenerate(`${userPrompt}\n\n请输出 Thought / Action / Action Input。`, {
        systemPrompt,
        temperature: options?.temperature ?? 0.42,
        maxTokens: step >= maxSteps ? 1024 : 400,
        timeoutMs: options?.timeoutMs ?? 90_000
      })) || '';

    const parsed = parseReActOutput(raw);
    if (!parsed.action) {
      finalAnswer = await generateFinishAnswer(ctx, trajectory, options);
      if (finalAnswer.length >= MIN_ANSWER_CHARS) {
        pushStep(
          steps,
          {
            step,
            thought: parsed.thought || '解析失败，直接生成最终回复',
            action: 'finish',
            actionInput: {},
            observation: `已生成（${finalAnswer.length} 字）`
          },
          options?.onStep
        );
        break;
      }
      pushStep(
        steps,
        {
          step,
          thought: parsed.thought || raw.slice(0, 120),
          action: 'parse_error',
          actionInput: {},
          observation: '未能解析 Action，终止 ReAct 循环。'
        },
        options?.onStep
      );
      break;
    }

    if (parsed.action === 'finish') {
      if (isStrictFullReAct() && step < maxSteps) {
        const observation = `第 ${step} 步不可 finish，请先使用 search_knowledge / search_user_memory / reflect_psych 完成推理（共需 ${maxSteps} 步）。`;
        pushStep(
          steps,
          {
            step,
            thought: parsed.thought,
            action: 'finish',
            actionInput: parsed.actionInput,
            observation
          },
          options?.onStep
        );
        trajectory += [
          trajectory ? '\n' : '',
          `Step ${step}`,
          parsed.thought ? `Thought: ${parsed.thought}` : '',
          'Action: finish',
          `Action Input: ${JSON.stringify(parsed.actionInput)}`,
          `Observation: ${observation}`
        ]
          .filter(Boolean)
          .join('\n');
        continue;
      }

      finalAnswer = sanitizeCounselAnswer(
        String(parsed.actionInput.answer || parsed.actionInput.response || parsed.actionInput.text || '')
      );
      if (!isValidCounselAnswer(finalAnswer)) {
        finalAnswer = await generateFinishAnswer(ctx, trajectory, options);
      }
      pushStep(
        steps,
        {
          step,
          thought: parsed.thought,
          action: 'finish',
          actionInput: parsed.actionInput,
          observation: finalAnswer
            ? `已生成最终回复（${finalAnswer.length} 字）`
            : 'finish 缺少 answer 字段。'
        },
        options?.onStep
      );
      break;
    }

    const observation = await executeTool(parsed.action, parsed.actionInput, ctx, plan);
    pushStep(
      steps,
      {
        step,
        thought: parsed.thought,
        action: parsed.action,
        actionInput: parsed.actionInput,
        observation
      },
      options?.onStep
    );

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
      finalAnswer = await generateFinishAnswer(ctx, trajectory, options);
      if (finalAnswer.length >= MIN_ANSWER_CHARS) {
        pushStep(
          steps,
          {
            step: step + 1,
            thought: '达到步数上限，生成最终回复',
            action: 'finish',
            actionInput: {},
            observation: `已生成（${finalAnswer.length} 字）`
          },
          options?.onStep
        );
      }
    }
  }

  const reactMode: ReactMode = isStrictFullReAct()
    ? 'full'
    : steps.some((s) => s.action === 'search_knowledge' || s.action === 'search_user_memory')
      ? 'full'
      : steps.length > 1
        ? 'full'
        : 'prefetch';

  return buildResult(finalAnswer, steps, reactMode);
}
