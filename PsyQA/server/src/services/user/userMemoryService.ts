import {
  ensureUserAgentProfile,
  getFirstDialogTime,
  getUserAgentProfile,
  countUserDialogVectors,
  recordDialogVectorMeta,
  updateUserAgentProfile
} from '../../db/userAgentStore';
import { getCategoryName, ProblemCategory } from '../psych/emotionService';
import { labelFramework } from '../psych/interventionService';
import { getUserPsychSnapshots } from '../common/historyManager';
import type { PsychSnapshot } from '../../types/psychHistory';
import type { RagBlendWeights, AgentPhase } from '../../types/userAgent';
import type { SearchResult } from '../knowledge/vectorDBService';
import {
  isQdrantEnabled,
  searchUserQdrant,
  upsertUserQdrantDialog,
  deleteUserQdrantMemory,
  deleteUserQdrantVectors,
  getUserQdrantCollectionName
} from '../knowledge/qdrantVectorService';
import { embedText } from '../knowledge/embeddingService';
import { embedMultiLocal } from '../knowledge/localBgeClient';
import { cacheGetOrSet } from '../../utils/memoryCache';
import { getLockedMemoryBoost, isMemoryArchived } from './memoryTagService';
import {
  PHASE_LABELS,
  computeTimelineUserWeight,
  computeMemoryBoost,
  resolvePhaseFromMonths,
  roundWeight,
  MAX_USER_RAG_WEIGHT
} from './ragWeightPolicy';

const PHASE_WEIGHTS: Record<AgentPhase, { label: string }> = {
  collect: { label: PHASE_LABELS.collect },
  shape: { label: PHASE_LABELS.shape },
  mature: { label: PHASE_LABELS.mature }
};

