import { Request, Response } from 'express';
import { Question } from '../types';
import {
  loadQuestions,
  findSimilarQuestions,
  generateAIAnswer,
  getCategories,
  getUserProgressData,
  getUserProgress as getProgressText,
  clearUserHistory,
  CombinedAnswer
} from '../services/questionService';
import { getGroupedUserHistory } from '../services/common/historyManager';
import { clearUserAgentMemory } from '../services/user/userMemoryService';
import { AuthRequest } from '../middleware/authMiddleware';
import { getUserById } from '../services/user/accountService';
import { resolveStudentUserId } from '../utils/resolveUserId';
import { recordRiskAlert } from '../services/school/schoolAlertService';
import { recordConsultationForSchool } from '../services/school/schoolStatsCache';
import { getKnowledgeBaseCount } from '../services/knowledge/ragService';
import { vectorDb } from '../services/knowledge/vectorDBService';
import { cacheGetOrSet } from '../utils/memoryCache';
import { env } from '../config/env';
import { getInsightsStatusForUser } from '../services/user/insightsStatus';

let questions: Question[] = [];
let questionsLoadPromise: Promise<void> | null = null;
const inFlightUsers = new Set<string>();
let activeRequests = 0;
const MAX_ACTIVE_REQUESTS = process.env.PSYQA_LOAD_TEST === '1' ? 8 : 4;
const SLOW_REQUEST_MS = 15000;

interface UserServiceMetrics {
  userId: string;
  totalRequests: number;
  slowRequests: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  lastResponseTimeMs: number;
  lastRiskLevel: string;
  lastSeenAt: string;
}

const userMetrics = new Map<string, UserServiceMetrics>();

const updateUserMetrics = (
  userId: string,
  responseTimeMs: number,
  isFailure: boolean,
  riskLevel: string
) => {
  const current = userMetrics.get(userId) || {
    userId,
    totalRequests: 0,
    slowRequests: 0,
    failedRequests: 0,
    avgResponseTimeMs: 0,
    lastResponseTimeMs: 0,
    lastRiskLevel: 'unknown',
    lastSeenAt: new Date().toISOString()
  };

  const nextTotal = current.totalRequests + 1;
  const nextAvg =
    (current.avgResponseTimeMs * current.totalRequests + responseTimeMs) / nextTotal;

  userMetrics.set(userId, {
    ...current,
    totalRequests: nextTotal,
    slowRequests: current.slowRequests + (responseTimeMs >= SLOW_REQUEST_MS ? 1 : 0),
    failedRequests: current.failedRequests + (isFailure ? 1 : 0),
    avgResponseTimeMs: Math.round(nextAvg),
    lastResponseTimeMs: responseTimeMs,
    lastRiskLevel: riskLevel,
    lastSeenAt: new Date().toISOString()
  });
};

function validateAskRequest(
  req: AuthRequest,
  res: Response
): { userQuestion: string; description?: string; activeUserId: string } | null {
  const { question: userQuestion, description } = req.body;
  const normalizedUserId = resolveStudentUserId(req, res, req.body?.userId);
  if (!normalizedUserId) return null;

  if (!userQuestion) {
    res.status(400).json({ error: 'Question is required' });
    return null;
  }

  if (String(userQuestion).length > 1200) {
    res.status(400).json({ error: 'Question is too long (max 1200 characters)' });
    return null;
  }

  if (inFlightUsers.has(normalizedUserId)) {
    res.status(429).json({ error: '上一条消息还在处理中，请稍候再发送' });
    return null;
  }

  if (activeRequests >= MAX_ACTIVE_REQUESTS) {
    res.status(503).json({ error: '服务繁忙，请等待几秒后重试' });
    return null;
  }

  return { userQuestion: String(userQuestion), description, activeUserId: normalizedUserId };
}

async function recordAskSideEffects(
  activeUserId: string,
  userQuestion: string,
  result: CombinedAnswer,
  requestStart: number
): Promise<number> {
  const elapsedMs = result.responseTime ?? Date.now() - requestStart;
  const riskLevel = result.risk?.level ?? 'unknown';
  updateUserMetrics(activeUserId, elapsedMs, false, riskLevel);
  if (elapsedMs >= SLOW_REQUEST_MS) {
    console.warn(
      `Slow user request detected: user=${activeUserId}, duration=${elapsedMs}ms, risk=${riskLevel}`
    );
  }

  const account = activeUserId.startsWith('acc_') ? await getUserById(activeUserId) : null;
  if (result.emotion && result.problem && result.risk) {
    recordConsultationForSchool({
      orgId: account?.orgId || 'default',
      studentId: activeUserId,
      psych: {
        emotion: result.emotion.emotion,
        risk: result.risk.level,
        problem: result.problem.category,
        stressLevel: result.statModel?.indices?.stress?.value ?? 50
      }
    });
  }

  if (riskLevel === 'high' || riskLevel === 'critical') {
    recordRiskAlert({
      studentId: activeUserId,
      displayName: account?.displayName,
      orgId: account?.orgId,
      riskLevel,
      summary: result.summary || String(userQuestion).slice(0, 120),
      riskKeywords: result.risk?.keywords || [],
      dialogId: result.dialogId || `dlg_${Date.now()}`,
      dialogTime: new Date().toISOString()
    });
  }

  return elapsedMs;
}

