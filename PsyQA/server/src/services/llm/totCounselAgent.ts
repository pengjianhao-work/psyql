import { callLlmGenerate, callLlmGenerateStream } from './llmClient';
import type { ReActCounselContext, ReActCounselResult, ReActStep } from './reactCounselAgent';
import type { ReactMode } from './agentPolicy';
import { getCategoryName, type ProblemCategory } from '../psych/emotionService';

export interface ThoughtBranch {
  id: string;
  strategy: string;
  empathyFocus: string;
  suggestionFocus: string;
  riskNote: string;
}

export interface ScoredBranch extends ThoughtBranch {
  score: number;
  rationale: string;
}

const MIN_ANSWER_CHARS = 80;
const DEFAULT_BRANCH_COUNT = 3;

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function formatContextBlock(ctx: ReActCounselContext): string {
  const parts: string[] = [
    `【心理分析】情绪 ${ctx.emotion.emotion}；风险 ${ctx.risk.level}；领域 ${getCategoryName(ctx.problem.category as ProblemCategory)}`,
    ctx.llmRationale ? `要点：${ctx.llmRationale}` : '',
    `干预框架：${ctx.intervention.frameworkName}`
  ];
  if (ctx.prefetchedKnowledge?.length) {
    parts.push(
      '【参考知识】\n' +
        ctx.prefetchedKnowledge
          .slice(0, 2)
          .map((k, i) => `${i + 1}. ${truncate(k.question, 40)} → ${truncate(k.answer, 120)}`)
          .join('\n')
    );
  }
  if (ctx.prefetchedMemory?.length) {
    parts.push(
      '【用户记忆】\n' +
        ctx.prefetchedMemory
          .slice(0, 2)
          .map(
            (h, i) =>
              `${i + 1}. [${(h.similarity * 100).toFixed(0)}%] ${truncate(h.answer || h.question, 100)}`
          )
          .join('\n')
    );
  }
  return parts.filter(Boolean).join('\n');
}

/** 规则兜底：按风险与情绪生成 3 条思维分支 */
export function buildFallbackBranches(ctx: ReActCounselContext): ThoughtBranch[] {
  const emotion = ctx.emotion.emotion || '压力';
  const category = getCategoryName(ctx.problem.category as ProblemCategory);
  const highRisk = ctx.risk.level === 'high' || ctx.risk.level === 'critical';

  return [
    {
      id: 'A',
      strategy: highRisk ? '安全优先：先稳住情绪与安全，再轻量支持' : '共情优先：先充分接纳情绪再给建议',
      empathyFocus: `先回应「${emotion}」感受，让对方感到被听见`,
      suggestionFocus: highRisk
        ? '引导寻求身边可信赖的人或校内心理中心支持'
        : `围绕「${category}」给 1–2 条可立即执行的小步骤`,
      riskNote: highRisk ? '避免深入挖掘创伤细节，强调求助通道' : '保持非诊断语气'
    },
    {
      id: 'B',
      strategy: '认知重构：温和挑战灾难化/绝对化想法',
      empathyFocus: '承认当下困扰真实存在，不急于否定感受',
      suggestionFocus: '用「证据—替代想法—小实验」帮对方松动僵化认知',
      riskNote: '不争辩对错，用好奇式提问'
    },
    {
      id: 'C',
      strategy: '行动导向：把压力拆成可控行动',
      empathyFocus: '肯定对方愿意倾诉本身就是行动的开始',
      suggestionFocus: `结合「${ctx.intervention.frameworkName}」给出今日可完成的一件小事`,
      riskNote: '建议具体、可完成，避免空泛鸡汤'
    }
  ];
}

export function parseThoughtBranches(raw: string, expected = DEFAULT_BRANCH_COUNT): ThoughtBranch[] | null {
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const arr = JSON.parse(m[0]) as Array<Partial<ThoughtBranch>>;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const branches = arr.slice(0, expected).map((b, i) => ({
      id: String(b.id || String.fromCharCode(65 + i)),
      strategy: String(b.strategy || '').trim() || `分支${i + 1}`,
      empathyFocus: String(b.empathyFocus || b.strategy || '').trim() || '共情接纳',
      suggestionFocus: String(b.suggestionFocus || '').trim() || '给可执行建议',
      riskNote: String(b.riskNote || '').trim() || '非诊断语气'
    }));
    return branches.length >= 2 ? branches : null;
  } catch {
    return null;
  }
}

