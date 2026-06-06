import type { KnowledgeItem } from '../knowledge/ragService';
import type { SearchResult } from '../knowledge/vectorDBService';
import { callLlmGenerate, callLlmGenerateStream } from './llmClient';
import { getCategoryName, type EmotionAnalysis, type RiskAssessment, type ProblemAnalysis, type ProblemCategory } from '../psych/emotionService';
import { isReactDemoMode } from './agentPolicy';
import type { ReactMode } from './agentPolicy';

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
  agentContext: string;
  tone: string;
  llmRationale?: string;
  prefetchedKnowledge?: KnowledgeItem[];
  prefetchedMemory?: SearchResult[];
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
  if (isReactDemoMode()) {
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

export function parseReActOutput(text: string): {
  thought?: string;
  action?: string;
  actionInput: Record<string, unknown>;
} {
  const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\nAction:|\nAction Input:|$)/i);
  const actionMatch = text.match(/Action:\s*([a-z_]+)/i);
  const inputMatch =
    text.match(/Action Input:\s*(\{[\s\S]*?\})(?:\s*\n|$)/i) ||
    text.match(/Action Input:\s*([\s\S]*?)(?=\nObservation:|\nThought:|\nAction:|$)/i);

  const action = actionMatch?.[1]?.trim().toLowerCase();
  const actionInput = parseActionInput(inputMatch?.[1]);

  return {
    thought: thoughtMatch?.[1]?.trim(),
    action: action && TOOL_NAMES.includes(action as (typeof TOOL_NAMES)[number]) ? action : undefined,
    actionInput
  };
}

function formatPrefetchKnowledge(items: KnowledgeItem[]): string {
  if (!items.length) return '未检索到相关公共知识条目。';
  return items
    .map((k, i) => `${i + 1}. ${truncate(k.question, 50)} → ${truncate(k.answer, 160)}`)
    .join('\n');
}

function formatPrefetchMemory(hits: SearchResult[]): string {
  if (!hits.length) return '该用户暂无相关私有记忆。';
  return hits
    .map(
      (h, i) =>
        `${i + 1}. [相似度 ${(h.similarity * 100).toFixed(0)}%] ${truncate(h.answer || h.question, 120)}`
    )
    .join('\n');
}

async function executeTool(
  action: string,
  input: Record<string, unknown>,
  ctx: ReActCounselContext,
  plan: ReActPlan
): Promise<string> {
  const query = String(input.query || input.q || ctx.question).trim() || ctx.question;

  switch (action) {
    case 'search_knowledge': {
      if (plan.prefetchOnly && ctx.prefetchedKnowledge?.length) {
        return `[预检索缓存]\n${formatPrefetchKnowledge(ctx.prefetchedKnowledge)}`;
      }
      if (plan.skipSearchTools && ctx.prefetchedKnowledge?.length) {
        return formatPrefetchKnowledge(ctx.prefetchedKnowledge);
      }
      const { retrieveKnowledge } = await import('../knowledge/ragService');
      const items = await retrieveKnowledge(query, 2, ctx.problem.category, ctx.emotion.emotion);
      return formatPrefetchKnowledge(items);
    }
    case 'search_user_memory': {
      if (plan.prefetchOnly && ctx.prefetchedMemory?.length) {
        return `[预检索缓存]\n${formatPrefetchMemory(ctx.prefetchedMemory)}`;
      }
      if (plan.skipSearchTools && ctx.prefetchedMemory?.length) {
        return formatPrefetchMemory(ctx.prefetchedMemory);
      }
      const { searchBlendedUserMemory } = await import('../user/userMemoryService');
      const hits = await searchBlendedUserMemory(ctx.userId, query, 3);
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
}

function executeReflectPsych(ctx: ReActCounselContext): string {
  return [
    `情绪：${ctx.emotion.emotion}（置信 ${(ctx.emotion.confidence * 100).toFixed(0)}%）`,
    `风险：${ctx.risk.level}`,
    `问题域：${getCategoryName(ctx.problem.category as ProblemCategory)}`,
    `干预框架：${ctx.intervention.frameworkName}`,
    ctx.llmRationale ? `分析要点：${ctx.llmRationale}` : ''
  ]
    .filter(Boolean)
    .join('；');
}

function buildReActSystemPrompt(ctx: ReActCounselContext, plan: ReActPlan): string {
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

function buildReActUserPrompt(ctx: ReActCounselContext, trajectory: string): string {
  const parts = [
    `【用户提问】${ctx.question}`,
    ctx.description ? `【补充】${ctx.description}` : '',
    ctx.historySummary ? `【历史摘要】${truncate(ctx.historySummary, 200)}` : '',
    `【开场参考】${ctx.intervention.openingPhrase}`,
    `【结尾参考】${ctx.intervention.closingPhrase}`
  ].filter(Boolean);

  if (ctx.prefetchedKnowledge?.length) {
    parts.push('', '【已预检索知识】', formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2)));
  }
  if (ctx.prefetchedMemory?.length) {
    parts.push('', '【已预检索记忆】', formatPrefetchMemory(ctx.prefetchedMemory.slice(0, 2)));
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
    return (
      (await callLlmGenerateStream(userPrompt, {
        systemPrompt,
        temperature: options?.temperature ?? 0.45,
        maxTokens: 1024,
        timeoutMs: options?.timeoutMs ?? 90_000,
        onToken: options.onToken
      })) || ''
    );
  }
  return (
    (await callLlmGenerate(userPrompt, {
      systemPrompt,
      temperature: options?.temperature ?? 0.45,
      maxTokens: 1024,
      timeoutMs: options?.timeoutMs ?? 90_000
    })) || ''
  );
}

function buildPrefetchTrajectory(ctx: ReActCounselContext): string {
  const parts: string[] = [];
  if (ctx.prefetchedKnowledge?.length) {
    parts.push(`Observation [prefetch]: ${formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2))}`);
  }
  if (ctx.prefetchedMemory?.length) {
    parts.push(`Observation [prefetch]: ${formatPrefetchMemory(ctx.prefetchedMemory.slice(0, 2))}`);
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
  const success = answer.length >= MIN_ANSWER_CHARS;
  return {
    answer: success ? answer : '',
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
  }
): Promise<ReActCounselResult> {
  const plan = resolveReActPlan(ctx);
  const maxSteps = options?.maxSteps ?? plan.maxSteps;
  const steps: ReActStep[] = [];
  let trajectory = '';
  let finalAnswer = '';

  if (plan.prefetchOnly) {
    trajectory = buildPrefetchTrajectory(ctx);
    finalAnswer = await generateFinishAnswer(ctx, trajectory, options);
    if (finalAnswer.length >= MIN_ANSWER_CHARS) {
      pushStep(
        steps,
        {
          step: 1,
          thought: '编排层已注入预检索结果，单次生成最终回复',
          action: 'finish',
          actionInput: {},
          observation: `已生成（${finalAnswer.length} 字）`
        },
        options?.onStep
      );
      return buildResult(finalAnswer, steps, 'prefetch');
    }
    finalAnswer = '';
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
      finalAnswer = String(
        parsed.actionInput.answer || parsed.actionInput.response || parsed.actionInput.text || ''
      ).trim();
      if (!finalAnswer || finalAnswer.length < MIN_ANSWER_CHARS) {
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

  const reactMode: ReactMode = steps.some((s) => s.action === 'search_knowledge' || s.action === 'search_user_memory')
    ? 'full'
    : steps.length > 1
      ? 'full'
      : 'prefetch';

  return buildResult(finalAnswer, steps, reactMode);
}
