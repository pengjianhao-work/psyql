import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  embedText,
  embedTexts,
  cosineSimilarity,
  resolveEmbedRoutes
} from '../knowledge/embeddingService';
import { VideoItem, buildVideoDocText, loadVideos } from './videoLibrary';

/**
 * 视频库向量索引：把每条视频（标题 + 标签 + 简介）转成 bge-m3 向量，
 * 用户提问时逐一算余弦相似度，用阈值判断“这条视频值不值得推”。
 * 索引落盘到 server/data/video_embeddings.json，避免每次启动重复请求。
 */

const CACHE_PATH = process.env.PSYQA_VIDEO_EMBED_PATH
  ? path.resolve(process.env.PSYQA_VIDEO_EMBED_PATH)
  : path.resolve(process.cwd(), 'server/data/video_embeddings.json');

const EMBED_BATCH_SIZE = 16;

export interface VideoEmbeddingIndex {
  model: string;
  hash: string;
  vectors: Map<string, number[]>;
}

export interface VideoSimilarityHit {
  video: VideoItem;
  score: number;
}

let memoryIndex: VideoEmbeddingIndex | null = null;

function currentModel(): string {
  const routes = resolveEmbedRoutes();
  return routes[0]?.model || 'BAAI/bge-m3';
}

/** 视频集合或内容变化时索引必须重建，用文档内容哈希判断 */
function computeHash(videos: VideoItem[], model: string): string {
  const payload = videos.map((video) => `${video.id}:${buildVideoDocText(video)}`).join('\n');
  return crypto.createHash('sha1').update(`${model}\n${payload}`).digest('hex');
}

function readCacheFile(): { model: string; hash: string; items: Record<string, number[]> } | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (!parsed || typeof parsed.items !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCacheFile(model: string, hash: string, vectors: Map<string, number[]>): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const items: Record<string, number[]> = {};
    vectors.forEach((vec, id) => {
      items[id] = vec;
    });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ model, hash, items }), 'utf8');
  } catch (error) {
    console.warn('视频向量索引写入失败:', error instanceof Error ? error.message : error);
  }
}

async function embedAllVideos(videos: VideoItem[]): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  for (let i = 0; i < videos.length; i += EMBED_BATCH_SIZE) {
    const batch = videos.slice(i, i + EMBED_BATCH_SIZE);
    const embedded = await embedTexts(batch.map(buildVideoDocText));
    embedded.forEach((vec, index) => {
      if (vec && vec.length) vectors.set(batch[index].id, vec);
    });
  }
  return vectors;
}

/**
 * 获取（必要时构建）视频向量索引。
 * 成功返回索引；嵌入服务不可用或可用条数过少时返回 null，由调用方回退到规则匹配。
 */
export async function getVideoEmbeddingIndex(): Promise<VideoEmbeddingIndex | null> {
  const videos = loadVideos();
  if (!videos.length) return null;

  const model = currentModel();
  const hash = computeHash(videos, model);
  if (memoryIndex && memoryIndex.hash === hash) return memoryIndex;

  const cached = readCacheFile();
  if (cached && cached.hash === hash && cached.model === model) {
    const vectors = new Map<string, number[]>();
    for (const video of videos) {
      const vec = cached.items[video.id];
      if (Array.isArray(vec) && vec.length) vectors.set(video.id, vec);
    }
    if (vectors.size >= Math.ceil(videos.length * 0.8)) {
      memoryIndex = { model, hash, vectors };
      return memoryIndex;
    }
  }

  const vectors = await embedAllVideos(videos);
  if (vectors.size < Math.ceil(videos.length * 0.8)) {
    console.warn(
      `[video-embed] 仅成功向量化 ${vectors.size}/${videos.length} 条，本次回退到规则匹配`
    );
    return null;
  }
  writeCacheFile(model, hash, vectors);
  console.log(`[video-embed] 已构建视频向量索引 ${vectors.size} 条（${model}）`);
  memoryIndex = { model, hash, vectors };
  return memoryIndex;
}

/** 仅构建并落盘索引（供 npm run videos:embed 使用） */
export async function rebuildVideoEmbeddingIndex(): Promise<{ total: number; embedded: number; model: string }> {
  const videos = loadVideos();
  const model = currentModel();
  const vectors = await embedAllVideos(videos);
  if (vectors.size) writeCacheFile(model, computeHash(videos, model), vectors);
  memoryIndex = null;
  return { total: videos.length, embedded: vectors.size, model };
}

/**
 * 按对话与视频的向量相似度排序。索引不可用或提问向量化失败时返回 null。
 */
export async function rankVideosBySimilarity(
  question: string
): Promise<VideoSimilarityHit[] | null> {
  const text = (question || '').trim();
  if (!text) return null;

  const index = await getVideoEmbeddingIndex();
  if (!index) return null;

  const queryVec = await embedText(text);
  if (!queryVec) return null;

  const videos = loadVideos();
  const hits: VideoSimilarityHit[] = [];
  for (const video of videos) {
    if (video.riskLevel === 'high') continue;
    const vec = index.vectors.get(video.id);
    if (!vec) continue;
    hits.push({ video, score: cosineSimilarity(queryVec, vec) });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

export { CACHE_PATH as VIDEO_EMBED_CACHE_PATH };
