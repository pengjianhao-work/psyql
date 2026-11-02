import { createHash } from 'crypto';
import axios from 'axios';
import { embedText, loadStoredEmbedding } from './embeddingService';
import { embedMultiLocal } from './localBgeClient';
import {
  COLBERT_KEEP,
  COLBERT_NAME,
  DENSE_NAME,
  LEXICAL_NAME,
  VECTOR_DIM,
  averageColbertScore,
  buildKnowledgeQuery,
  detectQdrantSchema,
  type QdrantSchema
} from './qdrantHybrid';
import type { SearchResult } from './searchTypes';

const COLLECTION = process.env.QDRANT_COLLECTION || 'psyqa_knowledge';
const USER_COLLECTION = process.env.QDRANT_USER_COLLECTION || 'psyqa_user_memory';
const QDRANT_URL = (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/$/, '');
const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || VECTOR_DIM);

let available: boolean | null = null;
let schemaCache: { schema: QdrantSchema; at: number } | null = null;
let loggedDenseFallback = false;

const HYBRID_COLLECTION = {
  vectors: {
    dense: { size: VECTOR_SIZE, distance: 'Cosine' },
    colbert: {
      size: VECTOR_SIZE,
      distance: 'Cosine',
      datatype: 'float16',
      on_disk: true,
      hnsw_config: { m: 0 },
      multivector_config: { comparator: 'max_sim' }
    }
  },
  sparse_vectors: { lexical: {} }
};

export function isQdrantEnabled(): boolean {
  return process.env.PSYQA_QDRANT_ENABLED === '1' || process.env.PSYQA_QDRANT_ENABLED === 'true';
}

/** Qdrant 点 ID 只能是整数或 UUID，文档 id（如 kb_0）映射成稳定 UUID。 */
export function qdrantPointId(docId: string): string {
  const hex = createHash('sha256').update(docId).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function collectionUrl(name = COLLECTION): string {
  return `${QDRANT_URL}/collections/${encodeURIComponent(name)}`;
}

export function resetQdrantCache(): void {
  available = null;
  schemaCache = null;
  loggedDenseFallback = false;
}

async function readSchema(force = false): Promise<QdrantSchema> {
  if (!force && schemaCache && Date.now() - schemaCache.at < 30_000) return schemaCache.schema;
  try {
    const { data } = await axios.get(collectionUrl(), { timeout: 5000 });
    const schema = detectQdrantSchema(data?.result?.config?.params);
    schemaCache = { schema, at: Date.now() };
    available = true;
    return schema;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 404) {
      schemaCache = { schema: 'missing', at: Date.now() };
      available = true;
      return 'missing';
    }
    available = false;
    return 'missing';
  }
}

export async function getQdrantStatus(): Promise<{
  enabled: boolean;
  connected: boolean;
  url: string;
  collection: string;
  schema: QdrantSchema;
  count?: number;
}> {
  const base = {
    enabled: isQdrantEnabled(),
    url: QDRANT_URL,
    collection: COLLECTION,
    schema: 'missing' as QdrantSchema
  };
  if (!base.enabled) return { ...base, connected: false };
  try {
    const { data } = await axios.get(collectionUrl(), { timeout: 5000 });
    available = true;
    const schema = detectQdrantSchema(data?.result?.config?.params);
    schemaCache = { schema, at: Date.now() };
    const count = data?.result?.points_count;
    return { ...base, schema, connected: true, count: typeof count === 'number' ? count : undefined };
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 404) {
      available = true;
      schemaCache = { schema: 'missing', at: Date.now() };
      return { ...base, connected: true, count: 0 };
    }
    available = false;
    return { ...base, connected: false };
  }
}

export async function ensureQdrantCollection(vectorSize = VECTOR_SIZE): Promise<boolean> {
  if (!isQdrantEnabled()) return false;
  const schema = await readSchema(true);
  if (schema === 'legacy' || schema === 'hybrid') {
    if (schema === 'legacy' && vectorSize !== VECTOR_SIZE) return false;
    return true;
  }
  if (available === false) return false;
  try {
    await axios.put(collectionUrl(), HYBRID_COLLECTION, { timeout: 15000 });
    schemaCache = { schema: 'hybrid', at: Date.now() };
    available = true;
    return true;
  } catch (err) {
    console.warn('[qdrant] create hybrid collection failed:', err instanceof Error ? err.message : err);
    available = false;
    return false;
  }
}