export function parseScoredBranches(
  raw: string,
  branches: ThoughtBranch[]
): ScoredBranch[] | null {
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const arr = JSON.parse(m[0]) as Array<{ id?: string; score?: number; rationale?: string }>;
    if (!Array.isArray(arr) || !arr.length) return null;
    const byId = new Map(arr.map((x) => [String(x.id || '').toUpperCase(), x]));
    return branches.map((b) => {
      const hit = byId.get(b.id.toUpperCase());
      const score = typeof hit?.score === 'number' ? hit.score : Number(hit?.score) || 5;
      return {
        ...b,
        score: Math.max(0, Math.min(10, score)),
        rationale: String(hit?.rationale || '规则/模型综合评估').trim()
      };
    });
  } catch {
    return null;
  }
}

/** 规则评估：高危偏安全分支，长文本偏认知，否则偏行动 */
export function scoreBranchesByRules(ctx: ReActCounselContext, branches: ThoughtBranch[]): ScoredBranch[] {
  const highRisk = ctx.risk.level === 'high' || ctx.risk.level === 'critical';
  const longText = ctx.question.length > 100 || Boolean(ctx.description);

  return branches.map((b) => {
    let score = 6;
    const s = `${b.strategy}${b.suggestionFocus}${b.riskNote}`;
    if (highRisk && /安全|求助|心理中心|稳住/.test(s)) score += 3;
    if (highRisk && /深入|挖掘创伤/.test(s)) score -= 2;
    if (!highRisk && /行动|小步骤|小事/.test(s)) score += 1.5;
    if (longText && /认知|重构|替代想法/.test(s)) score += 1.5;
    if (/共情|接纳|听见/.test(s)) score += 0.5;
    return {
      ...b,
      score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
      rationale: highRisk ? '高危场景优先安全与求助通道' : longText ? '复杂叙述优先认知梳理' : '标准咨询兼顾共情与行动'
    };
  });
}

function selectBest(scored: ScoredBranch[]): ScoredBranch {
  return [...scored].sort((a, b) => b.score - a.score)[0];
}

async function generateBranches(
  ctx: ReActCounselContext,
  branchCount: number,
  options?: { temperature?: number; timeoutMs?: number }
): Promise<ThoughtBranch[]> {
  const prompt = `你是心理咨询推理引擎，使用 Tree-of-Thoughts（思维树）为大学生咨询生成 ${branchCount} 条互不相同的回复策略分支。

用户问题：${ctx.question}
${ctx.description ? `补充：${ctx.description}` : ''}
风险：${ctx.risk.level}；情绪：${ctx.emotion.emotion}；领域：${ctx.problem.category}

仅输出 JSON 数组（不要 markdown）：
[{"id":"A","strategy":"一句话策略","empathyFocus":"共情重点","suggestionFocus":"建议重点","riskNote":"风险注意"}, ...]`;

  const raw =
    (await callLlmGenerate(prompt, {
      temperature: options?.temperature ?? 0.55,
      maxTokens: 500,
      timeoutMs: options?.timeoutMs ?? 45_000
    })) || '';

  return parseThoughtBranches(raw, branchCount) ?? buildFallbackBranches(ctx).slice(0, branchCount);
}

