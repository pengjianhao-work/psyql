/**
 * 公开热榜抓取：微博热搜 / 知乎热榜 / B站热门。
 * 全部 best-effort：单个源失败不影响其他源，抓不到就返回空数组。
 */

export interface HotItem {
  title: string;
  heat: number;
  source: 'weibo' | 'zhihu' | 'bilibili';
  url?: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 10_000;

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function toHeat(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function fetchWeibo(): Promise<HotItem[]> {
  const data = (await fetchJson('https://weibo.com/ajax/side/hotSearch')) as {
    data?: { realtime?: Array<{ word?: string; note_num?: number; label_name?: string }> };
  };
  return (data.data?.realtime ?? [])
    .map((item) => ({
      title: String(item.word || '').trim(),
      heat: toHeat(item.note_num),
      source: 'weibo' as const
    }))
    .filter((item) => item.title);
}

async function fetchZhihu(): Promise<HotItem[]> {
  const data = (await fetchJson('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50', {
    Referer: 'https://www.zhihu.com/hot'
  })) as { data?: Array<{ target?: { title?: string; excerpt?: string }; detail_text?: string }> };
  return (data.data ?? [])
    .map((item) => ({
      title: String(item.target?.title || item.detail_text || '').trim(),
      heat: 0,
      source: 'zhihu' as const
    }))
    .filter((item) => item.title);
}

async function fetchBilibili(): Promise<HotItem[]> {
  const data = (await fetchJson('https://api.bilibili.com/x/web-interface/popular?ps=20')) as {
    data?: { list?: Array<{ title?: string; stat?: { view?: number } }> };
  };
  return (data.data?.list ?? [])
    .map((item) => ({
      title: String(item.title || '').trim(),
      heat: toHeat(item.stat?.view),
      source: 'bilibili' as const
    }))
    .filter((item) => item.title);
}

export async function fetchAllHotLists(): Promise<HotItem[]> {
  const results = await Promise.allSettled([fetchWeibo(), fetchZhihu(), fetchBilibili()]);
  const items: HotItem[] = [];
  const labels = ['weibo', 'zhihu', 'bilibili'];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
      console.log(`[trend] ${labels[i]}: ${result.value.length} 条`);
    } else {
      console.warn(`[trend] ${labels[i]} 抓取失败:`, result.reason instanceof Error ? result.reason.message : result.reason);
    }
  });
  return items;
}
