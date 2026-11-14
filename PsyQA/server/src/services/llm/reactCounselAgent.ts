import type { KnowledgeItem } from '../knowledge/ragService';
import type { SearchResult } from '../knowledge/vectorDBService';
import { callLlmGenerate, callLlmGenerateStream } from './llmClient';
import { getCategoryName, type EmotionAnalysis, type RiskAssessment, type ProblemAnalysis, type ProblemCategory } from '../psych/emotionService';
import { isReactDemoMode, isStrictFullReAct } from './agentPolicy';
import type { ReactMode } from './agentPolicy';
import { formatPersonalMemories, MEMORY_BOUNDARY } from '../user/userMemoryService';
import { CAMPUS_REPLY_REQUIREMENT } from './counselReplyPolicy';
import { sanitizeForumStyle } from '../../utils/forumStyleSanitizer';
import { formatWikiForPrompt, searchWiki } from '../wiki/wikiService';
import type { WikiHit } from '../wiki/wikiTypes';
import { COUNSEL_TOOL_DEFS, TOOL_NAMES } from './counselTools';

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
  replyGuidance?: string;
  tone: string;
  llmRationale?: string;
  prefetchedKnowledge?: KnowledgeItem[];
  prefetchedMemory?: SearchResult[];
  /** 已发布 wiki 主题页，只给模型做内部背景，不进入前端 */
  prefetchedWiki?: WikiHit[];
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
      : '',
    ctx.intentDirective ? `【意图要求】${ctx.intentDirective}` : '',
    ctx.answerVariationHint || ''
  ].filter(Boolean);
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
  if (line.includes('micro') || line.includes('training')) return 'suggest_micro_training';
  if (line.includes('video')) return 'recommend_video';
  if (line.includes('memory')) return 'search_user_memory';
  if (line.includes('checkin') || line.includes('check_in') || line.includes('打卡') || line.includes('mood')) {
    return 'log_mood_checkin';
  }
  if (line.includes('counseling') || line.includes('resource') || line.includes('求助')) {
    return 'suggest_counseling_resource';
  }
  if (line.includes('wiki')) return 'search_wiki';
  if (line.includes('profile') || line.includes('画像')) return 'get_user_profile';
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
    .map((k, i) => {
      const question = sanitizeForumStyle(k.question);
      const answer = sanitizeForumStyle(k.answer);
      return `${i + 1}. ${truncate(question, 50)} → ${truncate(answer, 160)}`;
    })
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
      const { retrieveKnowledge } = await import('../knowledge/ragService');
      const items = await retrieveKnowledge(query, 2, ctx.problem.category, ctx.emotion.emotion);
      return formatPrefetchKnowledge(items);
    }
    case 'search_user_memory': {
      if (plan.prefetchOnly && ctx.prefetchedMemory?.length) {
        return `[预检索缓存]\n${formatPrefetchMemory(ctx, ctx.prefetchedMemory)}`;
      }
      if (plan.skipSearchTools && ctx.prefetchedMemory?.length) {
        return formatPrefetchMemory(ctx, ctx.prefetchedMemory);
      }
      const { searchBlendedUserMemory } = await import('../user/userMemoryService');
      const hits = await searchBlendedUserMemory(ctx.userId, query, 3);
      return formatPrefetchMemory(ctx, hits);
    }
    case 'search_wiki': {
      if (ctx.risk.level === 'high' || ctx.risk.level === 'critical') {
        return '高风险或危机时不注入主题知识页，优先安全与求助通道。';
      }
      const hits = await searchWiki(query, { category: ctx.problem.category, topK: 2 });
      return hits.length ? formatWikiForPrompt(hits) : '没有匹配的主题知识页。';
    }
    case 'get_user_profile': {
      const { getOrRefreshUserProfile } = await import('../user/userProfileService');
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
      if (!mood) return 'log_mood_checkin 缺少 mood 字段。';
      const { addMoodCheckin } = await import('../user/moodCheckinService');
      const checkin = addMoodCheckin(
        ctx.userId,
        mood,
        input.note ? String(input.note) : undefined
      );
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
      const { suggestMicroTrainings, formatMicroTrainingObservation } = await import(
        '../psych/microTrainingCatalog'
      );
      return formatMicroTrainingObservation(
        suggestMicroTrainings({
          emotion: ctx.emotion.emotion,
          problem: ctx.problem.category,
          risk: ctx.risk.level,
          limit: 2
        })
      );
    }
    case 'recommend_video': {
      if (ctx.risk.level === 'high' || ctx.risk.level === 'critical') {
        return '高风险或危机时不推荐视频，优先安全与求助通道。';
      }
      const { shouldRecommendVideos, recommendVideos } = await import(
        '../video/videoRecommendationService'
      );
      if (!shouldRecommendVideos(ctx.emotion, ctx.risk)) {
        return '当前情绪/风险不适合推视频，可继续共情与小步支持。';
      }
      const videos = await recommendVideos({
        userId: ctx.userId,
        question: ctx.question,
        emotion: ctx.emotion,
        problem: ctx.problem
      });
      if (!videos.length) return '未匹配到合适视频。';
      return videos
        .slice(0, 2)
        .map(
          (v, i) =>
            `${i + 1}. ${truncate(v.title, 40)}（${v.url}）`
        )
        .join('\n');
    }
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
    ? '\n编排层已预检索知识与记忆，优先 reflect_psych 后直接 finish，勿重复 search。高风险时禁止微训练与视频工具。'
    : '';
  return `你是大学生心理健康陪伴 AI，使用 ReAct（推理+行动）模式工作。

可用工具：
${COUNSEL_TOOL_DEFS.map((def) => `- ${def.signature}`).join('\n')}


每步严格输出（不要 Markdown 代码块）：
Thought: （简短推理，中文）
Action: （工具名）
Action Input: （JSON）

收到 Observation 后继续推理，直到调用 finish。
最终 answer 须遵守：${CAMPUS_REPLY_REQUIREMENT}
${ctx.replyGuidance ? `本轮语气与结构要求：${ctx.replyGuidance}` : '温暖共情、约 350–600 字、两大块（共情+建议）。'}${prefetchNote}

【finish 的 answer 格式（必须遵守）】
第一段用 2–3 句接住用户这轮原话；第二段用「·」逐条换行列 3–4 条建议，每条 20–45 字，单独一行；最后一句鼓励收尾。
不要用 Markdown 标题，不要罗列工具名、视频标题或“已检索”字样；不要一次只给一个动作。
${ctx.replyGuidance ? '' : `语气：${ctx.tone}`}

${MEMORY_BOUNDARY}
${ctx.agentContext ? `\n${ctx.agentContext}\n` : ''}`.trim();
}

