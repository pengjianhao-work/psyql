import { callLlmGenerate, callLlmGenerateStream } from './llmClient';
import type { ReActCounselContext, ReActCounselResult, ReActStep } from './reactCounselAgent';

export interface SelfAskCheck {
  question: string;
  answer: string;
  pass: boolean;
}

const MIN_ANSWER_CHARS = 80;

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** 规则兜底：对草稿做三项自问自答核查 */
export function ruleBasedSelfAskChecks(ctx: ReActCounselContext, draft: string): SelfAskCheck[] {
  const highRisk = ctx.risk.level === 'high' || ctx.risk.level === 'critical';
  const qTokens = ctx.question.replace(/\s+/g, '').slice(0, 24);
  const mentionsConcern =
    draft.includes(qTokens.slice(0, 8)) ||
    draft.length >= 120 ||
    /焦虑|压力|睡眠|人际|考试|情绪|难过|害怕/.test(draft);
  const hasEmpathy = /理解|听到|不容易|抱抱|陪伴|感受/.test(draft);
  const hasAction = /可以|试试|建议|一步|呼吸|求助|心理中心|记录/.test(draft);
  const hasDiagnosis = /确诊|诊断为|你有抑郁症|精神分裂|用药/.test(draft);
  const hasCrisisHelp =
    /心理中心|热线|求助|信任的人|危机|110|120|希望热线|生命热线/.test(draft) || !highRisk;

  return [
    {
      question: '草稿是否回应用户核心困扰（而非空泛鸡汤）？',
      answer: mentionsConcern && hasEmpathy ? '是，含共情并触及问题语境。' : '偏弱，需加强针对性问题回应。',
      pass: Boolean(mentionsConcern && hasEmpathy)
    },
    {
      question: '安全性是否足够（高危是否指向求助通道，且无不当诊断）？',
      answer: !hasDiagnosis && hasCrisisHelp ? '通过：无诊断表述，求助指引恰当。' : '未通过：存在诊断风险或缺少求助指引。',
      pass: !hasDiagnosis && hasCrisisHelp
    },
    {
      question: '建议是否可执行且语气温暖？',
      answer: hasAction ? '通过：含可执行行动提示。' : '偏弱：建议不够具体。',
      pass: hasAction
    }
  ];
}

export function parseSelfAskChecks(raw: string): SelfAskCheck[] | null {
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const arr = JSON.parse(m[0]) as Array<Partial<SelfAskCheck>>;
    if (!Array.isArray(arr) || arr.length < 2) return null;
    return arr.slice(0, 4).map((c) => ({
      question: String(c.question || '').trim() || '核查项',
      answer: String(c.answer || '').trim() || '未作答',
      pass: Boolean(c.pass)
    }));
  } catch {
    return null;
  }
}

async function llmSelfAskChecks(
  ctx: ReActCounselContext,
  draft: string,
  options?: { temperature?: number; timeoutMs?: number }
): Promise<SelfAskCheck[] | null> {
  const prompt = `你是心理咨询质量审核员，使用 Self-Ask（自问自答）验证下方回复草稿。

用户问题：${ctx.question}
风险等级：${ctx.risk.level}
草稿：
${truncate(draft, 800)}

请提出 3 个关键核查问题并自行作答，仅输出 JSON 数组：
[{"question":"…","answer":"…","pass":true/false}, ...]

核查维度必须覆盖：①是否回应核心困扰 ②安全性/非诊断 ③建议可执行性。`;

  const raw =
    (await callLlmGenerate(prompt, {
      temperature: options?.temperature ?? 0.2,
      maxTokens: 420,
      timeoutMs: options?.timeoutMs ?? 35_000
    })) || '';
  return parseSelfAskChecks(raw);
}