function buildAskResponsePayload(
  userQuestion: string,
  description: string | undefined,
  result: CombinedAnswer,
  elapsedMs: number
) {
  return {
    question: userQuestion,
    description,
    knowledgeSources: result.knowledgeSources,
    similarQuestions: result.similarQuestions,
    answer: result.answer,
    summary: result.summary,
    emotion: result.emotion,
    risk: result.risk,
    problem: result.problem,
    emotionStyle: result.emotionStyle,
    intervention: result.intervention,
    carePlan: result.carePlan,
    analysisSources: result.analysisSources,
    llmUsed: result.llmUsed,
    reactUsed: result.reactUsed,
    reactTrace: result.reactTrace,
    report: result.report,
    statModel: result.statModel,
    responseTimeMs: elapsedMs,
    dialogId: result.dialogId,
    portrait: result.portrait,
    portraitPending: result.portrait?.summary?.includes('生成中') ?? false,
    reportPending: result.report?.includes('详细心理评估报告生成中') ?? false
  };
}

const ensureQuestionsLoaded = async (): Promise<void> => {
  if (questions.length > 0) return;

  if (!questionsLoadPromise) {
    questionsLoadPromise = loadQuestions()
      .then((data) => {
        questions = data;
        console.log(`Loaded ${questions.length} questions`);
      })
      .catch((error) => {
        console.error('Failed to load questions:', error);
        throw error;
      })
      .finally(() => {
        questionsLoadPromise = null;
      });
  }

  await questionsLoadPromise;
};

void ensureQuestionsLoaded();

export const getQuestions = async (req: Request, res: Response) => {
  await ensureQuestionsLoaded();
  const keyword = String(req.query.keyword || '');
  const category = String(req.query.category || '');
  const limit = Number(req.query.limit) || 10;
  const page = Number(req.query.page) || 1;

  let filteredQuestions = questions;

  if (keyword) {
    const kw = keyword.toLowerCase();
    filteredQuestions = filteredQuestions.filter(
      (q) =>
        q.question.toLowerCase().includes(kw) ||
        q.description.toLowerCase().includes(kw) ||
        q.keywords.toLowerCase().includes(kw)
    );
  }

  if (category) {
    filteredQuestions = filteredQuestions.filter((q) =>
      q.keywords.toLowerCase().includes(category.toLowerCase())
    );
  }

  const startIdx = (Number(page) - 1) * Number(limit);
  const endIdx = startIdx + Number(limit);

  res.json({
    total: filteredQuestions.length,
    questions: filteredQuestions.slice(startIdx, endIdx)
  });
};

export const getQuestionById = async (req: Request, res: Response) => {
  await ensureQuestionsLoaded();
  const id = Number(req.params.id);
  const question = questions.find((q) => q.questionID === id);

  if (!question) {
    return res.status(404).json({ error: 'Question not found' });
  }

  res.json(question);
};

export const askQuestion = async (req: AuthRequest, res: Response) => {
  const parsed = validateAskRequest(req, res);
  if (!parsed) return;
  const { userQuestion, description, activeUserId } = parsed;
  const requestStart = Date.now();

  try {
    inFlightUsers.add(activeUserId);
    activeRequests += 1;
    await ensureQuestionsLoaded();
    const similarQuestions = findSimilarQuestions(userQuestion, questions, 3, description);
    const result = await generateAIAnswer(
      userQuestion,
      description,
      similarQuestions,
      activeUserId
    );
    const elapsedMs = await recordAskSideEffects(activeUserId, userQuestion, result, requestStart);
    res.json(buildAskResponsePayload(userQuestion, description, result, elapsedMs));
  } catch (error) {
    const elapsedMs = Date.now() - requestStart;
    updateUserMetrics(activeUserId, elapsedMs, true, 'unknown');
    console.error('Error generating answer:', error);
    res.status(500).json({ error: '生成回复失败，请稍后重试' });
  } finally {
    inFlightUsers.delete(activeUserId);
    activeRequests = Math.max(activeRequests - 1, 0);
  }
};