export async function deleteQdrantCollection(): Promise<boolean> {
  try {
    await axios.delete(collectionUrl(), { timeout: 15000 });
    available = null;
    return true;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    return status === 404;
  }
}

function knowledgePayload(item: { id: string; question: string; answer: string }): Record<string, string> {
  return {
    docId: item.id,
    question: String(item.question || '').slice(0, 200),
    answer: String(item.answer || '').slice(0, 500)
  };
}

export async function upsertQdrantBatch(
  items: Array<{ id: string; question: string; answer: string; content: string; embedding?: number[] | null }>
): Promise<number> {
  if (!isQdrantEnabled() || items.length === 0) return 0;
  const ready = await ensureQdrantCollection();
  if (!ready) return 0;
  const schema = await readSchema();
  if (schema === 'hybrid') return upsertHybridBatch(items);

  const points: Array<{ id: string; vector: number[]; payload: Record<string, string> }> = [];
  for (const item of items) {
    let emb = item.embedding ?? loadStoredEmbedding(item.id);
    if (!emb) emb = await embedText(item.content);
    if (!emb || emb.length !== VECTOR_SIZE) continue;
    points.push({ id: qdrantPointId(item.id), vector: emb, payload: knowledgePayload(item) });
  }
  if (!points.length) return 0;
  await axios.put(`${collectionUrl()}/points?wait=true`, { points }, { timeout: 60_000 });
  return points.length;
}

async function upsertHybridBatch(
  items: Array<{ id: string; question: string; answer: string; content: string }>
): Promise<number> {
  const points = [];
  for (const item of items) {
    const encoded = await embedMultiLocal(item.content, COLBERT_KEEP);
    if (!encoded || encoded.dense.length !== VECTOR_SIZE || !encoded.colbert.length) continue;
    points.push({
      id: qdrantPointId(item.id),
      vector: {
        [DENSE_NAME]: encoded.dense,
        [COLBERT_NAME]: encoded.colbert,
        [LEXICAL_NAME]: { indices: encoded.sparse.indices, values: encoded.sparse.values }
      },
      payload: knowledgePayload(item)
    });
  }
  if (!points.length) return 0;
  await axios.put(`${collectionUrl()}/points?wait=true`, { points }, { timeout: 120_000 });
  return points.length;
}

function rowsFromQuery(data: { result?: { points?: unknown } | unknown }): SearchResult[] {
  const result = data?.result as { points?: Array<{ score?: number; payload?: Record<string, string> }> } | undefined;
  const points = (result?.points ?? data?.result ?? []) as Array<{
    score?: number;
    payload?: Record<string, string>;
  }>;
  return points
    .map((point) => ({
      id: point.payload?.docId ?? '',
      question: point.payload?.question ?? '',
      answer: point.payload?.answer ?? '',
      similarity: point.score ?? 0
    }))
    .filter((row) => row.id && row.question && row.answer);
}

export async function searchQdrant(query: string, topK = 5): Promise<SearchResult[]> {
  if (!isQdrantEnabled() || available === false || topK <= 0) return [];
  const schema = await readSchema();
  if (schema === 'hybrid') return searchHybrid(query, topK);
  if (schema === 'legacy') return searchLegacy(query, topK);
  return [];
}

async function searchLegacy(query: string, topK: number): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];
  try {
    const { data } = await axios.post(
      `${collectionUrl()}/points/query`,
      { query: queryEmbedding, limit: topK, with_payload: true },
      { timeout: 20_000 }
    );
    available = true;
    return rowsFromQuery(data);
  } catch (err) {
    return warnQuery(err);
  }
}

async function searchHybrid(query: string, topK: number): Promise<SearchResult[]> {
  const encoded = await embedMultiLocal(query, 128);
  if (!encoded) return searchDenseFallback(query, topK);
  try {
    const { data } = await axios.post(
      `${collectionUrl()}/points/query`,
      buildKnowledgeQuery(encoded, topK),
      { timeout: 20_000 }
    );
    available = true;
    const tokens = encoded.colbert.length;
    return rowsFromQuery(data).map((row) => ({
      ...row,
      similarity: tokens ? averageColbertScore(row.similarity, tokens) : row.similarity
    }));
  } catch (err) {
    return warnQuery(err);
  }
}

