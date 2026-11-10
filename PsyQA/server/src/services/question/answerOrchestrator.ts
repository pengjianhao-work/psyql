import { SimilarQuestion } from '../../types';
import { retrieveKnowledge, KnowledgeItem, mergeRankedReferencesRRF } from '../knowledge/ragService';
import { SearchResult, searchVectorDb } from '../knowledge/vectorDBService';
import { formatEpisodeInstruction, planEpisode } from '../user/episodeLink';
import {
  saveDialog,
  getUserSummaries,
  getRecentDialogTranscript,
  buildWorkingMemory,
  generateSummary,
  getLastPsychSnapshot,
  getUserPsychSnapshots,
  PsychSnapshot
} from '../common/historyManager';
import { refreshUserProfile } from '../user/userProfileService';
import { noteConversationTurn, resolveConversation } from '../../db/conversationStore';
import {
  buildAgentPromptContext,
  formatPersonalMemories,
  formatDurableMemory,
  rememberTurnExperience,
  scheduleUserDialogIndex,
  searchPersonalMemories,
  setDialogIndexPaused
} from '../user/userMemoryService';
import {
  buildPsychStatModel,
  applyStatisticalFusion,
  refineMetricsWithSignals,
  PsychStatModel
} from '../psych/psychStatsService';
import { ConversationPortrait } from '../user/portraitService';
import { buildPlaceholderPortrait } from '../user/portraitQueue';
import { buildPlaceholderReport, scheduleReportEnrichment } from '../common/reportQueue';
import {
  getEmotionStyle,
  getCategoryName,
  EmotionAnalysis,
  RiskAssessment,
  ProblemAnalysis,
  EmotionType,
  analyzeEmotion,
  assessRisk,
  analyzeProblem
} from '../psych/emotionService';
import { getInterventionPlan, ETHICS_FOOTER, HIGH_RISK_CLARIFICATION } from '../psych/interventionService';
import { buildSafetyReply, requiresSafetyPath } from '../psych/safetyReply';
import { CAMPUS_REPLY_REQUIREMENT } from '../llm/counselReplyPolicy';
import { analyzePsychState, PsychAnalysisBundle } from '../psych/psychAnalysisService';
import {
  classifyIntent,
  formatIntentDirective,
  intentKnowledgeLimit,
  intentMemoryLimit,
  needsPsychModel,
  IntentAnalysis
} from '../psych/intentService';
import { getCarePlanSuggestion } from '../psych/carePlanHints';
import { getOllamaModel, resolveOllamaGenerateUrl } from '../llm/ollamaClient';
import { markOllamaUnavailable } from '../llm/ollamaAvailability';
import { callLlmGenerate, getLastActiveLlmProvider, isLlmAvailable, shouldUseLlm } from '../llm/llmClient';
import { shouldRunCounselAgent, runCounselAgent, type ReActStep } from '../llm/counselAgent';
import { isValidCounselAnswer, sanitizeCounselAnswer } from '../llm/counselAnswerSanitizer';
import { getZhipuModel as getZhipuModelFromEnv } from '../llm/zhipuClient';
import { enhanceQueryWithKeywords } from './questionCatalog';
import {
  filterSimilarQuestionsForDisplay,
  filterKnowledgeForDisplay
} from '../../utils/relevanceFilter';
import { stripUserQuestionEcho } from '../../utils/answerSanitizer';
import { mineImplicitNeeds } from '../psych/implicitNeedsService';
import { getSeasonalRagBoost } from '../knowledge/seasonalRagPolicy';
import { env } from '../../config/env';

export interface CombinedAnswer {
  answer: string;
  knowledgeSources: KnowledgeItem[];
  similarQuestions: SimilarQuestion[];
  vectorDbResults?: SearchResult[];
  summary?: string;
  emotion?: EmotionAnalysis;
  risk?: RiskAssessment;
  problem?: ProblemAnalysis;
  intent?: IntentAnalysis;
  emotionStyle?: { greeting: string; tone: string; color: string; emoji: string };
  intervention?: { frameworkId: string; frameworkName: string };
  carePlan?: { categoryName: string; suggestion: string };
  analysisSources?: PsychAnalysisBundle['sources'];
  llmUsed?: boolean;
  report?: string;
  statModel?: PsychStatModel;
  modelUsed?: string;
  responseTime?: number;
  dialogId?: string;
  conversationId?: string;
  portrait?: ConversationPortrait;
  /** 完整评估报告异步生成中 */
  reportPending?: boolean;
  /** ReAct 推理链 */
  reactUsed?: boolean;
  reactMode?: 'full' | 'prefetch' | 'planner' | 'tot' | 'loop' | 'off';
  reactTrace?: ReActStep[];
  /** 生成路径提示：检索未命中 / 知识库空 / LLM 回退等 */
  generationHint?: 'llm_ok' | 'retrieval_miss' | 'kb_empty' | 'llm_fallback' | 'rule_only' | 'fast_kb';
  /** 对话结束即时简易报告（完整版异步生成） */
  briefReport?: string;
  /** 隐性心理诉求挖掘 */
  implicitNeeds?: Array<{
    id: string;
    implicitConcern: string;
    suggestedPrompt: string;
    confidence: number;
  }>;
  /** 当前季节 RAG 策略标签 */
  seasonalRagLabel?: string;
}

interface ModelConfig {
  name: string;
  apiUrl: string;
  options: {
    temperature: number;
    num_predict: number;
    top_p: number;
    top_k: number;
    repeat_penalty: number;
    stop?: string[];
  };
}