async function evaluateBranches(
  ctx: ReActCounselContext,
  branches: ThoughtBranch[],
  options?: { temperature?: number; timeoutMs?: number }
): Promise<ScoredBranch[]> {
  const useLlmEval = process.env.PSYQA_TOT_LLM_EVAL === '1';
  if (!useLlmEval) {
    return scoreBranchesByRules(ctx, branches);
  }

  const prompt = `评估以下咨询思维分支（0–10 分）。标准：安全性、共情质量、可执行性、与用户问题相关性。风险=${ctx.risk.level}

分支：
${JSON.stringify(branches, null, 0)}

仅输出 JSON 数组：[{"id":"A","score":8.5,"rationale":"一句话"}, ...]`;

  const raw =
    (await callLlmGenerate(prompt, {
      temperature: options?.temperature ?? 0.2,
      maxTokens: 280,
      timeoutMs: options?.timeoutMs ?? 30_000
    })) || '';

  return parseScoredBranches(raw, branches) ?? scoreBranchesByRules(ctx, branches);
}

function buildResponderSystem(ctx: ReActCounselContext, best: ScoredBranch): string {
  return `你是大学生心理健康陪伴 AI，已通过 Tree-of-Thoughts 选定最优回复路径。
选定策略：${best.strategy}
共情重点：${best.empathyFocus}
建议重点：${best.suggestionFocus}
风险注意：${best.riskNote}

要求：温暖共情、约 280–480 字、两大块（共情+建议）、不做医疗诊断。
语气：${ctx.tone}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();
}

export async function runTotCounselAgent(
  ctx: ReActCounselContext,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
    onStep?: (step: ReActStep) => void;
    branchCount?: number;
  }
): Promise<ReActCounselResult> {
  const steps: ReActStep[] = [];
  const emit = (step: ReActStep) => {
    steps.push(step);
    options?.onStep?.(step);
  };

  const branchCount = Math.max(
    2,
    Math.min(4, options?.branchCount ?? (Number(process.env.PSYQA_TOT_BRANCHES) || DEFAULT_BRANCH_COUNT))
  );

  // Step 1: expand — 生成多条思维分支
  const branches = await generateBranches(ctx, branchCount, options);
  emit({
    step: 1,
    thought: `展开 ${branches.length} 条思维分支（ToT expand）`,
    action: 'tot_expand',
    actionInput: { branches: branches.map((b) => ({ id: b.id, strategy: b.strategy })) },
    observation: branches.map((b) => `${b.id}: ${b.strategy}`).join('；')
  });

  // Step 2: evaluate — 评分
  const scored = await evaluateBranches(ctx, branches, options);
  emit({
    step: 2,
    thought: '按安全/共情/可执行性评估各分支（ToT evaluate）',
    action: 'tot_evaluate',
    actionInput: {
      scores: scored.map((b) => ({ id: b.id, score: b.score, rationale: b.rationale }))
    },
    observation: scored.map((b) => `${b.id}=${b.score}`).join('，')
  });

  // Step 3: select
  const best = selectBest(scored);
  emit({
    step: 3,
    thought: `选定分支 ${best.id}：${best.strategy}`,
    action: 'tot_select',
    actionInput: { id: best.id, score: best.score, rationale: best.rationale },
    observation: `${best.empathyFocus} → ${best.suggestionFocus}`
  });

  // Step 4: respond
  const contextBlock = formatContextBlock(ctx);
  const userPrompt = [
    `【用户提问】${ctx.question}`,
    ctx.description ? `【补充】${ctx.description}` : '',
    ctx.historySummary ? `【历史摘要】${truncate(ctx.historySummary, 200)}` : '',
    contextBlock,
    `【开场参考】${ctx.intervention.openingPhrase}`,
    `【结尾参考】${ctx.intervention.closingPhrase}`,
    '',
    '请直接输出给用户的完整中文回复（不要 Thought/Action/JSON 格式）。'
  ]
    .filter(Boolean)
    .join('\n');

  const systemPrompt = buildResponderSystem(ctx, best);
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
    step: 4,
    thought: '沿最优思维路径生成最终回复（ToT respond）',
    action: 'tot_respond',
    actionInput: { branchId: best.id },
    observation: finalAnswer ? `已生成（${finalAnswer.length} 字）` : '生成失败'
  });

  const success = finalAnswer.length >= MIN_ANSWER_CHARS;
  const reactMode: ReactMode = success ? 'tot' : 'off';
  return {
    answer: success ? finalAnswer : '',
    steps,
    success,
    reactUsed: success,
    reactMode
  };
}