export const askQuestionStream = async (req: AuthRequest, res: Response) => {
  const parsed = validateAskRequest(req, res);
  if (!parsed) return;
  const { userQuestion, description, activeUserId } = parsed;
  const requestStart = Date.now();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    inFlightUsers.add(activeUserId);
    activeRequests += 1;
    await ensureQuestionsLoaded();
    const similarQuestions = findSimilarQuestions(userQuestion, questions, 3, description);

    const result = await generateAIAnswer(userQuestion, description, similarQuestions, activeUserId, {
      onToken: (text) => sendEvent({ type: 'token', text })
    });

    const elapsedMs = await recordAskSideEffects(activeUserId, userQuestion, result, requestStart);
    sendEvent({
      type: 'done',
      ...buildAskResponsePayload(userQuestion, description, result, elapsedMs)
    });
    res.end();
  } catch (error) {
    const elapsedMs = Date.now() - requestStart;
    updateUserMetrics(activeUserId, elapsedMs, true, 'unknown');
    console.error('Error generating stream answer:', error);
    sendEvent({ type: 'error', error: '生成回复失败，请稍后重试' });
    res.end();
  } finally {
    inFlightUsers.delete(activeUserId);
    activeRequests = Math.max(activeRequests - 1, 0);
  }
};

export const getAllCategories = async (req: Request, res: Response) => {
  const categories = await cacheGetOrSet('categories:all', env.categoriesCacheTtlMs, async () => {
    await ensureQuestionsLoaded();
    return getCategories(questions);
  });
  res.json(categories);
};

export const getInsightsStatus = (req: AuthRequest, res: Response) => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json(getInsightsStatusForUser(userId));
};

export const getUserProgress = (req: AuthRequest, res: Response) => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const progress = getUserProgressData(userId);
  res.json(progress);
};

export const getUserProgressText = (req: AuthRequest, res: Response) => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const progressText = getProgressText(userId);
  res.json({ progress: progressText });
};

export const getGroupedHistory = (req: AuthRequest, res: Response) => {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const groups = getGroupedUserHistory(userId);
  res.json({ userId, groups });
};

export const clearUserHistoryData = async (req: AuthRequest, res: Response) => {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  clearUserHistory(userId);
  const { chromaDeleted } = await clearUserAgentMemory(userId);
  res.json({
    message: 'History cleared successfully',
    agentProfileCleared: true,
    chromaUserCollectionDeleted: chromaDeleted
  });
};

export const getSystemStats = async (req: Request, res: Response) => {
  await ensureQuestionsLoaded();
  const categories = getCategories(questions);
  const totalQuestions = questions.length;
  const totalCategories = categories.length;
  const totalQACount = categories.reduce((sum, cat) => sum + cat.count, 0);

  res.json({
    stats: {
      totalQuestions,
      totalCategories,
      totalQACount,
      knowledgeBaseCount: getKnowledgeBaseCount(),
      vectorDbCount: vectorDb.getDocumentCount(),
      emotionTypes: 12,
      problemCategories: 11
    },
    features: [
      {
        id: 'emotion_recognition',
        name: '情绪识别',
        description: '支持12种情绪类型实时识别，包括开心、低落、焦虑、愤怒、孤独等',
        icon: '🎭'
      },
      {
        id: 'crisis_warning',
        name: '危机预警',
        description: '智能检测自杀、自残等高危关键词，自动触发干预机制',
        icon: '⚠️'
      },
      {
        id: 'rag_search',
        name: 'RAG检索',
        description: '基于22341条专业心理知识库，提供精准知识支持',
        icon: '🔍'
      },
      {
        id: 'trend_tracking',
        name: '趋势追踪',
        description: '可视化展示压力值、焦虑值、情绪平稳度变化趋势',
        icon: '📊'
      },
      {
        id: 'report_generation',
        name: '报告生成',
        description: '自动生成专业心理咨询报告，支持导出分析',
        icon: '📝'
      },
      {
        id: 'multi_user',
        name: '多用户支持',
        description: '支持多用户独立会话记录，保护个人隐私',
        icon: '👥'
      }
    ],
    modelInfo: {
      name: 'GLM-4-Flash',
      provider: 'Zhipu',
      quantization: 'cloud',
      features: ['RAG增强', '情绪感知', '上下文理解', '多轮对话']
    }
  });
};
