import axios from 'axios';
import { getDb } from '../../db/database';
import { getZhipuApiKey, getZhipuBaseUrl } from '../llm/zhipuClient';

export type EmbedProvider = 'siliconflow' | 'ollama';

export interface EmbedRoute {
  provider: EmbedProvider;
  model: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const CLOUD_EMBED_MODEL = 'BAAI/bge-m3';
const LOCAL_EMBED_MODEL = 'bge-m3';

const embedCache = new Map<string, { vec: number[]; at: number }>();
let announcedRoute: string | null = null;

function embedEnv(name: string): string {
  return (process.env[name] || '').trim();
}

function cloudEmbedConfigured(): boolean {
  if (!getZhipuApiKey()) return false;
  const base = getZhipuBaseUrl().toLowerCase();
  return base.includes('siliconflow.cn') || base.includes('dmxapi') || base.includes('openai.com');
}

/** auto：云端 BGE-M3 优先，失败再走本机 Ollama。显式指定时只走一条。 */
export function resolveEmbedRoutes(): EmbedRoute[] {
  const pref = embedEnv('PSYQA_EMBED_PROVIDER').toLowerCase() || 'auto';
  const cloud: EmbedRoute = {
    provider: 'siliconflow',
    model: embedEnv('SILICONFLOW_EMBED_MODEL') || CLOUD_EMBED_MODEL
  };
  const local: EmbedRoute = {
    provider: 'ollama',
    model: embedEnv('OLLAMA_EMBED_MODEL') || LOCAL_EMBED_MODEL
  };

  if (pref === 'siliconflow' || pref === 'zhipu') return [cloud];
  if (pref === 'ollama') return [local];
  return cloudEmbedConfigured() ? [cloud, local] : [local];
}

function ollamaEmbedUrl(): string {
  const raw = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  const base = raw.replace(/\/api\/generate\/?$/, '').replace(/\/$/, '');
  return `${base}/api/embeddings`;
}

function cacheKey(route: EmbedRoute, text: string): string {
  return `${route.provider}:${route.model}:${text.slice(0, 500)}`;
}

function rememberRoute(route: EmbedRoute, fallback: boolean): void {
  const label = `${route.provider}:${route.model}`;
  if (announcedRoute === label) return;
  announcedRoute = label;
  if (fallback) {
    console.warn(
      `[embed] 云端嵌入不可用，已改用 ${label}。查询和索引必须使用同一条嵌入路线，换路线后请重新 npm run embed:full`
    );
    return;
  }
  console.log(`[embed] 使用 ${label}`);
}

export function clearEmbeddingCache(): void {
  embedCache.clear();
}

function storeCache(key: string, vec: number[]): number[] {
  embedCache.set(key, { vec, at: Date.now() });
  if (embedCache.size > CACHE_MAX) {
    const oldest = embedCache.keys().next().value;
    if (oldest) embedCache.delete(oldest);
  }
  return vec;
}

async function embedWithRoute(route: EmbedRoute, input: string): Promise<number[] | null> {
  if (route.provider === 'siliconflow') {
    const key = getZhipuApiKey();
    if (!key) return null;
    const { data } = await axios.post(
      `${getZhipuBaseUrl()}/embeddings`,
      { model: route.model, input, encoding_format: 'float' },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 30_000
      }
    );
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length >= 8 ? (vec as number[]) : null;
  }

  const { data } = await axios.post(
    ollamaEmbedUrl(),
    { model: route.model, prompt: input },
    { timeout: 45_000 }
  );
  const vec = data?.embedding;
  return Array.isArray(vec) && vec.length >= 8 ? (vec as number[]) : null;
}

function clipEmbedInput(text: string): string {
  return text.slice(0, 2000);
}

async function embedBatchWithRoute(route: EmbedRoute, inputs: string[]): Promise<Array<number[] | null> | null> {
  if (route.provider !== 'siliconflow') return null;
  const key = getZhipuApiKey();
  if (!key) return null;
  const { data } = await axios.post(
    `${getZhipuBaseUrl()}/embeddings`,
    { model: route.model, input: inputs, encoding_format: 'float' },
    {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 60_000
    }
  );
  const items = data?.data as Array<{ embedding?: number[]; index?: number }> | undefined;
  if (!Array.isArray(items) || items.length === 0) return null;
  const out: Array<number[] | null> = inputs.map(() => null);
  items.forEach((item, position) => {
    const index = typeof item.index === 'number' ? item.index : position;
    const vec = item.embedding;
    if (index >= 0 && index < out.length && Array.isArray(vec) && vec.length >= 8) {
      out[index] = vec;
    }
  });
  return out.some(Boolean) ? out : null;
}

export async function embedText(text: string): Promise<number[] | null> {
  const input = clipEmbedInput(text);
  if (!input.trim()) return null;
  const [vec] = await embedTexts([input]);
  return vec ?? null;
}

/** 批量嵌入。云端 BGE-M3 一次请求多条；本机 Ollama 逐条调用。 */
export async function embedTexts(texts: string[]): Promise<Array<number[] | null>> {
  const inputs = texts.map(clipEmbedInput);
  const results: Array<number[] | null> = inputs.map(() => null);
  const pending: number[] = [];

  const routes = resolveEmbedRoutes();
  const primary = routes[0];
  if (primary) {
    inputs.forEach((input, index) => {
      if (!input.trim()) return;
      const cached = embedCache.get(cacheKey(primary, input));
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        results[index] = cached.vec;
      } else {
        pending.push(index);
      }
    });
  }

  if (!pending.length) {
    if (primary) rememberRoute(primary, false);
    return results;
  }

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const todo = pending.filter((index) => !results[index]);
    if (!todo.length) break;
    const batchInputs = todo.map((index) => inputs[index]);
    try {
      const batched = route.provider === 'siliconflow' ? await embedBatchWithRoute(route, batchInputs) : null;
      if (batched) {
        todo.forEach((index, position) => {
          const vec = batched[position];
          if (!vec) return;
          results[index] = storeCache(cacheKey(route, inputs[index]), vec);
        });
        rememberRoute(route, i > 0);
        continue;
      }
      for (const index of todo) {
        const vec = await embedWithRoute(route, inputs[index]);
        if (!vec) continue;
        results[index] = storeCache(cacheKey(route, inputs[index]), vec);
      }
      if (todo.some((index) => results[index])) rememberRoute(route, i > 0);
    } catch (err) {
      console.warn(
        `[embed] ${route.provider} ${route.model} 失败:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function loadStoredEmbedding(docId: string): number[] | null {
  const row = getDb()
    .prepare('SELECT embedding_json FROM vector_documents WHERE id = ?')
    .get(docId) as { embedding_json: string | null } | undefined;
  if (!row?.embedding_json) return null;
  try {
    return JSON.parse(row.embedding_json) as number[];
  } catch {
    return null;
  }
}

export function saveStoredEmbedding(docId: string, embedding: number[]): void {
  getDb()
    .prepare('UPDATE vector_documents SET embedding_json = ? WHERE id = ?')
    .run(JSON.stringify(embedding), docId);
}

export function countEmbeddingsInDb(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as c FROM vector_documents WHERE embedding_json IS NOT NULL')
    .get() as { c: number };
  return row.c;
}
