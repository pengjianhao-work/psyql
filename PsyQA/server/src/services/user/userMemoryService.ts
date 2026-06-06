import {
  ensureUserAgentProfile,
  getFirstDialogTime,
  getUserAgentProfile,
  countUserDialogVectors,
  recordDialogVectorMeta,
  updateUserAgentProfile
} from '../../db/userAgentStore';
import { getCategoryName, ProblemCategory } from '../psych/emotionService';
import type { PsychSnapshot } from '../../types/psychHistory';
import type { RagBlendWeights, AgentPhase } from '../../types/userAgent';
import type { SearchResult } from '../knowledge/vectorDBService';
import {
  isChromaEnabled,
  searchUserChromaCollection,
  searchPublicChromaCollection,
  upsertUserDialogVector,
  deleteUserChromaCollection,
  getUserChromaCollectionName
} from '../knowledge/chromaVectorService';
import { embedText } from '../knowledge/embeddingService';
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
  if (!isChromaEnabled() || !userId || userId === 'default_user') {
    const pub = await searchPublicChromaCollection(query, totalK);
    return pub;
  }

  const { user, public: pubW, phase } = getRagBlendWeights(userId);
  const userK = Math.max(1, Math.round(totalK * user));
  const pubK = Math.max(1, totalK - userK);

  const [userHits, pubHits] = await Promise.all([
    searchUserChromaCollection(userId, query, userK),
    searchPublicChromaCollection(query, pubK)
  ]);

  const blend = (hits: SearchResult[], weight: number, source: 'user' | 'public') =>
    hits.map((h) => applyMemoryTimeDecay({ ...h, source, similarity: h.similarity * weight }));

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
    return searchPublicChromaCollection(query, totalK);
  }
  return out;
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
}): Promise<void> {
  const { userId, dialogTime, userText, botText, psych } = input;
  if (!userId || userId === 'default_user') return;

  const first = getFirstDialogTime(userId);
  if (!first) {
    updateUserAgentProfile(userId, { firstDialogAt: dialogTime });
  }

  const phase = resolveAgentPhase(userId);
  updateUserAgentProfile(userId, { agentPhase: phase });

  if (!isChromaEnabled()) return;

  const month = parseDialogMonth(dialogTime);
  const emotion = psych?.emotion ?? 'neutral';
  const trigger = psych?.problem
    ? getCategoryName(psych.problem as ProblemCategory)
    : 'general';
  const tag = `${emotion}_${trigger}`;
  const content = `用户：${userText}\n助理：${botText}`;
  const chromaId = `${userId}_${dialogTime.replace(/[^\d]/g, '')}`;

  const embedding = await embedText(content);
  if (!embedding) return;

  const ok = await upsertUserDialogVector(userId, {
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
      collectionName: getUserChromaCollectionName(userId),
      month,
      emotion,
      triggerTag: tag,
      contentPreview: userText
    });
  }
}

/** 清空用户专属 Agent 数据（SQLite 画像 + 向量元数据 + Chroma 用户集合） */
export async function clearUserAgentMemory(userId: string): Promise<{ chromaDeleted: boolean }> {
  const { clearUserAgentData } = await import('../../db/userAgentStore');
  clearUserAgentData(userId);
  const chromaDeleted = await deleteUserChromaCollection(userId);
  return { chromaDeleted };
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
    chromaCollection: getUserChromaCollectionName(userId),
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
    note: '向量嵌入存储于 Chroma 用户集合，完整迁移需同时备份该 collection'
  };
}
