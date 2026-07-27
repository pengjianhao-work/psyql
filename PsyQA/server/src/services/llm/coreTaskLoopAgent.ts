import { callLlmGenerate, callLlmGenerateStream } from './llmClient';
import type { ReActCounselContext, ReActCounselResult, ReActStep } from './reactCounselAgent';
import type { ReactMode } from './agentPolicy';
import { getCategoryName, type ProblemCategory } from '../psych/emotionService';

/**
 * 核心任务闭环：思考 → 行动 → 观察 → 反思
 * （与答辩示意图「核心任务闭环」一一对应）
 */

export interface LoopPlan {
  goal: string;
  useKnowledge: boolean;
  useMemory: boolean;
  usePsych: boolean;
  nextAction: string;
}

export interface LoopReflection {
  enough: boolean;
  quality: number;
  feedback: string;
  reviseHint: string;
}

const MIN_ANSWER_CHARS = 80;

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** 思考：分析状态，生成行动计划（规则兜底） */
export function buildThoughtPlan(ctx: ReActCounselContext): LoopPlan {
  const highRisk = ctx.risk.level === 'high' || ctx.risk.level === 'critical';
  const hasKnowledge = (ctx.prefetchedKnowledge?.length ?? 0) > 0;
  const hasMemory = (ctx.prefetchedMemory?.length ?? 0) > 0;
  const category = getCategoryName(ctx.problem.category as ProblemCategory);

  return {
    goal: highRisk
      ? '安全优先：稳住情绪并明确求助通道，再给轻量支持'
      : `共情回应「${ctx.emotion.emotion}」，围绕「${category}」给出可执行建议`,
    useKnowledge: hasKnowledge || !highRisk,
    useMemory: hasMemory,
    usePsych: true,
    nextAction: highRisk
      ? '注入心理分析 + 求助指引上下文'
      : hasKnowledge
        ? '注入预检索知识与记忆后生成回复'
        : '基于心理分析与干预框架生成回复'
  };
}

export function parseThoughtPlan(raw: string): LoopPlan | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]) as Partial<LoopPlan>;
    return {
      goal: String(o.goal || '').trim() || '共情并给出可执行建议',
      useKnowledge: Boolean(o.useKnowledge),
      useMemory: Boolean(o.useMemory),
      usePsych: o.usePsych !== false,
      nextAction: String(o.nextAction || '').trim() || '收集上下文并生成回复'
    };
  } catch {
    return null;
  }
}

export function parseReflection(raw: string): LoopReflection | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]) as Partial<LoopReflection>;
    const quality = typeof o.quality === 'number' ? o.quality : Number(o.quality) || 5;
    return {
      enough: Boolean(o.enough),
      quality: Math.max(0, Math.min(10, quality)),
      feedback: String(o.feedback || '').trim() || '已评估',
      reviseHint: String(o.reviseHint || '').trim()
    };
  } catch {
    return null;
  }
}

/** 反思：规则评估观察结果与草稿 */
export function reflectByRules(
  ctx: ReActCounselContext,
  observation: string,
  draft: string
): LoopReflection {
  const highRisk = ctx.risk.level === 'high' || ctx.risk.level === 'critical';
  const hasEmpathy = /理解|听到|不容易|感受|陪伴/.test(draft);
  const hasAction = /可以|试试|建议|一步|呼吸|求助|心理中心/.test(draft);
  const hasDiagnosis = /确诊|诊断为|你有抑郁症|精神分裂|用药/.test(draft);
  const hasHelp = /心理中心|热线|求助|信任的人/.test(draft);
  const obsOk = observation.length > 20;

  let quality = 5;
  if (hasEmpathy) quality += 1.5;
  if (hasAction) quality += 1.5;
  if (obsOk) quality += 1;
  if (hasDiagnosis) quality -= 3;
  if (highRisk && !hasHelp) quality -= 2;
  if (draft.length < MIN_ANSWER_CHARS) quality -= 2;

  quality = Math.max(0, Math.min(10, Math.round(quality * 10) / 10));
  const enough = quality >= 6.5 && !hasDiagnosis && draft.length >= MIN_ANSWER_CHARS;

  return {
    enough,
    quality,
    feedback: enough
      ? '观察结果充分，回复质量达标，可结束本轮闭环'
      : '尚有不足，需根据反馈修订后再结束',
    reviseHint: [
      !hasEmpathy ? '加强共情开场' : '',
      !hasAction ? '补充可执行小步骤' : '',
      hasDiagnosis ? '删除诊断/用药表述' : '',
      highRisk && !hasHelp ? '补充校内心理中心或身边支持' : '',
      draft.length < MIN_ANSWER_CHARS ? '内容过短，适当展开' : ''
    ]
      .filter(Boolean)
      .join('；')
  };
}