async function reviseAnswer(
  ctx: ReActCounselContext,
  draft: string,
  checks: SelfAskCheck[],
  options?: {
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
  }
): Promise<string> {
  const failed = checks.filter((c) => !c.pass);
  const systemPrompt = `你是大学生心理健康陪伴 AI。请根据 Self-Ask 核查未通过项修订回复。
要求：温暖共情、约 280–480 字、两大块（共情+建议）、不做医疗诊断。
语气：${ctx.tone}`;

  const userPrompt = [
    `【用户提问】${ctx.question}`,
    `【原草稿】${truncate(draft, 600)}`,
    '【未通过核查】',
    ...failed.map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`),
    '',
    '请输出修订后的完整中文回复（不要 JSON / Thought 格式）。'
  ].join('\n');

  if (options?.onToken) {
    return (
      (await callLlmGenerateStream(userPrompt, {
        systemPrompt,
        temperature: options?.temperature ?? 0.4,
        maxTokens: 1024,
        timeoutMs: options?.timeoutMs ?? 90_000,
        onToken: options.onToken
      })) || ''
    );
  }
  return (
    (await callLlmGenerate(userPrompt, {
      systemPrompt,
      temperature: options?.temperature ?? 0.4,
      maxTokens: 1024,
      timeoutMs: options?.timeoutMs ?? 90_000
    })) || ''
  );
}

export function shouldRunSelfAskVerify(agentMode?: string): boolean {
  const flag = (process.env.PSYQA_SELF_ASK_VERIFY || '').trim();
  if (flag === '0') return false;
  if (flag === '1') return true;
  // 默认：ToT / 核心任务闭环 模式自动开启 Self-Ask 验证
  const mode = (agentMode || process.env.PSYQA_AGENT_MODE || 'auto').trim().toLowerCase();
  return (
    mode === 'tot' ||
    mode === 'tree-of-thoughts' ||
    mode === 'tree_of_thoughts' ||
    mode === 'loop' ||
    mode === 'core' ||
    mode === 'taor' ||
    mode === 'core-loop'
  );
}

/**
 * Self-Ask 验证：对已生成草稿自问自答核查，未通过则修订。
 * 步骤追加到原 result.steps，供前端推理面板展示。
 */
export async function appendSelfAskVerify(
  ctx: ReActCounselContext,
  result: ReActCounselResult,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
    onStep?: (step: ReActStep) => void;
    useLlmChecks?: boolean;
  }
): Promise<ReActCounselResult> {
  if (!result.success || result.answer.length < MIN_ANSWER_CHARS) {
    return result;
  }

  const steps = [...result.steps];
  const startStep = steps.length + 1;
  const emit = (step: ReActStep) => {
    steps.push(step);
    options?.onStep?.(step);
  };

  const useLlm = options?.useLlmChecks ?? process.env.PSYQA_SELF_ASK_LLM === '1';
  let checks =
    (useLlm ? await llmSelfAskChecks(ctx, result.answer, options) : null) ??
    ruleBasedSelfAskChecks(ctx, result.answer);

  emit({
    step: startStep,
    thought: 'Self-Ask：提出并回答质量核查问题',
    action: 'self_ask_probe',
    actionInput: { checks: checks.map((c) => ({ q: c.question, pass: c.pass })) },
    observation: checks.map((c, i) => `Q${i + 1}: ${c.question}`).join('；')
  });

  for (let i = 0; i < checks.length; i += 1) {
    const c = checks[i];
    emit({
      step: startStep + 1 + i,
      thought: c.question,
      action: 'self_ask_answer',
      actionInput: { pass: c.pass },
      observation: `${c.pass ? '✓' : '✗'} ${c.answer}`
    });
  }

  const allPass = checks.every((c) => c.pass);
  const verdictStep = startStep + 1 + checks.length;
  emit({
    step: verdictStep,
    thought: allPass ? '全部核查通过，保留草稿' : '存在未通过项，进入修订',
    action: 'self_ask_verdict',
    actionInput: {
      passCount: checks.filter((c) => c.pass).length,
      total: checks.length,
      allPass
    },
    observation: allPass
      ? `通过 ${checks.length}/${checks.length}`
      : `通过 ${checks.filter((c) => c.pass).length}/${checks.length}`
  });

  let finalAnswer = result.answer;
  if (!allPass) {
    const revised = await reviseAnswer(ctx, result.answer, checks, {
      temperature: options?.temperature,
      timeoutMs: options?.timeoutMs,
      // 仅在修订时流式输出，避免覆盖原草稿流
      onToken: options?.onToken
    });
    if (revised.length >= MIN_ANSWER_CHARS) {
      finalAnswer = revised;
      emit({
        step: verdictStep + 1,
        thought: '按 Self-Ask 未通过项修订回复',
        action: 'self_ask_revise',
        actionInput: {},
        observation: `已修订（${finalAnswer.length} 字）`
      });
    } else {
      emit({
        step: verdictStep + 1,
        thought: '修订失败，回退原草稿',
        action: 'self_ask_revise',
        actionInput: { fallback: true },
        observation: '修订结果过短，保留原草稿'
      });
    }
  }

  return {
    ...result,
    answer: finalAnswer,
    steps,
    success: finalAnswer.length >= MIN_ANSWER_CHARS,
    reactUsed: true
  };
}
