import * as fs from 'fs';
import {
  buildRetrievalQuery,
  computeTextRelevance,
  extractChineseNGrams,
  preprocessText
} from '../../utils/textProcessor';
import { EmotionType, ProblemCategory, PROBLEM_KEYWORDS } from '../psych/emotionService';
import { scoreKeywordMatches } from '../../utils/psychTextAnalysis';
import { resolveDataFile } from '../../config/paths';
import { SearchResult } from './searchTypes';
import { cacheGet, cacheSet } from '../../utils/memoryCache';
import { applySeasonalScoreMultiplier } from './seasonalRagPolicy';

export interface KnowledgeTags {
  problems: ProblemCategory[];
  emotions: EmotionType[];
  interventionTypes: string[];
}

export interface KnowledgeItem {
  question: string;
  answer: string;
  tags?: KnowledgeTags;
  relevance?: number;
}

let knowledgeBase: KnowledgeItem[] = [];

const MIN_KNOWLEDGE_SCORE = 3;
const MIN_RELATIVE_RATIO = 0.5;
const RAG_CACHE_TTL_MS = 120_000;

function ragCacheKey(
  query: string,
  topK: number,
  problemCategory?: ProblemCategory,
  emotion?: EmotionType
): string {
  return `rag:${topK}:${problemCategory ?? ''}:${emotion ?? ''}:${query.slice(0, 200)}`;
}

function retrieveKnowledgeUncached(
  query: string,
  topK: number,
  problemCategory?: ProblemCategory,
  emotion?: EmotionType
): KnowledgeItem[] {
  if (knowledgeBase.length === 0) return [];

  const scoredItems = knowledgeBase.map((item) => ({
    ...item,
    score: scoreKnowledgeItem(query, item, { problemCategory, emotion })
  }));

  const filtered = filterByRelativeScore(scoredItems, MIN_KNOWLEDGE_SCORE);

  return filtered.slice(0, topK).map(({ score, ...item }) => ({
    ...item,
    relevance: score
  }));
}

const resolveKnowledgePath = (): string => resolveDataFile('mental_dataset.json');

export const getKnowledgeBaseCount = (): number => knowledgeBase.length;

/** 按问题领域定向检索 */
export function retrieveKnowledgeByCategory(
  query: string,
  topK: number,
  category: ProblemCategory,
  emotion?: EmotionType
): KnowledgeItem[] {
  return retrieveKnowledgeUncached(query, topK * 3, category, emotion)
    .filter((item) => !item.tags?.problems?.length || item.tags.problems.includes(category))
    .slice(0, topK);
}

export const reloadKnowledgeBase = (): void => {
  loadKnowledgeBase();
};

export const loadKnowledgeBase = (): void => {
  const dataPath = resolveKnowledgePath();

  try {
    const content = fs.readFileSync(dataPath, 'utf-8');
    const dataset = JSON.parse(content);

    knowledgeBase = (dataset.knowledge || []) as KnowledgeItem[];

    console.log(`Loaded ${knowledgeBase.length} knowledge items (tagged: ${knowledgeBase.filter((k) => k.tags).length})`);
  } catch (error) {
    console.error('Error loading knowledge base:', error);
  }
};

function tagBoost(
  item: KnowledgeItem,
  problemCategory?: ProblemCategory,
  emotion?: EmotionType
): number {
  let boost = 0;
  if (!item.tags) return boost;
  if (problemCategory && problemCategory !== 'other' && item.tags.problems.includes(problemCategory)) {
    boost += 2.5;
  }
  if (emotion && emotion !== 'neutral' && item.tags.emotions.includes(emotion)) {
    boost += 1.5;
  }
  return boost;
}

export function scoreKnowledgeItem(
  query: string,
  item: KnowledgeItem,
  options?: {
    problemCategory?: ProblemCategory;
    emotion?: EmotionType;
    vectorSimilarity?: number;
  }
): number {
  let score = computeTextRelevance(query, item.question, item.answer);

  if (options?.problemCategory && options.problemCategory !== 'other') {
    const { score: catScore } = scoreKeywordMatches(
      preprocessText(`${item.question} ${item.answer}`),
      PROBLEM_KEYWORDS[options.problemCategory] || []
    );
    score += catScore * 0.8;
  }

  score += tagBoost(item, options?.problemCategory, options?.emotion);

  if (options?.vectorSimilarity) {
    score += options.vectorSimilarity * 5;
  }

  score = applySeasonalScoreMultiplier(
    score,
    item.tags?.problems,
    item.tags?.emotions,
    options?.problemCategory,
    options?.emotion
  );

  return score;
}

