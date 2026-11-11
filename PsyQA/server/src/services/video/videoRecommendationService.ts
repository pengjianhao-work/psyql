import { EmotionAnalysis, ProblemAnalysis, RiskAssessment } from '../psych/emotionService';
import { VideoItem, loadVideos } from './videoLibrary';
import { rankVideosBySimilarity } from './videoVectorService';

export type { VideoItem };

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

/** 向量相似度阈值：只有对话与视频的相关性超过它才推荐，否则宁可不推 */
const SIM_THRESHOLD = clampThreshold(Number(process.env.PSYQA_VIDEO_SIM_THRESHOLD));

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return 0.55;
  return Math.min(Math.max(value, 0.3), 0.85);
}

const recentByUser = new Map<string, string[]>();

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

/** 记录已推荐的视频，避免同一用户连续收到重复内容 */
function rememberPicked(userId: string, picked: VideoItem[]): void {
  if (!picked.length) return;
  const recent = recentByUser.get(userId) ?? [];
  recentByUser.set(
    userId,
    [...recent, ...picked.map((video) => video.id)].slice(-RECENT_HISTORY_LIMIT)
  );
}

/**
 * 向量相关性推荐：把对话和每条视频都转成向量求余弦相似度，
 * 只有超过阈值的才算候选；一条都没有就返回空数组（宁可不推，也不推不相关的）。
 * 返回 null 表示向量服务不可用，此时由调用方回退到规则匹配。
 */
async function recommendBySimilarity(ctx: VideoRecommendContext): Promise<VideoItem[] | null> {
  const hits = await rankVideosBySimilarity(ctx.question);
  if (!hits) return null;

  const recent = recentByUser.get(ctx.userId) ?? [];
  const aboveThreshold = hits.filter((hit) => hit.score >= SIM_THRESHOLD);
  const fresh = aboveThreshold.filter((hit) => !recent.includes(hit.video.id));
  const picked = (fresh.length >= MAX_CHAT_VIDEOS ? fresh : aboveThreshold)
    .slice(0, MAX_CHAT_VIDEOS)
    .map((hit) => hit.video);

  rememberPicked(ctx.userId, picked);
  return picked;
}

/** 规则匹配兜底：向量服务不可用（无密钥/断网）时保持原有行为 */
function recommendByRules(ctx: VideoRecommendContext): VideoItem[] {
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

  rememberPicked(ctx.userId, picked);
  return picked;
}

export async function recommendVideos(ctx: VideoRecommendContext): Promise<VideoItem[]> {
  if (!ctx.emotion) return [];
  const byVector = await recommendBySimilarity(ctx);
  return byVector ?? recommendByRules(ctx);
}

export function listVideos(filter: VideoListFilter = {}): VideoItem[] {
  const emotion = filter.emotion?.trim();
  const topic = filter.topic?.trim();
  const keyword = filter.keyword?.trim().toLowerCase();
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 500);

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