async function searchDenseFallback(query: string, topK: number): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];
  if (!loggedDenseFallback) {
    loggedDenseFallback = true;
    console.warn('[qdrant] 本机 bge-m3 未启动，知识检索暂时只用整句向量');
  }
  try {
    const { data } = await axios.post(
      `${collectionUrl()}/points/query`,
      { query: queryEmbedding, using: DENSE_NAME, limit: topK, with_payload: true },
      { timeout: 20_000 }
    );
    return rowsFromQuery(data);
  } catch (err) {
    return warnQuery(err);
  }
}

function warnQuery(err: unknown): SearchResult[] {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined;
  if (status === 404) return [];
  console.warn('[qdrant] query failed:', err instanceof Error ? err.message : err);
  return [];
}

export function getUserQdrantCollectionName(): string {
  return USER_COLLECTION;
}

async function ensureNamedCollection(name: string): Promise<boolean> {
  if (!isQdrantEnabled()) return false;
  const url = collectionUrl(name);
  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    const size = data?.result?.config?.params?.vectors?.size;
    available = true;
    return !size || size === VECTOR_SIZE;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status !== 404) return false;
  }
  await axios.put(url, { vectors: { size: VECTOR_SIZE, distance: 'Cosine' } }, { timeout: 15000 });
  available = true;
  return true;
}

export async function upsertUserQdrantDialog(
  userId: string,
  item: {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, string>;
  }
): Promise<boolean> {
  if (!isQdrantEnabled() || item.embedding.length !== VECTOR_SIZE) return false;
  if (!(await ensureNamedCollection(USER_COLLECTION))) return false;
  try {
    await axios.put(
      `${collectionUrl(USER_COLLECTION)}/points?wait=true`,
      {
        points: [
          {
            id: qdrantPointId(item.id),
            vector: item.embedding,
            payload: {
              ...item.metadata,
              userId,
              docId: item.id,
              content: item.content.slice(0, 500)
            }
          }
        ]
      },
      { timeout: 20_000 }
    );
    return true;
  } catch (err) {
    console.warn('[qdrant] user upsert failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function searchUserQdrant(userId: string, query: string, topK = 5): Promise<SearchResult[]> {
  if (!isQdrantEnabled()) return [];
  const local = await embedMultiLocal(query, 8);
  const queryEmbedding = local?.dense?.length === VECTOR_SIZE ? local.dense : await embedText(query);
  if (!queryEmbedding) return [];
  try {
    const { data } = await axios.post(
      `${collectionUrl(USER_COLLECTION)}/points/query`,
      {
        query: queryEmbedding,
        limit: topK,
        with_payload: true,
        filter: { must: [{ key: 'userId', match: { value: userId } }] }
      },
      { timeout: 20_000 }
    );
    const points = (data?.result?.points ?? []) as Array<{
      score?: number;
      payload?: Record<string, string>;
    }>;
    return points
      .map((point) => ({
        id: point.payload?.docId ?? '',
        question: point.payload?.userPreview ?? '',
        answer: point.payload?.content ?? '',
        similarity: point.score ?? 0,
        dialogTime: point.payload?.dialogTime,
        emotion: point.payload?.emotion,
        trigger: point.payload?.trigger,
        source: 'user' as const
      }))
      .filter((row) => row.question || row.answer);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 404) return [];
    console.warn('[qdrant] user query failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function deleteUserPoints(filter: Record<string, unknown>): Promise<boolean> {
  if (!isQdrantEnabled()) return false;
  try {
    await axios.post(
      `${collectionUrl(USER_COLLECTION)}/points/delete?wait=true`,
      { filter },
      { timeout: 20_000 }
    );
    return true;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    return status === 404;
  }
}

export async function deleteUserQdrantMemory(userId: string): Promise<boolean> {
  return deleteUserPoints({ must: [{ key: 'userId', match: { value: userId } }] });
}

export async function deleteUserQdrantVectors(userId: string, docIds: string[]): Promise<boolean> {
  if (!docIds.length) return false;
  return deleteUserPoints({
    must: [
      { key: 'userId', match: { value: userId } },
      { key: 'docId', match: { any: docIds } }
    ]
  });
}
