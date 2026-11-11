import fs from 'fs';
import path from 'path';

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

const DATA_DIR = resolveDataDir();
const DATA_PATH = process.env.PSYQA_VIDEO_DATA_PATH
  ? path.resolve(process.env.PSYQA_VIDEO_DATA_PATH)
  : path.join(DATA_DIR, 'psych_videos.json');

/** 优先用源码目录定位，避免从仓库根启动时读不到视频库 */
function resolveDataDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../../data'),
    path.resolve(process.cwd(), 'server/data')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'psych_videos.json'))) return dir;
  }
  return candidates[1];
}

let cachedVideos: VideoItem[] = [];
let cachedMtimeMs = 0;

/** 读取视频库，按文件修改时间缓存，改 JSON 后无需重启 */
export function loadVideos(): VideoItem[] {
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

/** 参与向量化的文本：标题 + 标签 + 简介，缺一都会明显降低匹配质量 */
export function buildVideoDocText(video: VideoItem): string {
  return [video.title, (video.tags || []).join(' '), video.description]
    .filter(Boolean)
    .join('。');
}

export { DATA_DIR as VIDEO_DATA_DIR, DATA_PATH as VIDEO_DATA_PATH };
