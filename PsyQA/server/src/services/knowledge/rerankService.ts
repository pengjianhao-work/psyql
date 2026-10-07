import axios from 'axios';
import { getZhipuApiKey, getZhipuBaseUrl } from '../llm/zhipuClient';
import type { SearchResult } from './searchTypes';

const DEFAULT_RERANK_MODEL = 'Qwen/Qwen3-Reranker-8B';
const DEFAULT_RERANK_INSTRUCTION =
  'Retrieve the counseling post whose question best matches the student query.';
let announcedModel: string | null = null;
const CRISIS_TERMS = /想死|自杀|轻生|不想活|结束生命|割腕|去死/;

export interface RerankScore {
  index: number;
  score: number;
}

export function isRerankEnabled(): boolean {
  const flag = (process.env.PSYQA_RERANK_ENABLED || '1').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  return Boolean(getZhipuApiKey());
}

export function rerankModelName(): string {
  return (process.env.SILICONFLOW_RERANK_MODEL || DEFAULT_RERANK_MODEL).trim();
}

/** 把重排分数填回候选。接口没覆盖到的条目保持原顺序，排在已打分条目后面。 */
export function orderByRerankScores(
  items: SearchResult[],
  ranked: RerankScore[],
  topK: number
): SearchResult[] {
  if (topK <= 0) return [];
  const used = new Set<number>();
  const ordered: SearchResult[] = [];
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  for (const row of sorted) {
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= items.length || used.has(row.index)) {
      continue;
    }
    used.add(row.index);
    ordered.push({ ...items[row.index], similarity: toUnitScore(row.score) });
    if (ordered.length >= topK) return ordered;
  }
  for (let index = 0; index < items.length && ordered.length < topK; index++) {
    if (!used.has(index)) ordered.push(items[index]);
  }
  return ordered;
}

/** 用户没提到自伤时，把标题里带危机词的帖子排到普通相关帖子后面。 */
export function demoteUnrequestedCrisis(query: string, items: SearchResult[]): SearchResult[] {
  if (CRISIS_TERMS.test(query)) return items;
  const ordinary: SearchResult[] = [];
  const severe: SearchResult[] = [];
  for (const item of items) {
    if (CRISIS_TERMS.test(item.question)) severe.push({ ...item, similarity: item.similarity * 0.25 });
    else ordinary.push(item);
  }
  return [...ordinary, ...severe];
}

function toUnitScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score >= 0 && score <= 1) return score;
  return 1 / (1 + Math.exp(-score));
}

function passage(item: SearchResult): string {
  const answer = item.answer.replace(/\s+/g, ' ').trim().slice(0, 480);
  return `${item.question}\n${answer}`.trim();
}

export async function rerankResults(
  query: string,
  items: SearchResult[],
  topK: number
): Promise<SearchResult[]> {
  if (topK <= 0) return [];
  if (items.length <= 1 || !isRerankEnabled()) return demoteUnrequestedCrisis(query, items).slice(0, topK);

  const documents = items.map(passage);
  const key = getZhipuApiKey();
  if (!key) return items.slice(0, topK);

  const model = rerankModelName();
  if (announcedModel !== model) {
    announcedModel = model;
    console.log(`[rerank] 使用 ${model}`);
  }
  const body: Record<string, unknown> = {
    model,
    query: query.slice(0, 500),
    documents,
    top_n: documents.length,
    return_documents: false
  };
  if (model.toLowerCase().includes('qwen3-reranker')) {
    body.instruction = (process.env.SILICONFLOW_RERANK_INSTRUCTION || DEFAULT_RERANK_INSTRUCTION).trim();
  }

  try {
    const { data } = await axios.post(
      `${getZhipuBaseUrl()}/rerank`,
      body,
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 20_000
      }
    );
    const results = (data?.results ?? data?.data ?? []) as Array<{
      index?: number;
      relevance_score?: number;
      score?: number;
    }>;
    const ranked = results
      .map((row) => ({
        index: Number(row.index),
        score: Number(row.relevance_score ?? row.score)
      }))
      .filter((row) => Number.isFinite(row.score));
    if (!ranked.length) return demoteUnrequestedCrisis(query, items).slice(0, topK);
    return demoteUnrequestedCrisis(query, orderByRerankScores(items, ranked, items.length)).slice(0, topK);
  } catch (err) {
    console.warn('[rerank] 重排序失败，沿用融合顺序:', err instanceof Error ? err.message : err);
    return demoteUnrequestedCrisis(query, items).slice(0, topK);
  }
}