const OLLAMA_GENERATE_URL = resolveOllamaGenerateUrl();

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'qwen:7b': {
    name: 'Qwen-7B',
    apiUrl: OLLAMA_GENERATE_URL,
    options: {
      temperature: 0.45,
      num_predict: 1024,
      top_p: 0.92,
      top_k: 40,
      repeat_penalty: 1.05
    }
  },
  'qwen:14b': {
    name: 'Qwen-14B',
    apiUrl: OLLAMA_GENERATE_URL,
    options: {
      temperature: 0.4,
      num_predict: 1200,
      top_p: 0.9,
      top_k: 30,
      repeat_penalty: 1.05
    }
  },
  'deepseek-chat:6.7b': {
    name: 'DeepSeek-Chat-6.7B',
    apiUrl: OLLAMA_GENERATE_URL,
    options: {
      temperature: 0.45,
      num_predict: 1200,
      top_p: 0.95,
      top_k: 50,
      repeat_penalty: 1.04
    }
  }
};

/** 聊天区展示上限（不含 ethics 页脚）*/
const MAX_ANSWER_CHARS = 900;
const MIN_ANSWER_CHARS = 120;

const CURRENT_MODEL = getOllamaModel();
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const cache = new Map<string, { answer: string; timestamp: number }>();
const CACHE_TTL = env.answerCacheTtlMs;
const CACHE_MAX_SIZE = 1000;
const QUESTION_REPEAT_WINDOW_MS = 30 * 60 * 1000;
const recentQuestionAsks = new Map<string, { count: number; lastAt: number }>();

function normalizeQuestionKey(question: string): string {
  return question.trim().replace(/\s+/g, '');
}

/** 同一用户重复问相同问题时递增；用于跳过缓存并提示换表述 */
function trackQuestionRepeat(userId: string, question: string): number {
  const key = `${userId}:${normalizeQuestionKey(question)}`;
  const now = Date.now();
  const prev = recentQuestionAsks.get(key);
  if (!prev || now - prev.lastAt > QUESTION_REPEAT_WINDOW_MS) {
    recentQuestionAsks.set(key, { count: 1, lastAt: now });
    return 1;
  }
  const count = prev.count + 1;
  recentQuestionAsks.set(key, { count, lastAt: now });
  return count;
}

function buildAnswerVariationHint(askRepeat: number): string {
  if (askRepeat <= 1) return '';
  const styles = [
    '仍只给一个今天能做完的动作，换成另一件同样小的事',
    '用他这一轮提到的场景来写这一个动作，不要换成别的话题',
    '先接住「愿意再说一次」，再给一个不同的小行动',
    '不要补充他没说过的经历，只把这一个动作说得更具体'
  ];
  const style = styles[(askRepeat - 2) % styles.length];
  return `【重要】用户第 ${askRepeat} 次提出相同或非常相似的问题。请换一种说法与结构，${style}；勿复制「亲爱的同学」等模板开头，避免与上次回复雷同。`;
}

function getCacheKey(
  userId: string,
  question: string,
  riskLevel: string,
  intentKind: string,
  context: string
): string {
  return `v7:${userId}:${riskLevel}:${intentKind}:${question}:${context}`.substring(0, 360);
}

function shouldSkipAnswerCache(riskLevel: string): boolean {
  return riskLevel === 'high' || riskLevel === 'critical';
}

function shouldUseAnswerCache(riskLevel: string, askRepeat: number): boolean {
  if (!env.answerCacheEnabled || CACHE_TTL <= 0) return false;
  if (shouldSkipAnswerCache(riskLevel)) return false;
  if (askRepeat > 1) return false;
  return true;
}

/** 统一回复结构：共情详、建议简；去掉「今日3步」与正文内专业参考长段*/
function normalizeAnswerStructure(answer: string): string {
  let text = answer.trim();

  text = text.replace(
    /\*\*今天就能开始的\s*3\s*个小步骤\*\*[\s\S]*?(?=\n\n\*\*|\n\n---|\n\n【重要说明】|$)/gi, '');
  text = text.replace(/\*\*今天\s*可做的\s*3\s*步\*\*[\s\S]*?(?=\n\n|$)/gi, '');
  text = text.replace(/\*\*今天\s*3\s*步\*\*[\s\S]*?(?=\n\n|$)/gi, '');

  text = text.replace(/\*\*专业参考\*\*[\s\S]*?(?=\n\n\*\*今天|\n\n---|\n\n【重要说明】|$)/gi, '');
  text = text.replace(
    /(?:\*\*参考建议\s*\d+\*\*[\s\S]*?)(?=(?:\n\n\*\*参考建议\s*\d+|\n\n\*\*今天|\n\n---|\n\n【重要说明】|$))/gi, '');

  text = text.replace(
    /\*\*我们可以这样理解当下\*\*\s*\n+[\s\S]*?(?=\n\n\*\*)/,
    '困扰往往与压力、人际或自我期待交织；先让情绪被看见，再慢慢找办法，会比逼自己立刻好起来更可持续。\n\n');

  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/** 去掉 LLM 开头复述用户原话 — 见 utils/answerSanitizer.ts */

function truncateSnippet(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function formatKnowledgeForPrompt(knowledge: KnowledgeItem[]): string {
  return knowledge
    .map((k, i) => `${i + 1}. 问：${truncateSnippet(k.question, 40)}\n   要点：${truncateSnippet(k.answer, 180)}`)
    .join('\n\n');
}

function clampAnswerLength(answer: string, maxLen = MAX_ANSWER_CHARS): string {
  const trimmed = answer.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('。'), cut.lastIndexOf('！'));
  if (lastBreak > maxLen * 0.55) {
    return cut.slice(0, lastBreak + 1).trim();
  }
  return `${cut.trim()}…`;
}

function getCachedAnswer(key: string): string | null {
  if (CACHE_TTL <= 0) return null;
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.answer;
  }
  cache.delete(key);
  return null;
}

