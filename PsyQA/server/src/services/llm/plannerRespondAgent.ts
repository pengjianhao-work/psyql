import type { KnowledgeItem } from '../knowledge/ragService';
import type { SearchResult } from '../knowledge/vectorDBService';
import { callLlmGenerate, callLlmGenerateStream } from './llmClient';
import type { ReActCounselContext, ReActCounselResult, ReActStep } from './reactCounselAgent';
import type { ReactMode } from './agentPolicy';

export interface PlannerPlan {
  useKnowledge: boolean;
  useMemory: boolean;
  usePsych: boolean;
  reason: string;
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function ruleBasedPlan(ctx: ReActCounselContext): PlannerPlan {
  const hasKnowledge = (ctx.prefetchedKnowledge?.length ?? 0) > 0;
  const hasMemory = (ctx.prefetchedMemory?.length ?? 0) > 0;
  const complex =
    ctx.question.length > 80 ||
    Boolean(ctx.description) ||
    (ctx.historySummary?.length ?? 0) > 120;
  return {
    useKnowledge: hasKnowledge,
    useMemory: hasMemory,
    usePsych: true,
    reason: complex ? '多轮/长文本，启用完整上下文' : '标准咨询，精简上下文'
  };
}

async function llmPlanner(ctx: ReActCounselContext): Promise<PlannerPlan | null> {
  const raw =
    (await callLlmGenerate(
      `用户问题：${ctx.question}
${ctx.description ? `补充：${ctx.description}` : ''}
已有知识条数：${ctx.prefetchedKnowledge?.length ?? 0}
已有记忆条数：${ctx.prefetchedMemory?.length ?? 0}
风险：${ctx.risk.level}

输出 JSON（仅 JSON）：{"useKnowledge":true/false,"useMemory":true/false,"usePsych":true/false,"reason":"一句话"}`,
      { temperature: 0.2, maxTokens: 120, timeoutMs: 15_000 }
    )) || '';
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]) as PlannerPlan;
  } catch {
    return null;
  }
}

function formatPrefetchContext(ctx: ReActCounselContext, plan: PlannerPlan): string {
  const parts: string[] = [];
  if (plan.usePsych) {
    parts.push(
      `【心理分析】情绪 ${ctx.emotion.emotion}；风险 ${ctx.risk.level}；领域 ${ctx.problem.category}`
    );
    if (ctx.llmRationale) parts.push(`要点：${ctx.llmRationale}`);
  }
  if (plan.useKnowledge && ctx.prefetchedKnowledge?.length) {
    parts.push(
      '【参考知识】\n' +
        ctx.prefetchedKnowledge
          .map((k, i) => `${i + 1}. ${truncate(k.question, 40)} → ${truncate(k.answer, 140)}`)
          .join('\n')
    );
  }
  if (plan.useMemory && ctx.prefetchedMemory?.length) {
    parts.push(
      '【用户记忆】\n' +
        ctx.prefetchedMemory
          .map(
            (h, i) =>
              `${i + 1}. [${(h.similarity * 100).toFixed(0)}%] ${truncate(h.answer || h.question, 120)}`
          )
          .join('\n')
    );
  }
  return parts.join('\n\n');
}

function buildResponderSystem(ctx: ReActCounselContext): string {
  return `你是大学生心理健康陪伴 AI。温暖共情、约 280–480 字、两大块（共情+建议）、不做医疗诊断。
语气：${ctx.tone}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();
}

export async function runPlannerRespondAgent(
  ctx: ReActCounselContext,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
    onStep?: (step: ReActStep) => void;
    useLlmPlanner?: boolean;
  }
): Promise<ReActCounselResult> {
  const steps: ReActStep[] = [];
  const emit = (step: ReActStep) => {
    steps.push(step);
    options?.onStep?.(step);
  };
  const useLlmPlanner = options?.useLlmPlanner ?? process.env.PSYQA_AGENT_PLANNER === '1';
  const plan = useLlmPlanner ? (await llmPlanner(ctx)) ?? ruleBasedPlan(ctx) : ruleBasedPlan(ctx);

  emit({
    step: 1,
    thought: plan.reason,
    action: 'plan',
    actionInput: { ...plan },
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

  if (options?.onToken) {
    finalAnswer =
      (await callLlmGenerateStream(userPrompt, {
        systemPrompt,
        temperature: options?.temperature ?? 0.45,
        maxTokens: 1024,
        timeoutMs: options?.timeoutMs ?? 90_000,
        onToken: options.onToken
      })) || '';
  } else {
    finalAnswer =
      (await callLlmGenerate(userPrompt, {
        systemPrompt,
        temperature: options?.temperature ?? 0.45,
        maxTokens: 1024,
        timeoutMs: options?.timeoutMs ?? 90_000
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
  const reactMode: ReactMode = success ? 'planner' : 'off';
  return {
    answer: success ? finalAnswer : '',
    steps,
    success,
    reactUsed: success,
    reactMode
  };
}
