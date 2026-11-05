import axios from 'axios';
import { getZhipuApiKey, getZhipuBaseUrl } from '../llm/zhipuClient';
import type { SearchResult } from './searchTypes';

const DEFAULT_RERANK_MODEL = 'BAAI/bge-reranker-v2-m3';
const LOCAL_RERANK_URL = 'http://127.0.0.1:8092';
const DEFAULT_RERANK_INSTRUCTION =
  'Retrieve the counseling post whose question best matches the student query.';
let announcedModel: string | null = null;
let localHealth: { ok: boolean; at: number } | null = null;
const CRISIS_TERMS = /想死|自杀|轻生|不想活|结束生命|割腕|去死/;

export interface RerankScore {
  index: number;
  score: number;
}

export function isRerankEnabled(): boolean {
  const flag = (process.env.PSYQA_RERANK_ENABLED || '1').trim().toLowerCase();
  return flag !== '0' && flag !== 'false' && flag !== 'off';
}

export function localRerankUrl(): string {
  return (process.env.BGE_RERANK_URL || LOCAL_RERANK_URL).replace(/\/$/, '');
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

function announce(model: string): void {
  if (announcedModel === model) return;
  announcedModel = model;
  console.log(`[rerank] 使用 ${model}`);
}

async function localRerankReady(): Promise<boolean> {
  const now = Date.now();
  if (localHealth && now - localHealth.at < (localHealth.ok ? 15_000 : 3_000)) return localHealth.ok;
  try {
    const { data } = await axios.get(`${localRerankUrl()}/health`, { timeout: 800 });
    localHealth = { ok: data?.ok === true, at: now };
  } catch {
    localHealth = { ok: false, at: now };
  }
  return localHealth.ok;
}

/** 本机 bge-reranker-v2-m3。分数已经过 sigmoid，和文档顺序对齐。 */
async function rerankLocal(query: string, documents: string[]): Promise<RerankScore[] | null> {
  if (!(await localRerankReady())) return null;
  try {
    const { data } = await axios.post(
      `${localRerankUrl()}/rerank`,
      { query: query.slice(0, 500), documents, max_length: 512 },
      { timeout: 20_000 }
    );
    const scores = data?.scores as unknown;
    if (data?.ok !== true || !Array.isArray(scores) || scores.length !== documents.length) return null;
    const ranked = scores.map((score, index) => ({ index, score: Number(score) }));
    if (ranked.some((row) => !Number.isFinite(row.score))) return null;
    announce('本机 bge-reranker-v2-m3');
    return ranked;
  } catch (err) {
    localHealth = { ok: false, at: Date.now() };
    console.warn('[rerank] 本机 bge-reranker 失败:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function rerankRemote(query: string, documents: string[]): Promise<RerankScore[] | null> {
  const key = getZhipuApiKey();
  if (!key) return null;
  const model = rerankModelName();
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
  const { data } = await axios.post(`${getZhipuBaseUrl()}/rerank`, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 20_000
  });
  const results = (data?.results ?? data?.data ?? []) as Array<{
    index?: number;
    relevance_score?: number;
    score?: number;
  }>;
  const ranked = results
    .map((row) => ({ index: Number(row.index), score: Number(row.relevance_score ?? row.score) }))
    .filter((row) => Number.isFinite(row.score));
  if (!ranked.length) return null;
  announce(model);
  return ranked;
}

export async function rerankResults(
  query: string,
  items: SearchResult[],
  topK: number
): Promise<SearchResult[]> {
  if (topK <= 0) return [];
  if (items.length <= 1 || !isRerankEnabled()) return demoteUnrequestedCrisis(query, items).slice(0, topK);

  const documents = items.map(passage);
  try {
    const ranked = (await rerankLocal(query, documents)) ?? (await rerankRemote(query, documents));
    if (!ranked?.length) return demoteUnrequestedCrisis(query, items).slice(0, topK);
    return demoteUnrequestedCrisis(query, orderByRerankScores(items, ranked, items.length)).slice(0, topK);
  } catch (err) {
    console.warn('[rerank] 重排序失败，沿用融合顺序:', err instanceof Error ? err.message : err);
    return demoteUnrequestedCrisis(query, items).slice(0, topK);
  }
}
