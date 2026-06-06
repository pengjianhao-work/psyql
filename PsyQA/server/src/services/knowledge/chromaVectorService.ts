import { embedText, loadStoredEmbedding } from './embeddingService';
import type { SearchResult } from './searchTypes';

const COLLECTION = process.env.CHROMA_COLLECTION || 'psyqa_knowledge';
const CHROMA_URL = (process.env.CHROMA_URL || 'http://localhost:8000').replace(/\/$/, '');

let clientPromise: Promise<import('chromadb').ChromaClient | null> | null = null;
let collectionPromise: Promise<import('chromadb').Collection | null> | null = null;
let chromaAvailable: boolean | null = null;

export function isChromaEnabled(): boolean {
  return process.env.PSYQA_CHROMA_ENABLED === '1' || process.env.PSYQA_CHROMA_ENABLED === 'true';
}

async function getClient(): Promise<import('chromadb').ChromaClient | null> {
  if (!isChromaEnabled()) return null;
  if (chromaAvailable === false) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const { ChromaClient } = await import('chromadb');
        const client = new ChromaClient({ path: CHROMA_URL });
        await client.heartbeat();
        chromaAvailable = true;
        return client;
      } catch (err) {
        chromaAvailable = false;
        console.warn('[chroma] unavailable:', err instanceof Error ? err.message : err);
        return null;
      }
    })();
  }
  return clientPromise;
}

async function getCollection(): Promise<import('chromadb').Collection | null> {
  if (!collectionPromise) {
    collectionPromise = (async () => {
      const client = await getClient();
      if (!client) return null;
      try {
        return await client.getOrCreateCollection({
          name: COLLECTION,
          metadata: { source: 'psyqa', hnsw_space: 'cosine' }
        });
      } catch (err) {
        console.warn('[chroma] collection error:', err instanceof Error ? err.message : err);
        chromaAvailable = false;
        return null;
      }
    })();
  }
  return collectionPromise;
}

export async function getChromaStatus(): Promise<{
  enabled: boolean;
  connected: boolean;
  url: string;
  collection: string;
  count?: number;
}> {
  const enabled = isChromaEnabled();
  if (!enabled) {
    return { enabled: false, connected: false, url: CHROMA_URL, collection: COLLECTION };
  }
  const col = await getCollection();
  if (!col) {
    return { enabled: true, connected: false, url: CHROMA_URL, collection: COLLECTION };
  }
  try {
    const count = await col.count();
    return { enabled: true, connected: true, url: CHROMA_URL, collection: COLLECTION, count };
  } catch {
    return { enabled: true, connected: false, url: CHROMA_URL, collection: COLLECTION };
  }
}

export async function searchChroma(query: string, topK: number = 5): Promise<SearchResult[]> {
  const col = await getCollection();
  if (!col) return [];

  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];

  try {
    const result = await col.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: ['metadatas', 'distances'] as unknown as import('chromadb').IncludeEnum[]
    });

    const ids = result.ids?.[0] ?? [];
    const metas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];

    return ids.map((id, i) => {
      const meta = (metas[i] ?? {}) as Record<string, string>;
      const dist = distances[i] ?? 1;
      const similarity = Math.max(0, 1 - dist);
      return {
        id,
        question: meta.question ?? '',
        answer: meta.answer ?? '',
        similarity
      };
    }).filter((r) => r.question && r.answer);
  } catch (err) {
    console.warn('[chroma] query failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function upsertChromaBatch(
  items: Array<{ id: string; question: string; answer: string; content: string; embedding?: number[] | null }>
): Promise<number> {
  const col = await getCollection();
  if (!col || items.length === 0) return 0;

  const ready: Array<{ id: string; question: string; answer: string; content: string; embedding: number[] }> = [];
  for (const item of items) {
    let emb = item.embedding ?? loadStoredEmbedding(item.id);
    if (!emb) {
      emb = await embedText(item.content);
    }
    if (emb) {
      ready.push({ ...item, embedding: emb });
    }
  }
  if (!ready.length) return 0;

  await col.upsert({
    ids: ready.map((r) => r.id),
    embeddings: ready.map((r) => r.embedding),
    documents: ready.map((r) => r.content),
    metadatas: ready.map((r) => ({ question: r.question, answer: r.answer }))
  });
  return ready.length;
}

export function resetChromaCache(): void {
  clientPromise = null;
  collectionPromise = null;
  chromaAvailable = null;
}

export function getPublicCollectionName(): string {
  return COLLECTION;
}

export async function deletePublicChromaCollection(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.deleteCollection({ name: COLLECTION });
    collectionPromise = null;
    return true;
  } catch {
    return false;
  }
}

function sanitizeUserCollectionName(userId: string): string {
  return `user_${userId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
}

export function getUserChromaCollectionName(userId: string): string {
  return sanitizeUserCollectionName(userId);
}

export async function deleteUserChromaCollection(userId: string): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.deleteCollection({ name: sanitizeUserCollectionName(userId) });
    return true;
  } catch {
    return false;
  }
}

async function getUserCollection(userId: string): Promise<import('chromadb').Collection | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    return await client.getOrCreateCollection({
      name: sanitizeUserCollectionName(userId),
      metadata: { source: 'psyqa_user', userId, hnsw_space: 'cosine' }
    });
  } catch (err) {
    console.warn('[chroma] user collection error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function searchPublicChromaCollection(
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  return searchChroma(query, topK);
}

export async function searchUserChromaCollection(
  userId: string,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const col = await getUserCollection(userId);
  if (!col) return [];

  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];

  try {
    const result = await col.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: ['metadatas', 'distances'] as unknown as import('chromadb').IncludeEnum[]
    });

    const ids = result.ids?.[0] ?? [];
    const metas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];

    return ids.map((id, i) => {
      const meta = (metas[i] ?? {}) as Record<string, string>;
      const dist = distances[i] ?? 1;
      const similarity = Math.max(0, 1 - dist);
      return {
        id,
        question: meta.userPreview ?? meta.question ?? '',
        answer: meta.content ?? '',
        similarity,
        dialogTime: meta.dialogTime,
        source: 'user' as const
      };
    }).filter((r) => r.question || r.answer);
  } catch (err) {
    console.warn('[chroma] user query failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function upsertUserDialogVector(
  userId: string,
  item: {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, string>;
  }
): Promise<boolean> {
  const col = await getUserCollection(userId);
  if (!col) return false;

  try {
    await col.upsert({
      ids: [item.id],
      embeddings: [item.embedding],
      documents: [item.content],
      metadatas: [{ ...item.metadata, content: item.content.slice(0, 500) }]
    });
    return true;
  } catch (err) {
    console.warn('[chroma] user upsert failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