function formatObservation(ctx: ReActCounselContext, plan: LoopPlan): string {
  const parts: string[] = [];
  if (plan.usePsych) {
    parts.push(
      `心理状态：情绪=${ctx.emotion.emotion}；风险=${ctx.risk.level}；领域=${getCategoryName(
        ctx.problem.category as ProblemCategory
      )}；框架=${ctx.intervention.frameworkName}`
    );
    if (ctx.llmRationale) parts.push(`分析要点：${truncate(ctx.llmRationale, 120)}`);
  }
  if (plan.useKnowledge && ctx.prefetchedKnowledge?.length) {
    parts.push(
      '知识库观察：\n' +
        ctx.prefetchedKnowledge
          .slice(0, 2)
          .map((k, i) => `${i + 1}. ${truncate(k.question, 40)} → ${truncate(k.answer, 100)}`)
          .join('\n')
    );
  }
  if (plan.useMemory && ctx.prefetchedMemory?.length) {
    parts.push(
      '记忆观察：\n' +
        ctx.prefetchedMemory
          .slice(0, 2)
          .map(
            (h, i) =>
              `${i + 1}. [${(h.similarity * 100).toFixed(0)}%] ${truncate(h.answer || h.question, 90)}`
          )
          .join('\n')
    );
  }
  if (!parts.length) {
    parts.push('环境观察：无额外检索命中，依赖本轮问题与干预框架。');
  }
  return parts.join('\n');
}

async function llmThought(
  ctx: ReActCounselContext,
  options?: { temperature?: number; timeoutMs?: number }
): Promise<LoopPlan | null> {
  if (process.env.PSYQA_LOOP_LLM_THOUGHT !== '1') return null;
  const raw =
    (await callLlmGenerate(
      `你是咨询 Agent 的「思考」模块。分析状态并生成行动计划，仅输出 JSON：
{"goal":"一句话目标","useKnowledge":true/false,"useMemory":true/false,"usePsych":true/false,"nextAction":"下一步行动"}

用户问题：${ctx.question}
风险：${ctx.risk.level}；情绪：${ctx.emotion.emotion}
知识条数：${ctx.prefetchedKnowledge?.length ?? 0}；记忆条数：${ctx.prefetchedMemory?.length ?? 0}`,
      { temperature: options?.temperature ?? 0.25, maxTokens: 180, timeoutMs: options?.timeoutMs ?? 20_000 }
    )) || '';
  return parseThoughtPlan(raw);
}

