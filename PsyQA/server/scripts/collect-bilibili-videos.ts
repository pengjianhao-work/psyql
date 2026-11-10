/**
 * 从 B 站批量采集心理类候选视频，生成待审核清单
 * 运行: npm run videos:collect
 *       npm run videos:collect -- --keyword "焦虑" --pages 2
 *       npm run videos:collect -- --pages 5 --min-play 20000 --limit 200
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'server/data');
const LIBRARY_PATH = path.join(DATA_DIR, 'psych_videos.json');
const PENDING_PATH = path.join(DATA_DIR, 'pending_videos.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const DEFAULT_KEYWORDS = [
  '焦虑',
  '失眠',
  '抑郁情绪',
  '精神内耗',
  '压力大',
  '孤独',
  '社交焦虑',
  '失恋',
  '愤怒情绪',
  '情绪管理',
  '迷茫',
  '自我怀疑',
  '拖延',
  '考试焦虑',
  '睡眠',
  '自我成长',
  '心理疗愈',
  '人际关系',
  '学习压力',
  '情绪低落'
];

const EMOTION_RULES: Array<{ emotion: string; keywords: string[] }> = [
  { emotion: 'anxious', keywords: ['焦虑', '失眠', '睡不着', '紧张', '恐慌', '压力', '内耗', '考试', '担心'] },
  { emotion: 'sad', keywords: ['低落', '抑郁', '难过', '悲伤', '想哭', '痛苦', '绝望', '失落'] },
  { emotion: 'lonely', keywords: ['孤独', '寂寞', '一个人', '没人陪', '被孤立', '社交焦虑', '社恐'] },
  { emotion: 'angry', keywords: ['愤怒', '生气', '暴躁', '易怒', '发火', '火大'] },
  { emotion: 'frustrated', keywords: ['挫败', '失败', '放弃', '自卑', '我不行', '打击', '无力'] },
  { emotion: 'confused', keywords: ['迷茫', '人生方向', '找不到方向', '困惑', '不知道做什么'] },
  { emotion: 'guilty', keywords: ['内疚', '自责', '羞愧', '羞耻', '对不起'] }
];

const TOPIC_RULES: Array<{ topic: string; keywords: string[] }> = [
  { topic: 'academic_stress', keywords: ['学习', '考试', '考研', '高考', '学生', '复习', '作业', '挂科', '成绩'] },
  {
    topic: 'interpersonal',
    keywords: ['人际', '社交', '朋友', '恋爱', '失恋', '室友', '父母', '家庭', '关系', '沟通']
  },
  {
    topic: 'emotion_regulation',
    keywords: ['情绪', '内耗', '压力', '调节', '治愈', '焦虑', '抑郁', '失眠', '睡眠', '放松']
  },
  { topic: 'self_identity', keywords: ['自我', '自卑', '自信', '我是谁', '人生', '迷茫', '成长', '意义'] }
];

interface BiliSearchItem {
  bvid?: string;
  title?: string;
  author?: string;
  play?: number;
  duration?: string;
  tag?: string;
  description?: string;
  pubdate?: number;
}

interface PendingItem {
  title: string;
  author: string;
  url: string;
  tags: string[];
  emotions: string[];
  topics: string[];
  riskLevel: 'low';
  description: string;
  durationSec: number;
  approved: boolean;
  source: 'bilibili';
  meta: {
    play: number;
    keyword: string;
    matched: string[];
    score: number;
    pubdate?: number;
  };
}

interface Args {
  keywords: string[];
  pages: number;
  minPlay: number;
  limit: number;
  delayMs: number;
}

function parseArgs(argv: string[]): Args {
  const keywords: string[] = [];
  let pages = 3;
  let minPlay = 10000;
  let limit = 150;
  let delayMs = 800;

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--keyword' && value) {
      keywords.push(value);
      i += 1;
    } else if (key === '--pages' && value) {
      pages = Math.max(1, Number(value) || 1);
      i += 1;
    } else if (key === '--min-play' && value) {
      minPlay = Math.max(0, Number(value) || 0);
      i += 1;
    } else if (key === '--limit' && value) {
      limit = Math.max(1, Number(value) || 1);
      i += 1;
    } else if (key === '--delay' && value) {
      delayMs = Math.max(200, Number(value) || 800);
      i += 1;
    }
  }

  return {
    keywords: keywords.length > 0 ? keywords : DEFAULT_KEYWORDS,
    pages,
    minPlay,
    limit,
    delayMs
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCookie(): Promise<string> {
  const res = await fetch('https://www.bilibili.com/', {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  const raw =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') || ''];
  const pairs = raw
    .map((line) => line.split(';')[0].trim())
    .filter((pair) => pair.startsWith('buvid3=') || pair.startsWith('b_nut='));
  if (!pairs.some((pair) => pair.startsWith('buvid3='))) {
    throw new Error('未能获取 B 站 buvid3 cookie');
  }
  return pairs.join('; ');
}

async function searchPage(keyword: string, page: number, cookie: string): Promise<BiliSearchItem[]> {
  const url =
    'https://api.bilibili.com/x/web-interface/search/type' +
    `?search_type=video&keyword=${encodeURIComponent(keyword)}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://search.bilibili.com/',
      Cookie: cookie,
      Accept: 'application/json'
    }
  });
  const json = (await res.json()) as {
    code: number;
    message?: string;
    data?: { result?: BiliSearchItem[] };
  };
  if (json.code !== 0) {
    throw new Error(`搜索接口返回 code=${json.code} ${json.message || ''}`);
  }
  return json.data?.result || [];
}

async function searchWithRetry(keyword: string, page: number, cookie: string): Promise<BiliSearchItem[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await searchPage(keyword, page, cookie);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1000 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function decodeEntities(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDuration(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split(':').map((part) => Number(part) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function splitTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function matchRules(
  text: string,
  rules: Array<{ emotion?: string; topic?: string; keywords: string[] }>
): string[] {
  const hit: string[] = [];
  const lower = text.toLowerCase();
  rules.forEach((rule) => {
    if (!rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) return;
    const label = rule.emotion || rule.topic;
    if (label) hit.push(label);
  });
  return hit;
}

function extractBvid(url: string): string {
  const match = url.match(/\/video\/(BV[0-9A-Za-z]+)/);
  return match ? match[1] : '';
}

function readLibraryBvids(): Set<string> {
  try {
    const items = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8')) as Array<{ url?: string }>;
    return new Set(items.map((item) => extractBvid(item.url || '')).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cookie = await getCookie();
  const libraryBvids = readLibraryBvids();

  const seen = new Set<string>();
  const collected: PendingItem[] = [];
  const stats = {
    requests: 0,
    failedRequests: 0,
    rawItems: 0,
    skippedDuplicate: 0,
    skippedExisting: 0,
    skippedDuration: 0,
    skippedPlay: 0,
    skippedIrrelevant: 0
  };

  for (const keyword of args.keywords) {
    let keywordCount = 0;
    for (let page = 1; page <= args.pages; page += 1) {
      let items: BiliSearchItem[] = [];
      try {
        items = await searchWithRetry(keyword, page, cookie);
        stats.requests += 1;
      } catch (error) {
        stats.failedRequests += 1;
        console.warn(`[warn] 关键词「${keyword}」第 ${page} 页采集失败: ${(error as Error).message}`);
        await sleep(args.delayMs * 2);
        continue;
      }

      for (const item of items) {
        stats.rawItems += 1;
        const bvid = (item.bvid || '').trim();
        if (!bvid) continue;
        if (seen.has(bvid)) {
          stats.skippedDuplicate += 1;
          continue;
        }
        seen.add(bvid);
        if (libraryBvids.has(bvid)) {
          stats.skippedExisting += 1;
          continue;
        }

        const title = decodeEntities(item.title || '');
        const durationSec = parseDuration(item.duration);
        const play = Number(item.play) || 0;
        const tags = splitTags(item.tag);
        const description = decodeEntities(item.description || '').slice(0, 120);

        if (durationSec < 60 || durationSec > 1800) {
          stats.skippedDuration += 1;
          continue;
        }
        if (play < args.minPlay) {
          stats.skippedPlay += 1;
          continue;
        }

        const haystack = `${title} ${tags.join(' ')} ${description}`;
        const emotions = matchRules(haystack, EMOTION_RULES);
        const topics = matchRules(haystack, TOPIC_RULES);
        if (emotions.length === 0 && topics.length === 0) {
          stats.skippedIrrelevant += 1;
          continue;
        }

        const matched = [...emotions, ...topics];
        collected.push({
          title: title.slice(0, 80),
          author: decodeEntities(item.author || ''),
          url: `https://www.bilibili.com/video/${bvid}`,
          tags: tags.length > 0 ? tags : ['心理'],
          emotions,
          topics,
          riskLevel: 'low',
          description: description || `${title.slice(0, 60)}（B站心理视频）`,
          durationSec,
          approved: false,
          source: 'bilibili',
          meta: {
            play,
            keyword,
            matched,
            score: Number((matched.length + Math.log10(play + 1)).toFixed(3)),
            pubdate: item.pubdate
          }
        });
        keywordCount += 1;
      }
      await sleep(args.delayMs);
    }
    console.log(`关键词「${keyword}」新增候选 ${keywordCount} 条`);
  }

  const selected = collected.sort((a, b) => b.meta.score - a.meta.score).slice(0, args.limit);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'bilibili',
    keywords: args.keywords,
    stats: { ...stats, collected: collected.length, written: selected.length },
    items: selected
  };
  fs.writeFileSync(PENDING_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log('--- 采集完成 ---');
  console.log(`请求 ${stats.requests} 次，失败 ${stats.failedRequests} 次`);
  console.log(
    `原始 ${stats.rawItems} 条 | 去重 ${stats.skippedDuplicate} | 已入库 ${stats.skippedExisting} | 时长不符 ${stats.skippedDuration} | 播放量不足 ${stats.skippedPlay} | 不相关 ${stats.skippedIrrelevant}`
  );
  console.log(`有效候选 ${collected.length} 条，写入 ${selected.length} 条 -> ${PENDING_PATH}`);
  console.log('请打开该文件，把要入库的条目改成 "approved": true，然后运行: npm run videos:merge');
}

main().catch((error) => {
  console.error('采集失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
