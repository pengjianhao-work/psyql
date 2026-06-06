import axios from 'axios';
import { getDb } from '../../db/database';

const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const embedCache = new Map<string, { vec: number[]; at: number }>();

function embedApiUrl(): string {
  const raw = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  const base = raw.replace(/\/api\/generate\/?$/, '').replace(/\/$/, '');
  return `${base}/api/embeddings`;
}

function cacheKey(text: string): string {
  return `${EMBED_MODEL}:${text.slice(0, 500)}`;
}

export function clearEmbeddingCache(): void {
  embedCache.clear();
}

export async function embedText(text: string): Promise<number[] | null> {
  const input = text.slice(0, 2000);
  if (!input.trim()) return null;

  const key = cacheKey(input);
  const cached = embedCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.vec;
  }

  try {
    const { data } = await axios.post(
      embedApiUrl(),
      { model: EMBED_MODEL, prompt: input },
      { timeout: 30000 }
    );
    const vec = data?.embedding;
    if (!Array.isArray(vec) || vec.length < 8) return null;
    const result = vec as number[];
    embedCache.set(key, { vec: result, at: Date.now() });
    if (embedCache.size > CACHE_MAX) {
      const oldest = embedCache.keys().next().value;
      if (oldest) embedCache.delete(oldest);
    }
    return result;
  } catch (err) {
    console.warn('Ollama embedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
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