function buildReActUserPrompt(ctx: ReActCounselContext, trajectory: string): string {
  const parts = [
    `【用户提问】${ctx.question}`,
    ctx.description ? `【补充】${ctx.description}` : '',
    ...formatTurnMemory(ctx),
    ctx.replyGuidance ? '' : `【开场参考】${ctx.intervention.openingPhrase}`,
    ctx.replyGuidance ? '' : `【结尾参考】${ctx.intervention.closingPhrase}`
  ].filter(Boolean);

  if (ctx.prefetchedKnowledge?.length) {
    parts.push('', '【已预检索知识】', formatPrefetchKnowledge(ctx.prefetchedKnowledge.slice(0, 2)));
  }
  if (ctx.prefetchedWiki?.length) {
    parts.push(
      '',
      '【内部主题背景 · 只帮你把握方向，不要复述、不要照抄、不要改变对用户的共情】',
      formatWikiForPrompt(ctx.prefetchedWiki)
    );
  }
  if (ctx.prefetchedMemory?.length) {
    parts.push('', '【已预检索记忆】', formatPrefetchMemory(ctx, ctx.prefetchedMemory.slice(0, 2)));
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
    parts.push(`Observation [prefetch]: ${formatPrefetchMemory(ctx, ctx.prefetchedMemory.slice(0, 2))}`);
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
  reactMode: ReactMode,
  minAnswerChars: number
): ReActCounselResult {
  const success = answer.trim().length >= minAnswerChars;
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
  const minAnswerChars = ctx.replyGuidance ? 1 : MIN_ANSWER_CHARS;
  const plan = resolveReActPlan(ctx);
  const maxSteps = options?.maxSteps ?? plan.maxSteps;
  const steps: ReActStep[] = [];
  let trajectory = '';
  let finalAnswer = '';

  if (plan.prefetchOnly) {
    trajectory = buildPrefetchTrajectory(ctx);
    finalAnswer = await generateFinishAnswer(ctx, trajectory, options);
    if (finalAnswer.length >= minAnswerChars) {
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
      return buildResult(finalAnswer, steps, 'prefetch', minAnswerChars);
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
      if (finalAnswer.length >= minAnswerChars) {
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
      if (!finalAnswer || finalAnswer.length < minAnswerChars) {
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
      if (finalAnswer.length >= minAnswerChars) {
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

  return buildResult(finalAnswer, steps, reactMode, minAnswerChars);
}
