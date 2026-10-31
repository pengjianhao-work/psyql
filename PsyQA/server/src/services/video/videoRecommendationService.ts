import fs from 'fs';
import path from 'path';
import { EmotionAnalysis, ProblemAnalysis, RiskAssessment } from '../psych/emotionService';

export interface VideoItem {
  id: string;
  title: string;
  author: string;
  url: string;
  tags: string[];
  emotions: string[];
  topics: string[];
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
  durationSec?: number;
  /** 占位条目：链接暂未替换为具体视频 */
  isPlaceholder?: boolean;
}

export interface VideoListFilter {
  emotion?: string;
  topic?: string;
  keyword?: string;
  limit?: number;
}

export interface VideoRecommendContext {
  userId: string;
  question: string;
  emotion?: EmotionAnalysis;
  problem?: ProblemAnalysis;
}

const DATA_PATH = process.env.PSYQA_VIDEO_DATA_PATH
  ? path.resolve(process.env.PSYQA_VIDEO_DATA_PATH)
  : path.resolve(process.cwd(), 'server/data/psych_videos.json');

/** 只在情绪明显时推荐，稳定/积极情绪不打扰用户 */
const RECOMMENDABLE_EMOTIONS = new Set([
  'sad',
  'anxious',
  'angry',
  'lonely',
  'confused',
  'frustrated',
  'guilty',
  'shameful'
]);

/** 规则层确认的自伤/伤人/自杀信号，出现时不推荐视频 */
const SEVERE_CRISIS_TYPES = new Set(['suicide', 'selfharm', 'violence']);

const MAX_CHAT_VIDEOS = 2;
const RECENT_HISTORY_LIMIT = 8;
const MIN_EMOTION_CONFIDENCE = 0.4;

let cachedVideos: VideoItem[] = [];
let cachedMtimeMs = 0;
const recentByUser = new Map<string, string[]>();

function loadVideos(): VideoItem[] {
  try {
    const stat = fs.statSync(DATA_PATH);
    if (stat.mtimeMs !== cachedMtimeMs) {
      const parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as VideoItem[];
      cachedVideos = Array.isArray(parsed) ? parsed : [];
      cachedMtimeMs = stat.mtimeMs;
    }
  } catch (error) {
    console.warn('读取心理视频库失败:', error instanceof Error ? error.message : error);
  }
  return cachedVideos;
}

export function shouldRecommendVideos(
  emotion?: EmotionAnalysis,
  risk?: RiskAssessment
): boolean {
  if (!emotion || !risk) return false;
  // 仅规则层确认的严重危机信号会关闭推荐；LLM 单独上调风险时仍保留预警但不屏蔽视频
  if (risk.crisisTypes?.some((type) => SEVERE_CRISIS_TYPES.has(type))) return false;
  if (!RECOMMENDABLE_EMOTIONS.has(emotion.emotion)) return false;
  return (emotion.confidence ?? 0) >= MIN_EMOTION_CONFIDENCE;
}

function scoreVideo(video: VideoItem, ctx: VideoRecommendContext): number {
  let score = 0;

  if (ctx.emotion) {
    if (video.emotions.includes(ctx.emotion.emotion)) score += 5;
    const secondary = ctx.emotion.secondaryEmotions ?? [];
    score += secondary.filter((item) => video.emotions.includes(item)).length * 1.5;
  }

  if (ctx.problem && video.topics.includes(ctx.problem.category)) score += 4;

  const question = ctx.question || '';
  for (const tag of video.tags) {
    if (tag && question.includes(tag)) score += 1.5;
  }

  return score;
}

export function recommendVideos(ctx: VideoRecommendContext): VideoItem[] {
  if (!ctx.emotion) return [];

  const recent = recentByUser.get(ctx.userId) ?? [];
  const ranked = loadVideos()
    .filter((video) => video.riskLevel !== 'high')
    .map((video, index) => ({ video, index, score: scoreVideo(video, ctx) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const fresh = ranked.filter((entry) => !recent.includes(entry.video.id));
  const picked = (fresh.length >= MAX_CHAT_VIDEOS ? fresh : ranked)
    .slice(0, MAX_CHAT_VIDEOS)
    .map((entry) => entry.video);

  if (picked.length > 0) {
    recentByUser.set(
      ctx.userId,
      [...recent, ...picked.map((video) => video.id)].slice(-RECENT_HISTORY_LIMIT)
    );
  }

  return picked;
}

export function listVideos(filter: VideoListFilter = {}): VideoItem[] {
  const emotion = filter.emotion?.trim();
  const topic = filter.topic?.trim();
  const keyword = filter.keyword?.trim().toLowerCase();
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 50);

  return loadVideos()
    .filter((video) => (emotion ? video.emotions.includes(emotion) : true))
    .filter((video) => (topic ? video.topics.includes(topic) : true))
    .filter((video) => {
      if (!keyword) return true;
      const haystack = [video.title, video.description, video.author, ...video.tags]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    })
    .slice(0, limit);
}