function filterByRelativeScore<T extends { score: number }>(items: T[], minAbsolute: number): T[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;
  const minScore = Math.max(minAbsolute, topScore * MIN_RELATIVE_RATIO);
  return sorted.filter((item) => item.score >= minScore);
}

export const retrieveKnowledge = (
  query: string,
  topK: number = 3,
  problemCategory?: ProblemCategory,
  emotion?: EmotionType
): KnowledgeItem[] => {
  const key = ragCacheKey(query, topK, problemCategory, emotion);
  const cached = cacheGet<KnowledgeItem[]>(key);
  if (cached) return cached;

  const result = retrieveKnowledgeUncached(query, topK, problemCategory, emotion);
  cacheSet(key, result, RAG_CACHE_TTL_MS);
  return result;
};

export function mergeRankedReferences(
  query: string,
  retrievedKnowledge: KnowledgeItem[],
  vectorResults: SearchResult[],
  problemCategory?: ProblemCategory,
  emotion?: EmotionType,
  topK: number = 3
): KnowledgeItem[] {
  const merged = new Map<string, KnowledgeItem & { score: number }>();

  for (const item of retrievedKnowledge) {
    const score = item.relevance ?? scoreKnowledgeItem(query, item, { problemCategory, emotion });
    const existing = merged.get(item.question);
    if (!existing || score > existing.score) {
      merged.set(item.question, { ...item, score });
    }
  }

  for (const result of vectorResults) {
    const item: KnowledgeItem = { question: result.question, answer: result.answer };
    const score = scoreKnowledgeItem(query, item, {
      problemCategory,
      emotion,
      vectorSimilarity: result.similarity
    });
    const existing = merged.get(item.question);
    if (!existing || score > existing.score) {
      merged.set(item.question, { ...item, score });
    }
  }

  const ranked = filterByRelativeScore(Array.from(merged.values()), MIN_KNOWLEDGE_SCORE);

  return ranked.slice(0, topK).map(({ score, ...item }) => ({
    ...item,
    relevance: score
  }));
}

const RRF_K = 60;

/** Reciprocal Rank Fusion：合并 TF-IDF/向量两路排序 */
export function mergeRankedReferencesRRF(
  query: string,
  retrievedKnowledge: KnowledgeItem[],
  vectorResults: SearchResult[],
  problemCategory?: ProblemCategory,
  emotion?: EmotionType,
  topK: number = 3
): KnowledgeItem[] {
  const scores = new Map<string, { item: KnowledgeItem; score: number }>();

  retrievedKnowledge.forEach((item, rank) => {
    const key = item.question.slice(0, 80);
    const rrf = 1 / (RRF_K + rank + 1);
    const textScore = (item.relevance ?? scoreKnowledgeItem(query, item, { problemCategory, emotion })) / 100;
    const prev = scores.get(key);
    const total = (prev?.score ?? 0) + rrf + textScore * 0.15;
    scores.set(key, { item: { ...item, relevance: item.relevance }, score: total });
  });

  vectorResults.forEach((result, rank) => {
    const item: KnowledgeItem = { question: result.question, answer: result.answer };
    const key = item.question.slice(0, 80);
    const rrf = 1 / (RRF_K + rank + 1);
    const vecBoost = result.similarity * 0.25;
    const prev = scores.get(key);
    const total = (prev?.score ?? 0) + rrf + vecBoost;
    scores.set(key, { item, score: total });
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ item, score }) => ({ ...item, relevance: score * 100 }));
}

export const generateRAGAnswer = (
  question: string,
  retrievedKnowledge: KnowledgeItem[]
): string => {
  if (retrievedKnowledge.length === 0) {
    return generateDefaultAnswer(question);
  }

  const knowledgeText = retrievedKnowledge
    .map((k, i) => `${i + 1}. ${k.answer}`)
    .join('\n\n');

  return `
根据专业心理知识库，我为您提供以下建议：

${knowledgeText}

针对您的问题"${question}"，希望这些建议对您有所帮助。记住，寻求帮助是勇敢的表现。
  `.trim();
};

function generateDefaultAnswer(question: string): string {
  return `
感谢您的信任。关于"${question}"，我建议您：

1. 首先接纳自己的感受，这是正常的
2. 尝试与信任的人分享您的困扰
3. 如果情况持续，可以寻求学校心理咨询中心的帮助

您并不孤单，很多人都经历过类似的困扰。
  `.trim();
}

loadKnowledgeBase();