function parseDialogMonth(dialogTime: string): string {
  const d = new Date(dialogTime.replace(/\//g, '-'));
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 7);
}

function monthsBetween(fromIso: string, to = new Date()): number {
  const start = new Date(fromIso);
  if (Number.isNaN(start.getTime())) return 0;
  return (
    (to.getFullYear() - start.getFullYear()) * 12 + (to.getMonth() - start.getMonth())
  );
}

export function resolveAgentPhase(userId: string): AgentPhase {
  return resolvePhaseFromMonths(resolveMonthsElapsed(userId));
}

export function resolveMonthsElapsed(userId: string): number {
  const profile = getUserAgentProfile(userId);
  const first = profile?.firstDialogAt || getFirstDialogTime(userId);
  if (!first) return 0;
  return monthsBetween(first);
}

export { computeTimelineUserWeight, computeMemoryBoost } from './ragWeightPolicy';

export function getRagBlendWeights(userId: string): RagBlendWeights {
  const phase = resolveAgentPhase(userId);
  const w = PHASE_WEIGHTS[phase];
  const monthsElapsed = resolveMonthsElapsed(userId);
  const memoryCount = countUserDialogVectors(userId);
  const timelineUser = computeTimelineUserWeight(monthsElapsed);
  const memoryBoost = computeMemoryBoost(memoryCount);
  const user = roundWeight(Math.min(MAX_USER_RAG_WEIGHT, timelineUser + memoryBoost));
  const pub = roundWeight(1 - user);

  return {
    user,
    public: pub,
    phase,
    label: w.label,
    monthsElapsed,
    memoryCount,
    timelineUser,
    memoryBoost
  };
}

function monthsSinceDialog(dialogTime?: string): number {
  if (!dialogTime) return 0;
  const d = new Date(dialogTime.replace(/\//g, '-'));
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function applyMemoryTimeDecay(hit: SearchResult): SearchResult {
  const months = monthsSinceDialog(hit.dialogTime);
  if (months >= 12) return { ...hit, similarity: hit.similarity * 0.72 };
  if (months >= 6) return { ...hit, similarity: hit.similarity * 0.85 };
  return hit;
}

export async function searchBlendedUserMemory(
  userId: string,
  query: string,
  totalK = 5
): Promise<SearchResult[]> {
  const cacheKey = `mem:${userId}:${totalK}:${query.slice(0, 200)}`;
  return cacheGetOrSet(cacheKey, 120_000, () => searchBlendedUserMemoryUncached(userId, query, totalK));
}

async function searchPublicKnowledge(query: string, topK: number): Promise<SearchResult[]> {
  const { searchVectorDb } = await import('../knowledge/vectorDBService');
  return searchVectorDb(query, topK);
}

async function searchBlendedUserMemoryUncached(
  userId: string,
  query: string,
  totalK = 5
): Promise<SearchResult[]> {
  if (!isQdrantEnabled() || !userId || userId === 'default_user') {
    return searchPublicKnowledge(query, totalK);
  }

  const { user, public: pubW, phase } = getRagBlendWeights(userId);
  const userK = Math.max(1, Math.round(totalK * user));
  const pubK = Math.max(1, totalK - userK);

  const [userHitsRaw, pubHits] = await Promise.all([
    searchUserQdrant(userId, query, userK),
    searchPublicKnowledge(query, pubK)
  ]);

  const userHits = userHitsRaw.filter(
    (h) => !h.dialogTime || !isMemoryArchived(userId, h.dialogTime)
  );

  const blend = (hits: SearchResult[], weight: number, source: 'user' | 'public') =>
    hits.map((h) => {
      let sim = h.similarity * weight;
      if (source === 'user' && h.dialogTime) {
        sim *= getLockedMemoryBoost(userId, h.dialogTime);
      }
      return applyMemoryTimeDecay({ ...h, source, similarity: sim });
    });

  const merged = [...blend(userHits, user, 'user'), ...blend(pubHits, pubW, 'public')].sort(
    (a, b) => b.similarity - a.similarity
  );

  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const item of merged) {
    const key = item.question.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= totalK) break;
  }

  if (out.length === 0 && phase === 'collect') {
    return searchPublicKnowledge(query, totalK);
  }
  return out;
}

/** 只检索该用户自己的对话，不混入公共知识库。 */
export async function searchPersonalMemories(
  userId: string,
  query: string,
  limit = 4
): Promise<SearchResult[]> {
  if (!isQdrantEnabled() || !userId || userId === 'default_user' || limit <= 0 || !query.trim()) {
    return [];
  }
  const cacheKey = `pmem:${userId}:${limit}:${query.slice(0, 200)}`;
  return cacheGetOrSet(cacheKey, 30_000, async () => {
    const raw = await searchUserQdrant(userId, query, Math.max(limit, 6));
    return raw
      .filter((hit) => !hit.dialogTime || !isMemoryArchived(userId, hit.dialogTime))
      .map((hit) => {
        const boosted = hit.dialogTime
          ? hit.similarity * getLockedMemoryBoost(userId, hit.dialogTime)
          : hit.similarity;
        return applyMemoryTimeDecay({ ...hit, source: 'user' as const, similarity: boosted });
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  });
}

function memoryUserLine(hit: SearchResult): string {
  const fromQuestion = hit.question.replace(/\s+/g, ' ').trim();
  if (fromQuestion) return fromQuestion.slice(0, 180);
  const matched = hit.answer.match(/用户：([\s\S]*?)(?:\n助理：|$)/);
  return (matched?.[1] || hit.answer).replace(/\s+/g, ' ').trim().slice(0, 180);
}

function memoryReplyLine(hit: SearchResult): string {
  const matched = hit.answer.match(/助理：([\s\S]*)/);
  return (matched?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

/** 给回答模型的个人记忆。与最近两轮原话重复的条目会去掉。 */
export function formatPersonalMemories(hits: SearchResult[], recentDialogs = ''): string {
  const recentSnips = [...recentDialogs.matchAll(/用户：([^\n]{8,40})/g)].map((match) => match[1].trim());
  const picked = hits
    .filter((hit) => hit.source !== 'public')
    .filter((hit) => {
      const line = memoryUserLine(hit);
      if (line.length < 8) return false;
      return !recentSnips.some((snip) => line.includes(snip) || snip.includes(line.slice(0, 24)));
    })
    .slice(0, 4);
  if (!picked.length) return '';

  const lines = picked.map((hit, index) => {
    const tags = [hit.dialogTime, hit.emotion, hit.trigger].filter(Boolean).join(' · ');
    const reply = memoryReplyLine(hit);
    return [
      `${index + 1}. ${tags || '更早的对话'}`,
      `用户当时说：${memoryUserLine(hit)}`,
      reply ? `当时的回应：${reply}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  });

  return [
    '这些是这个用户自己以前说过的事，不是公共帖子。回答时自然用上里面的人、反复出现的压力、上次有用的做法，让对方感到被记住。不要逐条复述，也不要编造这里没有的事实。',
    ...lines
  ].join('\n');
}

/** 每轮回答后写入，永久保留用过的方法。 */
export function rememberTurnExperience(input: {
  userId: string;
  dialogTime: string;
  problem: string;
  emotion: string;
  framework: string;
}): void {
  const { userId, dialogTime, problem, emotion, framework } = input;
  if (!userId || userId === 'default_user' || !dialogTime || !framework) return;
  const profile = ensureUserAgentProfile(userId);
  const current = profile.interventionJson ?? {
    effectiveApproaches: [],
    avoidPhrases: [],
    sensitiveTopics: []
  };
  const history = [...(current.executionHistory ?? [])];
  if (history.some((item) => item.time === dialogTime)) return;
  history.push({ time: dialogTime, problem, emotion, framework });
  updateUserAgentProfile(userId, {
    interventionJson: { ...current, executionHistory: history.slice(-24) }
  });
}

/** 长期结构化记忆：沟通习惯、反复议题、以往用过的方法。 */
export function formatDurableMemory(userId: string): string {
  if (!userId || userId === 'default_user') return '';
  const profile = getUserAgentProfile(userId);
  const iv = profile?.interventionJson;
  const lines: string[] = [];
  if (iv?.preferredTone) lines.push(`沟通习惯：${iv.preferredTone}`);
  if (iv?.sensitiveTopics?.length) lines.push(`需要避开：${iv.sensitiveTopics.join('、')}`);
  if (iv?.effectiveApproaches?.length) {
    lines.push(`以前觉得有用的方式：${iv.effectiveApproaches.join('、')}`);
  }

  const counts = new Map<string, number>();
  const methods: string[] = [];
  const pushMethod = (name: string) => {
    if (name && !methods.includes(name)) methods.push(name);
  };
  for (const snap of getUserPsychSnapshots(userId)) {
    const problem = getCategoryName(snap.problem);
    counts.set(problem, (counts.get(problem) ?? 0) + 1);
    pushMethod(labelFramework(snap.frameworkId));
  }
  for (const item of iv?.executionHistory ?? []) {
    if (!counts.has(item.problem)) counts.set(item.problem, 1);
    pushMethod(item.framework);
  }

  const habits = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} ${count} 次`);
  if (habits.length) lines.push(`反复出现的议题：${habits.join('、')}`);
  if (methods.length) lines.push(`以往用过的方法：${methods.slice(-6).join('、')}`);

  const monthly = profile?.monthlySummariesJson.slice(-1)[0]?.summary;
  if (monthly) lines.push(`长期特征：${monthly.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  return lines.join('\n');
}

export function buildAgentPromptContext(userId: string): string {
  if (!userId || userId === 'default_user') return '';

  const profile = ensureUserAgentProfile(userId);
  const phase = resolveAgentPhase(userId);
  const weights = getRagBlendWeights(userId);
  const parts: string[] = [`【专属用户档案 · ${PHASE_WEIGHTS[phase].label}】`];

  if (profile.basicJson) {
    const b = profile.basicJson;
    const basicLine = [
      b.age !== undefined ? `年龄：${b.age}` : '',
      b.occupation ? `职业：${b.occupation}` : '',
      b.familyBackground ? `原生家庭：${b.familyBackground}` : '',
      b.majorLifeEvents?.length ? `重大经历：${b.majorLifeEvents.join('、')}` : ''
    ]
      .filter(Boolean)
      .join('｜');
    if (basicLine) parts.push(basicLine);
  }

  if (profile.interventionJson) {
    const iv = profile.interventionJson;
    if (iv.preferredTone) parts.push(`沟通偏好：${iv.preferredTone}`);
    if (iv.sensitiveTopics?.length) parts.push(`敏感话题（避开）：${iv.sensitiveTopics.join('、')}`);
    if (iv.avoidPhrases?.length) parts.push(`避雷话术：${iv.avoidPhrases.join('、')}`);
    if (iv.effectiveApproaches?.length) {
      parts.push(`有效疏导方式：${iv.effectiveApproaches.join('、')}`);
    }
  }

  const latestMonthly = profile.monthlySummariesJson.slice(-1)[0];
  if (latestMonthly?.summary) {
    parts.push(`近月心理特征：${latestMonthly.summary}`);
  }

  if (profile.agentSystemPrompt?.trim()) {
    parts.push(`【专属Agent人设】\n${profile.agentSystemPrompt.trim()}`);
  }

  parts.push(
    `【RAG权重 · 动态】用户私有记忆 ${Math.round(weights.user * 100)}%（时间轴 ${Math.round(weights.timelineUser * 100)}%` +
      `${weights.memoryBoost > 0 ? ` + 记忆加成 ${Math.round(weights.memoryBoost * 100)}%` : ''}）` +
      ` + 公共知识库 ${Math.round(weights.public * 100)}% · 已沉淀 ${weights.memoryCount} 条`
  );

  return parts.join('\n');
}

export async function indexUserDialogMemory(input: {
  userId: string;
  dialogTime: string;
  userText: string;
  botText: string;
  psych?: PsychSnapshot;
}): Promise<boolean> {
  const { userId, dialogTime, userText, botText, psych } = input;
  if (!userId || userId === 'default_user') return false;

  const first = getFirstDialogTime(userId);
  if (!first) {
    updateUserAgentProfile(userId, { firstDialogAt: dialogTime });
  }

  const phase = resolveAgentPhase(userId);
  updateUserAgentProfile(userId, { agentPhase: phase });

  if (!isQdrantEnabled()) return false;

  const month = parseDialogMonth(dialogTime);
  const emotion = psych?.emotion ?? 'neutral';
  const trigger = psych?.problem
    ? getCategoryName(psych.problem as ProblemCategory)
    : 'general';
  const tag = `${emotion}_${trigger}`;
  const content = `用户：${userText}\n助理：${botText}`;
  const chromaId = `${userId}_${dialogTime.replace(/[^\d]/g, '')}`;

  const localDense = await embedMultiLocal(content, 8);
  const embedding = localDense?.dense?.length ? localDense.dense : await embedText(content);
  if (!embedding) return false;

  const ok = await upsertUserQdrantDialog(userId, {
    id: chromaId,
    content,
    embedding,
    metadata: {
      month,
      emotion,
      trigger,
      tag,
      dialogTime,
      userPreview: userText.slice(0, 120)
    }
  });

  if (ok) {
    recordDialogVectorMeta({
      userId,
      dialogTime,
      chromaId,
      collectionName: getUserQdrantCollectionName(),
      month,
      emotion,
      triggerTag: tag,
      contentPreview: userText
    });
    const { upsertMemoryMeta } = await import('./memoryTagService');
    upsertMemoryMeta(userId, dialogTime, {
      content: userText,
      problem: psych?.problem
    });
  }
  return ok;
}

const DIALOG_INDEX_DELAY_MS = 8_000;
let answerInProgress = 0;
let indexTimer: ReturnType<typeof setTimeout> | null = null;
let indexing = false;
const pendingDialogs: Array<Parameters<typeof indexUserDialogMemory>[0]> = [];
const pendingDialogKeys = new Set<string>();

/** 回答生成期间暂停写入，避免和检索抢本机 bge-m3。 */
export function setDialogIndexPaused(paused: boolean): void {
  answerInProgress += paused ? 1 : -1;
  if (answerInProgress < 0) answerInProgress = 0;
  if (answerInProgress > 0) {
    if (indexTimer) {
      clearTimeout(indexTimer);
      indexTimer = null;
    }
    return;
  }
  armDialogIndex();
}

/** 先记下对话，等回答结束并空闲几秒后再写入 Qdrant。 */
export function scheduleUserDialogIndex(input: Parameters<typeof indexUserDialogMemory>[0]): void {
  if (!input.userId || input.userId === 'default_user') return;
  const key = `${input.userId}:${input.dialogTime}`;
  if (pendingDialogKeys.has(key)) return;
  pendingDialogKeys.add(key);
  pendingDialogs.push(input);
  armDialogIndex();
}

function armDialogIndex(): void {
  if (indexTimer || indexing || answerInProgress > 0 || pendingDialogs.length === 0) return;
  indexTimer = setTimeout(() => {
    indexTimer = null;
    void drainDialogIndex();
  }, DIALOG_INDEX_DELAY_MS);
  indexTimer.unref?.();
}

async function drainDialogIndex(): Promise<void> {
  if (indexing || answerInProgress > 0) return;
  indexing = true;
  try {
    while (pendingDialogs.length > 0 && answerInProgress === 0) {
      const job = pendingDialogs.shift()!;
      pendingDialogKeys.delete(`${job.userId}:${job.dialogTime}`);
      try {
        await indexUserDialogMemory(job);
      } catch (err) {
        console.warn('[memory] delayed dialog index failed:', err instanceof Error ? err.message : err);
      }
    }
  } finally {
    indexing = false;
    if (pendingDialogs.length > 0) armDialogIndex();
  }
}

/** 清空用户专属 Agent 数据（SQLite 画像 + 向量元数据 + Qdrant 用户记忆） */
export async function clearUserAgentMemory(userId: string): Promise<{ chromaDeleted: boolean }> {
  const { clearUserAgentData } = await import('../../db/userAgentStore');
  clearUserAgentData(userId);
  const chromaDeleted = await deleteUserQdrantMemory(userId);
  return { chromaDeleted };
}

export function listUserDialogMemories(userId: string) {
  const { listUserDialogVectorMeta } = require('../../db/userAgentStore') as typeof import('../../db/userAgentStore');
  const { listMemoryMeta } = require('./memoryTagService') as typeof import('./memoryTagService');
  const rows = listUserDialogVectorMeta(userId);
  const metaMap = new Map(listMemoryMeta(userId).map((m) => [m.dialogTime, m]));
  return rows.map((r) => {
    const meta = metaMap.get(r.dialogTime);
    return {
      ...r,
      tags: meta?.tags || [],
      locked: meta?.locked || false,
      archived: meta?.archived || false
    };
  });
}

export async function deleteUserDialogMemory(
  userId: string,
  dialogTime: string
): Promise<{ deleted: boolean; chromaDeleted: boolean }> {
  const { listUserDialogVectorMeta, deleteUserDialogVectorMeta } =
    await import('../../db/userAgentStore');
  const rows = listUserDialogVectorMeta(userId);
  const row = rows.find((r) => r.dialogTime === dialogTime);
  let chromaDeleted = false;
  if (row?.chromaId) {
    chromaDeleted = await deleteUserQdrantVectors(userId, [row.chromaId]);
  }
  const deleted = deleteUserDialogVectorMeta(userId, dialogTime);
  return { deleted, chromaDeleted };
}

/** 导出专属 Agent 配置包（JSON，不含向量本体） */
export function buildAgentExportBundle(userId: string) {
  const profile = ensureUserAgentProfile(userId);
  const weights = getRagBlendWeights(userId);
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    userId,
    phase: weights.phase,
    ragWeights: weights,
    chromaCollection: getUserQdrantCollectionName(),
    profile: {
      basicJson: profile.basicJson,
      emotionTimelineJson: profile.emotionTimelineJson,
      interventionJson: profile.interventionJson,
      agentSystemPrompt: profile.agentSystemPrompt,
      firstDialogAt: profile.firstDialogAt,
      monthlySummariesJson: profile.monthlySummariesJson,
      annualReportsJson: profile.annualReportsJson,
      updatedAt: profile.updatedAt
    },
    note: '向量嵌入存储于 Qdrant 用户记忆集合，完整迁移需同时备份该 collection'
  };
}