function setCachedAnswer(key: string, answer: string): void {
  cache.set(key, { answer, timestamp: Date.now() });
  if (cache.size > CACHE_MAX_SIZE) {
    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;

    for (const [currentKey, value] of cache.entries()) {
      if (value.timestamp < oldestTimestamp) {
        oldestTimestamp = value.timestamp;
        oldestKey = currentKey;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
}

async function callLlmServiceWithRetry(
  prompt: string,
  config: ModelConfig,
  temperatureOverride?: number
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const text = await callLlmGenerate(prompt, {
        temperature: temperatureOverride ?? config.options.temperature,
        maxTokens: config.options.num_predict,
        timeoutMs: 45_000
      });
      if (text) return text;
      markOllamaUnavailable();
    } catch (error) {
      console.warn(`LLM 调用失败 (尝试 ${attempt}/${MAX_RETRIES}):`, error);
      markOllamaUnavailable();
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }
  return '';
}

function buildExpandedFallbackAnswer(
  question: string,
  intervention: { openingPhrase: string; closingPhrase: string; frameworkName: string; structureHint: string },
  description?: string
): string {
  const snippet = truncateSnippet(question, 80);
  const empathyBlock = [
    intervention.openingPhrase,
    `你刚才说的是「${snippet}」。我只接这一件事，不补充你没说过的经历。`,
    description ? `你还补充了「${truncateSnippet(description, 80)}」。` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
  const adviceBlock = '今天只做一步：用三分钟把这件事写成一句话，发给一位你信任的同学，或学校心理中心。发完就停。';
  const body = [empathyBlock, adviceBlock, intervention.closingPhrase].join('\n\n');
  return clampAnswerLength(normalizeAnswerStructure(body));
}

function ensureAnswerLength(
  answer: string,
  question: string,
  intervention: { openingPhrase: string; closingPhrase: string; frameworkName: string; structureHint: string },
  description?: string
): string {
  let trimmed = clampAnswerLength(answer.trim());
  if (trimmed.length >= MIN_ANSWER_CHARS) {
    return trimmed;
  }
  const tail = intervention.closingPhrase.trim();
  trimmed = trimmed
    ? `${trimmed}\n\n${tail}`
    : buildExpandedFallbackAnswer(question, intervention, description);
  return clampAnswerLength(normalizeAnswerStructure(trimmed));
}

const buildPsychSnapshot = (
  emotion: EmotionAnalysis,
  risk: RiskAssessment,
  problem: ProblemAnalysis,
  frameworkId?: string,
  sources?: PsychAnalysisBundle['sources']
): PsychSnapshot => {
  const metrics = refineMetricsWithSignals(emotion, risk, problem);
  return {
    emotion: emotion.emotion,
    risk: risk.level,
    problem: problem.category,
    confidence: emotion.confidence,
    stressLevel: metrics.stressLevel,
    anxietyLevel: metrics.anxietyLevel,
    moodStability: metrics.moodStability,
    modelStressLevel: metrics.stressLevel,
    modelAnxietyLevel: metrics.anxietyLevel,
    modelMoodStability: metrics.moodStability,
    frameworkId,
    analysisSources: sources
  };
};

function ruleOnlyPsychBundle(
  emotion: EmotionAnalysis,
  risk: RiskAssessment,
  problem: ProblemAnalysis,
  intent: IntentAnalysis
): PsychAnalysisBundle {
  return {
    emotion,
    risk,
    problem,
    intent,
    sources: { emotion: 'rule', risk: 'rule', problem: 'rule', intent: 'rule' },
    llmUsed: false
  };
}

function buildIntentShortcutAnswer(kind: 'greeting' | 'offtopic', greeting: string): string {
  if (kind === 'greeting') {
    return `${greeting}\n\n我在。你可以直接说说最近让你难受、紧张，或者不知道怎么办的事。${ETHICS_FOOTER}`;
  }
  return `我主要陪你聊心情、学业、人际和压力。写作业、写代码或查无关信息，我帮不上忙。\n\n如果这件事让你烦、累或者不知道怎么办，可以直接说感受。${ETHICS_FOOTER}`;
}

function finishLightweightTurn(input: {
  userId: string;
  question: string;
  answer: string;
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem: ProblemAnalysis;
  intent: IntentAnalysis;
  similarQuestions: SimilarQuestion[];
  startTime: number;
  conversationId?: string;
}): CombinedAnswer {
  const sources = {
    emotion: 'rule' as const,
    risk: 'rule' as const,
    problem: 'rule' as const,
    intent: 'rule' as const
  };
  const intervention = getInterventionPlan(input.emotion.emotion, input.problem.category, input.risk.level);
  const carePlan = getCarePlanSuggestion(input.problem.category);
  const emotionStyle = getEmotionStyle(input.emotion.emotion);
  const psychSnapshot = buildPsychSnapshot(
    input.emotion,
    input.risk,
    input.problem,
    intervention.frameworkId,
    sources
  );
  const report =
    input.intent.kind === 'greeting'
      ? '本次是寒暄，还没有进入具体困扰。'
      : '本次问题和情绪陪伴无关，已把对话轻轻拉回来。';
  const summary = generateSummary(input.question, input.answer, psychSnapshot);
  const dialogId = saveDialog(
    input.userId,
    input.question,
    input.answer,
    summary,
    psychSnapshot,
    report,
    input.conversationId
  );
  if (input.conversationId) noteConversationTurn(input.userId, input.conversationId, input.question);
  scheduleUserDialogIndex({
    userId: input.userId,
    dialogTime: dialogId,
    userText: input.question,
    botText: input.answer,
    psych: psychSnapshot
  });
  try {
    refreshUserProfile(input.userId);
  } catch {
    /* profile refresh is best-effort */
  }
  const metrics = refineMetricsWithSignals(input.emotion, input.risk, input.problem);
  const statModel = buildPsychStatModel(
    input.emotion,
    input.risk,
    input.problem,
    metrics,
    getUserPsychSnapshots(input.userId)
  );
  return {
    answer: input.answer,
    knowledgeSources: [],
    similarQuestions: input.similarQuestions,
    vectorDbResults: [],
    summary,
    emotion: input.emotion,
    risk: input.risk,
    problem: input.problem,
    intent: input.intent,
    emotionStyle,
    intervention: { frameworkId: intervention.frameworkId, frameworkName: intervention.frameworkName },
    carePlan: { categoryName: carePlan.categoryName, suggestion: carePlan.suggestion },
    analysisSources: sources,
    llmUsed: false,
    generationHint: 'rule_only',
    briefReport: `${report}\n意图：${input.intent.label}`,
    report,
    reportPending: false,
    statModel,
    modelUsed: 'Intent-Shortcut',
    responseTime: Date.now() - input.startTime,
    dialogId,
    conversationId: input.conversationId,
    portrait: buildPlaceholderPortrait()
  };
}

export type AnswerStreamCallbacks = {
  onToken?: (chunk: string) => void;
  onReactStep?: (step: ReActStep) => void;
  onAnswerReady?: (answer: string) => void;
  onStreamReset?: () => void;
};

const generateAIAnswerBody = async (
  question: string,
  description: string | undefined,
  similarQuestions: SimilarQuestion[],
  userId: string = 'default_user',
  stream?: AnswerStreamCallbacks,
  conversationId?: string
): Promise<CombinedAnswer> => {
  const startTime = Date.now();
  const loadTestFast = process.env.PSYQA_LOAD_TEST === '1';
  const fullText = question + (description || '');
  const session =
    userId && userId !== 'default_user' ? resolveConversation(userId, conversationId) : null;

  const lastPsych = getLastPsychSnapshot(userId, session?.id);
  const priorEmotion = lastPsych
    ? { emotion: lastPsych.emotion, confidence: lastPsych.confidence }
    : undefined;

  const ruleEmotion = analyzeEmotion(fullText, priorEmotion);
  const ruleRisk = assessRisk(fullText);
  const ruleProblem = analyzeProblem(fullText);
  const hasHistory = session ? session.turns > 0 : Boolean(lastPsych);
  const earlyIntent = classifyIntent(fullText, { hasHistory });

  if (earlyIntent.kind === 'crisis' || requiresSafetyPath(ruleRisk)) {
    const metrics = refineMetricsWithSignals(ruleEmotion, ruleRisk, ruleProblem);
    const historySnapshots = getUserPsychSnapshots(userId);
    const statModel = buildPsychStatModel(ruleEmotion, ruleRisk, ruleProblem, metrics, historySnapshots);
    const intervention = getInterventionPlan(ruleEmotion.emotion, ruleProblem.category, ruleRisk.level);
    const carePlan = getCarePlanSuggestion(ruleProblem.category);
    const emotionStyle = getEmotionStyle(ruleEmotion.emotion);
    const crisisIntent = earlyIntent;
    const psychSnapshot = buildPsychSnapshot(ruleEmotion, ruleRisk, ruleProblem, intervention.frameworkId, {
      emotion: 'rule',
      risk: 'rule',
      problem: 'rule',
      intent: 'rule'
    });
    const placeholderReport = buildPlaceholderReport(psychSnapshot);
    const priorityAnswer = buildSafetyReply(ruleRisk);
    stream?.onAnswerReady?.(priorityAnswer);
    const summary = generateSummary(question, priorityAnswer, psychSnapshot);
    const dialogId = saveDialog(
      userId,
      question,
      priorityAnswer,
      summary,
      psychSnapshot,
      placeholderReport,
      session?.id
    );
    if (session) noteConversationTurn(userId, session.id, question);
    try {
      refreshUserProfile(userId);
      rememberTurnExperience({
        userId,
        dialogTime: dialogId,
        problem: getCategoryName(ruleProblem.category),
        emotion: ruleEmotion.emotion,
        framework: intervention.frameworkName,
        userText: question
      });
      scheduleUserDialogIndex({
        userId,
        dialogTime: dialogId,
        userText: question,
        botText: priorityAnswer,
        psych: psychSnapshot
      });
    } catch {
      /* profile refresh is best-effort */
    }
    scheduleReportEnrichment({
      userId,
      dialogTime: dialogId,
      question,
      answer: priorityAnswer,
      fullText,
      priorEmotion,
      psychSnapshot,
      frameworkId: intervention.frameworkId,
      frameworkName: intervention.frameworkName,
      loadTestFast
    });
    return {
      answer: priorityAnswer,
      knowledgeSources: [],
      similarQuestions,
      vectorDbResults: [],
      summary,
      emotion: ruleEmotion,
      risk: ruleRisk,
      problem: ruleProblem,
      intent: crisisIntent,
      emotionStyle,
      intervention: { frameworkId: intervention.frameworkId, frameworkName: intervention.frameworkName },
      carePlan: { categoryName: carePlan.categoryName, suggestion: carePlan.suggestion },
      analysisSources: { emotion: 'rule', risk: 'rule', problem: 'rule', intent: 'rule' },
      llmUsed: false,
      report: placeholderReport,
      reportPending: true,
      statModel,
      modelUsed: 'Safety-Priority-Fast',
      responseTime: Date.now() - startTime,
      dialogId,
      conversationId: session?.id,
      portrait: buildPlaceholderPortrait()
    };
  }

  const ruleIntent = earlyIntent;
  console.log(`[intent] ${ruleIntent.label} ${(ruleIntent.confidence * 100).toFixed(0)}%`);

  if (ruleIntent.kind === 'greeting' || ruleIntent.kind === 'offtopic') {
    const emotionStyle = getEmotionStyle(ruleEmotion.emotion);
    return finishLightweightTurn({
      userId,
      question,
      answer: buildIntentShortcutAnswer(ruleIntent.kind, emotionStyle.greeting),
      emotion: ruleEmotion,
      risk: ruleRisk,
      problem: ruleProblem,
      intent: ruleIntent,
      similarQuestions,
      startTime,
      conversationId: session?.id
    });
  }

  const useLlm = !loadTestFast && shouldUseLlm();
  const llmPromise = useLlm ? isLlmAvailable() : Promise.resolve(false);

  const ruleBundle = ruleOnlyPsychBundle(ruleEmotion, ruleRisk, ruleProblem, ruleIntent);
  const recentDialogs = getRecentDialogTranscript(userId, 2, session?.id);
  const previousUser = recentDialogs.match(/用户：([^\n]+)/)?.[1]?.slice(0, 80) ?? '';
  const continueForRetrieval = ruleIntent.kind === 'followup' && Boolean(previousUser);
  const retrievalText = continueForRetrieval ? `${previousUser} ${fullText}` : fullText;
  const ruleRetrievalQuery = enhanceQueryWithKeywords(retrievalText, [
    ...ruleProblem.keywords,
    ...ruleProblem.subcategories,
    ...(ruleIntent.kind === 'followup' && lastPsych?.problem ? [getCategoryName(lastPsych.problem)] : [])
  ]);

  const psychPromise: Promise<PsychAnalysisBundle> = llmPromise.then((ok) => {
    if (ok && needsPsychModel(ruleIntent, ruleRisk.level)) {
      return analyzePsychState(fullText, priorEmotion, { tryLlm: true, hasHistory });
    }
    if (ok) console.log('[intent] 规则已足够，跳过情绪 JSON');
    return ruleBundle;
  });

  const retrievalPromise = Promise.resolve(
    retrieveKnowledge(
      ruleRetrievalQuery,
      intentKnowledgeLimit(ruleIntent.kind),
      ruleProblem.category,
      ruleEmotion.emotion
    )
  );
  const knowledgeLimit = intentKnowledgeLimit(ruleIntent.kind);
  const vectorPromise =
    knowledgeLimit > 0
      ? searchVectorDb(retrievalText, Math.max(knowledgeLimit, 3)).catch(() => [] as SearchResult[])
      : Promise.resolve([] as SearchResult[]);

  const [llmOk, psychBundle, retrievedKnowledge, vectorHits] = await Promise.all([
    llmPromise,
    psychPromise,
    retrievalPromise,
    vectorPromise
  ]);
  const memoryLimit = intentMemoryLimit(ruleIntent.kind);
  const memoryBox: { hits: SearchResult[] | null } = { hits: null };
  if (memoryLimit > 0) {
    void searchPersonalMemories(userId, retrievalText, Math.max(memoryLimit, 4))
      .then((hits) => {
        memoryBox.hits = hits;
      })
      .catch(() => {
        memoryBox.hits = [];
      });
  }
  const vectorDbResults: SearchResult[] = [];
  const {
    emotion: rawEmotion,
    risk: rawRisk,
    problem: rawProblem,
    intent,
    sources,
    llmUsed: psychLlmUsed,
    llmRationale
  } = psychBundle;
  const intentDirective = formatIntentDirective(intent);

  const historySnapshots = getUserPsychSnapshots(userId);
  const metrics = refineMetricsWithSignals(rawEmotion, rawRisk, rawProblem);
  const statModel = buildPsychStatModel(rawEmotion, rawRisk, rawProblem, metrics, historySnapshots);
  const { emotion, risk, problem } = applyStatisticalFusion(rawEmotion, rawRisk, rawProblem, statModel);
  statModel.compositeScores.riskLevel = risk.level;
  const intervention = getInterventionPlan(emotion.emotion, problem.category, risk.level);
  const carePlan = getCarePlanSuggestion(problem.category);
  const emotionStyle = getEmotionStyle(emotion.emotion);
  const modelConfig = MODEL_CONFIGS[CURRENT_MODEL] ?? MODEL_CONFIGS['qwen:7b'];
  const psychSnapshot = buildPsychSnapshot(emotion, risk, problem, intervention.frameworkId, sources);
  const placeholderReport = buildPlaceholderReport(psychSnapshot);

  const workingMemory = buildWorkingMemory(userId, session?.id);
  const durableMemory = formatDurableMemory(userId);
  const historySummaryRaw = getUserSummaries(userId);
  const historySummary =
    historySummaryRaw.length > 400 ? `…${historySummaryRaw.slice(-400)}` : historySummaryRaw;
  const retrievalQuery = enhanceQueryWithKeywords(fullText, [
    ...problem.keywords,
    ...problem.subcategories
  ]);

  const rerankedKnowledge = filterKnowledgeForDisplay(
    fullText,
    mergeRankedReferencesRRF(
      retrievalQuery,
      retrievedKnowledge,
      vectorHits,
      problem.category,
      emotion.emotion,
      3
    ),
    2
  );

  const knowledgeContext = formatKnowledgeForPrompt(rerankedKnowledge);
  const personalMemoryText = formatPersonalMemories(vectorDbResults, recentDialogs, {
    question: fullText,
    continuePrevious: intent.kind === 'followup'
  });
  const episodeNote = formatEpisodeInstruction(planEpisode(fullText));
  
  const tone = emotionStyle.tone;
  const intensityLabel =
    emotion.confidence >= 0.75 ? '较强' : emotion.confidence >= 0.45 ? '中等' : '轻度';
  const emotionDescription = ({
    happy: '用户心情不错，保持积极、鼓励的回应',
    sad: '用户情绪低落，需要温柔安抚和情感支持',
    anxious: '用户感到焦虑，需要耐心引导和放松建议',
    angry: '用户感到愤怒，需要冷静包容和情绪疏导',
    lonely: '用户感到孤独，需要温暖陪伴和情感连接',
    neutral: '用户情绪平稳，可以正常交流',
    hopeful: '用户充满希望，给予积极鼓励和支持',
    confused: '用户感到迷茫，需要耐心引导和分析',
    frustrated: '用户感到挫败，需要理解和鼓励',
    guilty: '用户感到内疚，需要宽容和接纳',
    shameful: '用户感到羞愧，需要包容和支持',
    proud: '用户感到自豪，给予肯定和赞赏'
  } as Record<EmotionType, string>)[emotion.emotion];
  
  const systemPrompt = `
你是校园里的心理辅助支持，温柔、耐心，但不是医生。
${CAMPUS_REPLY_REQUIREMENT}
短期会话、工作记忆和长期习惯只用来认识这个人。这轮没接着上一轮说时，不要把旧事写进回答。
  `.trim();

  const recentRiskNote =
    lastPsych && (lastPsych.risk === 'medium' || lastPsych.risk === 'high')
      ? '近几次对话风险偏高，请缩短建议、优先提供可联系的支持资源，语气稳定克制。'
      : '';

  const agentContext = buildAgentPromptContext(userId);
  const answerShape =
    intent.kind === 'venting'
      ? `【回答篇幅与结构 · 以倾诉为准】
- 先接住这一轮原话，再给一个今天能做完的小行动
- 不要只安慰，不要三条以上的清单，不要诊断
- 最后一句：${intervention.closingPhrase}`
      : intent.kind === 'followup'
        ? `【回答篇幅与结构 · 以追问为准】
- 只顺着这一轮的追问往下说，补一个小行动
- 这一轮没再提起的旧事不要写回来
- 最后一句：${intervention.closingPhrase}`
        : intent.kind === 'crisis'
          ? `【回答篇幅与结构 · 以安全为准】
- 不诊断，不讨论停药、减药、换药或开药
- 写出热线 400-161-9995，只留一个求助动作
- 最后一句：${intervention.closingPhrase}`
          : '';

  const askRepeat = trackQuestionRepeat(userId, question);
  const answerVariationHint = buildAnswerVariationHint(askRepeat);
  const genTemperature = Math.min(
    0.85,
    modelConfig.options.temperature + (askRepeat > 1 ? 0.2 : 0.06)
  );

  const prompt = `
${systemPrompt}
${agentContext ? `\n${agentContext}\n` : ''}

【话术参考 · 开场】${intervention.openingPhrase}

【短期会话记忆】
${recentDialogs
    ? intent.kind === 'followup'
      ? `用户在接着上一轮说。接这些原话往下说。\n${recentDialogs}`
      : `这是上一轮，只供认识对方。这轮如果换了话题，不要把这些内容写进回答。\n${recentDialogs}`
    : '这是第一轮。'}

【工作记忆】
${workingMemory
    ? intent.kind === 'followup'
      ? `沿着上一轮议题往下做。\n${workingMemory}`
      : `下面是上一轮的议题和情绪，不是这轮要回答的问题。\n${workingMemory}`
    : '还没有进行中的议题。'}

【长期记忆 · 习惯与做过的事】
${durableMemory
    ? `只用来调整语气、避开敏感点、沿用对方觉得有用的做法。不要把旧议题当成这轮的问题。\n${durableMemory}`
    : '还没有沉淀下来的习惯。'}

【用户历史心理状态 · 摘要】${historySummary || '暂无历史记录'}
摘要只说明这个人，不要把里面的旧事写进这轮回答。

【问题领域】主要类型「${getCategoryName(problem.category)}」
可能涉及：${problem.subcategories.length > 0 ? problem.subcategories.join('、') : '暂无'}
问题相关词：${problem.keywords.length > 0 ? problem.keywords.join('、') : '无'}

${intentDirective}

【当前情绪状态 · 大模型与规则融合】${emotionDescription}
情绪强度：${intensityLabel}
检测到的情绪关键词：${emotion.keywords.length > 0 ? emotion.keywords.join('、') : '无'}
情绪置信度：${(emotion.confidence * 100).toFixed(0)}%（若偏低请谨慎推断）
${llmRationale ? `智能分析要点：${llmRationale}` : ''}

【咨询干预框架】框架名只用来选语气：${intervention.frameworkName}
不要把框架拆成多步清单。全文只保留一个今天能做完的小行动。
${recentRiskNote}
${answerVariationHint ? `\n${answerVariationHint}\n` : ''}

${answerShape || `【回答篇幅与结构 · 必须遵守】
- 全文大约 160–320 字
- 先用一两句接住这一轮原话，不要答到别的话题，也不要写他没说过的经历
- 然后只给一个今天能做完的小行动，写清做什么、做完就停
- 最后单独一句结尾：${intervention.closingPhrase}
- 禁止：只安慰就结束、三条以上的行动清单、医疗或药物步骤、诊断、粘贴知识库原文`}

【长期向量记忆】
${personalMemoryText || '没有检索到更早的相关原话。不要编造过去。'}

${episodeNote ? `【这轮有几件事】\n${episodeNote}\n` : ''}
【参考知识 · 仅提炼要点，勿复制原文】${knowledgeContext || '暂无'}

【用户提问】
问题：${question}
${description ? `补充描述：${description}` : ''}

【回答要求】
- 以${tone}的语气，像学校里面对面的短交谈
- 先接住这一轮，再给一个小行动；不做诊断，不讨论用药
- 不要把回答写成另一件事。知识库最多用一句话核对，不要抄成建议
- 这轮没提到的旧事不要写进回答

请直接开始回答（不要元话语、不用 Markdown 小标题堆砌）：`.trim();

  let displaySimilarQuestions = filterSimilarQuestionsForDisplay(
    question,
    description,
    similarQuestions,
    2
  );

  const cacheKey = getCacheKey(userId, question, risk.level, intent.kind, historySummary.substring(0, 80));
  let answer: string | undefined;
  let answerLlmUsed = false;
  let reactUsed = false;
  let reactMode: CombinedAnswer['reactMode'] = 'off';
  let reactTrace: ReActStep[] | undefined;

  const cachedAnswer =
    shouldUseAnswerCache(risk.level, askRepeat) ? getCachedAnswer(cacheKey) : null;
  if (cachedAnswer && cachedAnswer.length >= MIN_ANSWER_CHARS) {
    const cleanedCache = sanitizeCounselAnswer(cachedAnswer);
    if (isValidCounselAnswer(cleanedCache)) {
      console.log('使用缓存答案');
      answer = normalizeAnswerStructure(cleanedCache);
      answerLlmUsed = llmOk;
    }
  }

  if (answer === undefined && loadTestFast) {
    answer = buildExpandedFallbackAnswer(question, intervention, description);
  } else if (answer === undefined && llmOk) {
    let llmAnswer = '';
    const tryAgent = shouldRunCounselAgent();

    if (tryAgent) {
      try {
        const agentResult = await runCounselAgent(
          {
            userId,
            question,
            description,
            emotion,
            risk,
            problem,
            intervention,
            historySummary,
            recentDialogs,
            workingMemory,
            durableMemory,
            continuePrevious: intent.kind === 'followup',
            agentContext,
            tone,
            llmRationale,
            prefetchedKnowledge: rerankedKnowledge,
            prefetchedMemory: vectorDbResults,
            answerVariationHint: answerVariationHint || undefined,
            intentDirective
          },
          {
            temperature: genTemperature,
            timeoutMs: 90_000,
            onToken: stream?.onToken,
            onStep: stream?.onReactStep,
            onStreamReset: stream?.onStreamReset
          }
        );
        reactTrace = agentResult.steps;
        reactMode = agentResult.reactMode;
        reactUsed =
          agentResult.reactMode === 'full' ||
          agentResult.reactMode === 'planner' ||
          agentResult.reactMode === 'tot';
        if (agentResult.success && agentResult.answer.length >= MIN_ANSWER_CHARS) {
          const cleaned = sanitizeCounselAnswer(agentResult.answer);
          llmAnswer = isValidCounselAnswer(cleaned) ? cleaned : '';
        }
      } catch (err) {
        console.warn('[counsel-agent]', err instanceof Error ? err.message : err);
      }
    }

    if (!llmAnswer) {
      try {
        if (stream?.onToken) {
          const { callLlmGenerateStream } = await import('../llm/llmClient');
          llmAnswer =
            (await callLlmGenerateStream(prompt, {
              temperature: genTemperature,
              maxTokens: modelConfig.options.num_predict,
              timeoutMs: 90_000,
              onToken: stream.onToken
            })) || '';
        } else {
          llmAnswer = await callLlmServiceWithRetry(prompt, modelConfig, genTemperature);
        }
      } catch {
        llmAnswer = '';
        const { markZhipuUnavailable } = await import('../llm/zhipuClient');
        markZhipuUnavailable();
      }
    }

    if (llmAnswer) {
      const cleanedDirect = sanitizeCounselAnswer(llmAnswer);
      if (!isValidCounselAnswer(cleanedDirect)) {
        llmAnswer = '';
      } else {
        llmAnswer = cleanedDirect;
      }
    }

    if (llmAnswer) {
      answerLlmUsed = true;
      answer = ensureAnswerLength(
        stripUserQuestionEcho(normalizeAnswerStructure(llmAnswer), question),
        question,
        intervention,
        description
      );
      if (answer.length >= MIN_ANSWER_CHARS && shouldUseAnswerCache(risk.level, askRepeat)) {
        setCachedAnswer(cacheKey, answer);
      }
    } else if (rerankedKnowledge.length > 0) {
      answer = buildExpandedFallbackAnswer(question, intervention, description);
    } else if (displaySimilarQuestions.length > 0) {
      const contextAnswers = displaySimilarQuestions.flatMap((sq) =>
        sq.answers.map((a) => a.answer_text)
      );
      answer = generateAnswerWithContext(question, description, contextAnswers, intervention);
    } else {
      answer = buildExpandedFallbackAnswer(question, intervention, description);
    }
  } else if (answer === undefined) {
    answer = buildExpandedFallbackAnswer(question, intervention, description);
  }

  answer = answer!;

  if (requiresSafetyPath(risk) || intent.kind === 'crisis') {
    answer = buildSafetyReply(risk);
  } else if (risk.level === 'high' || risk.level === 'critical') {
    const safetyLine = risk.warningMessage || '你的安全最重要，请先联系身边可信的人或专业支持。';
    answer = `
⚠️ ${safetyLine}

📞 ${risk.hotline}

${HIGH_RISK_CLARIFICATION}

---

${answer}
    `.trim();
  }

  answer = clampAnswerLength(stripUserQuestionEcho(normalizeAnswerStructure(answer), question));

  if (
    memoryBox.hits &&
    memoryBox.hits.length > 0 &&
    risk.level !== 'high' &&
    risk.level !== 'critical' &&
    intent.kind !== 'crisis'
  ) {
    const lateMemory = formatPersonalMemories(memoryBox.hits, recentDialogs, {
      question: fullText,
      continuePrevious: intent.kind === 'followup'
    });
    const remembered = lateMemory.match(/用户当时说：([^\n]+)/)?.[1]?.trim();
    if (remembered) {
      answer = `${answer}\n\n这和你之前提到的「${remembered.slice(0, 24)}」是同一条线上的事。`;
    }
  }

  if (!answer.includes('不能替代医疗诊断')) {
    answer = `${answer}\n\n---\n\n${ETHICS_FOOTER}`;
  }

  stream?.onAnswerReady?.(answer);

  const agentTag =
    reactMode === 'tot' ? '+ToT' : reactMode === 'planner' ? '+Planner' : reactUsed ? '+ReAct' : '';
  const activeModelLabel =
    getLastActiveLlmProvider() === 'zhipu'
      ? `Zhipu-${getZhipuModelFromEnv()}${agentTag}`
      : answerLlmUsed
        ? `${modelConfig.name}${agentTag}`
        : 'Rule+Knowledge';

  const summary = generateSummary(question, answer, psychSnapshot);
  const dialogId = saveDialog(
    userId,
    question,
    answer,
    summary,
    psychSnapshot,
    placeholderReport,
    session?.id
  );
  if (session) noteConversationTurn(userId, session.id, question);
  try {
    refreshUserProfile(userId);
    rememberTurnExperience({
      userId,
      dialogTime: dialogId,
      problem: getCategoryName(problem.category),
      emotion: emotion.emotion,
      framework: intervention.frameworkName,
      userText: question
    });
    scheduleUserDialogIndex({
      userId,
      dialogTime: dialogId,
      userText: question,
      botText: answer,
      psych: psychSnapshot
    });
  } catch {
    /* profile refresh is best-effort */
  }
  scheduleReportEnrichment({
    userId,
    dialogTime: dialogId,
    question,
    answer,
    fullText,
    priorEmotion,
    psychSnapshot,
    frameworkId: intervention.frameworkId,
    frameworkName: intervention.frameworkName,
    loadTestFast
  });
  const responseTime = Date.now() - startTime;

  let generationHint: CombinedAnswer['generationHint'] = 'llm_ok';
  if (!useLlm || loadTestFast) {
    generationHint = rerankedKnowledge.length > 0 ? 'fast_kb' : 'rule_only';
  } else if (!llmOk) {
    generationHint = 'rule_only';
  } else if (!answerLlmUsed) {
    generationHint = rerankedKnowledge.length === 0 ? 'kb_empty' : 'llm_fallback';
  }

  const implicitHints = mineImplicitNeeds(userId, question);
  const seasonal = getSeasonalRagBoost();

  const briefReportLines = [
    `【即时简易报告】`,
    summary,
    `情绪：${emotion.emotion}（置信 ${(emotion.confidence * 100).toFixed(0)}%）`,
    `风险：${risk.level}${risk.warningMessage ? ` · ${risk.warningMessage.slice(0, 40)}` : ''}`,
    `关注领域：${getCategoryName(problem.category)}`,
    `意图：${intent.label}`,
    `干预框架：${intervention.frameworkName}`
  ];
  if (implicitHints.length) {
    briefReportLines.push('', '【隐性关注提示】', ...implicitHints.map((h) => `· ${h.implicitConcern}`));
  }
  briefReportLines.push('', '完整评估报告正在后台生成，稍后可在侧栏查看。');
  const briefReport = briefReportLines.join('\n');

  return {
    answer,
    knowledgeSources: rerankedKnowledge,
    similarQuestions: displaySimilarQuestions,
    vectorDbResults: memoryBox.hits ?? vectorDbResults,
    summary,
    emotion,
    risk,
    problem,
    intent,
    emotionStyle,
    intervention: {
      frameworkId: intervention.frameworkId,
      frameworkName: intervention.frameworkName
    },
    carePlan: { categoryName: carePlan.categoryName, suggestion: carePlan.suggestion },
    analysisSources: sources,
    llmUsed: answerLlmUsed || psychLlmUsed,
    reactUsed,
    reactMode,
    reactTrace,
    generationHint,
    briefReport,
    implicitNeeds: implicitHints.map((h) => ({
      id: h.id,
      implicitConcern: h.implicitConcern,
      suggestedPrompt: h.suggestedPrompt,
      confidence: h.confidence
    })),
    seasonalRagLabel: seasonal.label,
    report: placeholderReport,
    reportPending: true,
    statModel,
    modelUsed: activeModelLabel,
    responseTime,
    dialogId,
    conversationId: session?.id,
    portrait: buildPlaceholderPortrait()
  };
};

export const generateAIAnswer = async (
  ...args: Parameters<typeof generateAIAnswerBody>
): Promise<CombinedAnswer> => {
  setDialogIndexPaused(true);
  try {
    return await generateAIAnswerBody(...args);
  } finally {
    setDialogIndexPaused(false);
  }
};

const generateAnswerWithContext = (
  question: string,
  description: string | undefined,
  contextAnswers: string[],
  intervention: { openingPhrase: string; closingPhrase: string; frameworkName: string; structureHint: string }
): string => {
  const empathyBlock = [
    intervention.openingPhrase,
    `你刚才说的是「${truncateSnippet(question, 80)}」。我只接这一件事。`,
    description ? `你还补充了「${truncateSnippet(description, 80)}」。` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  const refLine =
    contextAnswers.length > 0
      ? `参考里有一句可以核对：${truncateSnippet(contextAnswers[0], 40)}。`
      : '';

  const body = [
    empathyBlock,
    `今天只做一步：用三分钟把这件事写成一句话，发给一位你信任的同学，或学校心理中心。发完就停。${refLine}`,
    intervention.closingPhrase
  ].join('\n\n');

  return clampAnswerLength(normalizeAnswerStructure(body));
};