async function generateDraft(
  ctx: ReActCounselContext,
  plan: LoopPlan,
  observation: string,
  reflectionFeedback?: string,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
  }
): Promise<string> {
  const systemPrompt = `你是大学生心理健康陪伴 AI，运行于「核心任务闭环」（思考→行动→观察→反思）。
本轮目标：${plan.goal}
要求：温暖共情、约 280–480 字、两大块（共情+建议）、不做医疗诊断。
语气：${ctx.tone}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();

  const userPrompt = [
    `【用户提问】${ctx.question}`,
    ctx.description ? `【补充】${ctx.description}` : '',
    ctx.historySummary ? `【历史摘要】${truncate(ctx.historySummary, 200)}` : '',
    `【观察结果】\n${observation}`,
    reflectionFeedback ? `【上一轮反思反馈】${reflectionFeedback}` : '',
    `【开场参考】${ctx.intervention.openingPhrase}`,
    `【结尾参考】${ctx.intervention.closingPhrase}`,
    '',
    '请直接输出给用户的完整中文回复。'
  ]
    .filter(Boolean)
    .join('\n');

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

export async function runCoreTaskLoopAgent(
  ctx: ReActCounselContext,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
    onStep?: (step: ReActStep) => void;
    maxRounds?: number;
  }
): Promise<ReActCounselResult> {
  const steps: ReActStep[] = [];
  const emit = (step: ReActStep) => {
    steps.push(step);
    options?.onStep?.(step);
  };

  const maxRounds = Math.max(
    1,
    Math.min(2, options?.maxRounds ?? (Number(process.env.PSYQA_LOOP_ROUNDS) || 2))
  );
  let reflectionFeedback = '';
  let finalAnswer = '';
  let stepNo = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    // ① 思考 Thought — 分析状态，生成行动计划
    const plan = (await llmThought(ctx, options)) ?? buildThoughtPlan(ctx);
    emit({
      step: ++stepNo,
      thought: plan.goal,
      action: 'loop_thought',
      actionInput: { ...plan, round },
      observation: `第 ${round} 轮思考：${plan.nextAction}`
    });

    // ② 行动 Action — 执行计划，与环境交互
    emit({
      step: ++stepNo,
      thought: `执行：${plan.nextAction}`,
      action: 'loop_action',
      actionInput: {
        useKnowledge: plan.useKnowledge,
        useMemory: plan.useMemory,
        usePsych: plan.usePsych
      },
      observation: '正在与知识库/记忆/心理分析环境交互…'
    });

    // ③ 观察 Observation — 获取结果，观察环境变化
    const observation = formatObservation(ctx, plan);
    emit({
      step: ++stepNo,
      thought: '汇总环境反馈',
      action: 'loop_observe',
      actionInput: { chars: observation.length },
      observation: truncate(observation, 360)
    });

    // 生成草稿（行动后的产出）
    const draft = await generateDraft(ctx, plan, observation, reflectionFeedback, {
      temperature: options?.temperature,
      timeoutMs: options?.timeoutMs,
      // 仅最后一轮且将通过时流式；先不流式，等反思后再决定
      onToken: undefined
    });

    // ④ 反思 Reflection — 评估结果，为下轮思考提供反馈
    const reflection = reflectByRules(ctx, observation, draft);
    emit({
      step: ++stepNo,
      thought: reflection.feedback,
      action: 'loop_reflect',
      actionInput: {
        enough: reflection.enough,
        quality: reflection.quality,
        reviseHint: reflection.reviseHint,
        round
      },
      observation: `质量 ${reflection.quality}/10；${
        reflection.enough ? '闭环可结束' : `反馈→${reflection.reviseHint || '继续修订'}`
      }`
    });

    if (reflection.enough || round === maxRounds) {
      if (reflection.enough && draft.length >= MIN_ANSWER_CHARS && !options?.onToken) {
        finalAnswer = draft;
        emit({
          step: ++stepNo,
          thought: '反思通过，输出最终回复',
          action: 'loop_respond',
          actionInput: { revised: false },
          observation: `已生成（${finalAnswer.length} 字）`
        });
      } else {
        const hint = reflection.enough ? undefined : reflection.reviseHint || reflection.feedback;
        finalAnswer = await generateDraft(ctx, plan, observation, hint, {
          temperature: options?.temperature,
          timeoutMs: options?.timeoutMs,
          onToken: options?.onToken
        });
        if (finalAnswer.length < MIN_ANSWER_CHARS) finalAnswer = draft;
        emit({
          step: ++stepNo,
          thought: reflection.enough ? '反思通过，输出最终回复' : '按反思反馈完成最终修订',
          action: 'loop_respond',
          actionInput: { revised: !reflection.enough },
          observation: finalAnswer ? `已生成（${finalAnswer.length} 字）` : '生成失败'
        });
      }
      break;
    }

    reflectionFeedback = reflection.reviseHint || reflection.feedback;
  }

  const success = finalAnswer.length >= MIN_ANSWER_CHARS;
  const reactMode: ReactMode = success ? 'loop' : 'off';
  return {
    answer: success ? finalAnswer : '',
    steps,
    success,
    reactUsed: success,
    reactMode
  };
}
