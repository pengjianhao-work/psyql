/**
 * 公开热榜抓取：微博 / 知乎 / B站热搜 / 百度热搜 / 头条热榜。
 * 全部 best-effort：单个源失败不影响其他源，抓不到就返回空数组。
 * 微博和知乎需要登录 Cookie（环境变量 WEIBO_HOT_COOKIE / ZHIHU_HOT_COOKIE），
 * 没有 Cookie 时自动跳过；百度、B站、头条无需登录。
 */

export interface HotItem {
  title: string;
  heat: number;
  source: 'weibo' | 'zhihu' | 'bilibili' | 'baidu' | 'toutiao';
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
  const cookie = process.env.WEIBO_HOT_COOKIE;
  if (!cookie) return [];
  const data = (await fetchJson('https://weibo.com/ajax/side/hotSearch', {
    Cookie: cookie,
    Referer: 'https://weibo.com/hot/search'
  })) as {
    data?: { realtime?: Array<{ word?: string; note_num?: number }> };
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
  const cookie = process.env.ZHIHU_HOT_COOKIE;
  if (!cookie) return [];
  const data = (await fetchJson(
    'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50',
    {
      Cookie: cookie,
      Referer: 'https://www.zhihu.com/hot'
    }
  )) as { data?: Array<{ target?: { title?: string } }> };
  return (data.data ?? [])
    .map((item) => ({
      title: String(item.target?.title || '').trim(),
      heat: 0,
      source: 'zhihu' as const
    }))
    .filter((item) => item.title);
}

async function fetchBilibili(): Promise<HotItem[]> {
  const data = (await fetchJson('https://api.bilibili.com/x/web-interface/wbi/search/square?limit=20')) as {
    data?: { trending?: { list?: Array<{ keyword?: string; show_name?: string; heat_score?: number }> } };
  };
  return (data.data?.trending?.list ?? [])
    .map((item) => ({
      title: String(item.show_name || item.keyword || '').trim(),
      heat: toHeat(item.heat_score),
      source: 'bilibili' as const
    }))
    .filter((item) => item.title);
}

async function fetchBaidu(): Promise<HotItem[]> {
  const data = (await fetchJson('https://top.baidu.com/api/board?platform=wise&tab=realtime')) as {
    data?: { cards?: Array<{ content?: Array<{ content?: Array<{ word?: string; isTop?: boolean }> }> }> };
  };
  const words = (data.data?.cards ?? [])
    .flatMap((card) => card.content ?? [])
    .flatMap((group) => group.content ?? [])
    .map((item) => String(item.word || '').trim())
    .filter(Boolean);
  // 百度接口不返回热度数值，按排名给递减分，保证排序稳定
  return words.map((title, i) => ({ title, heat: words.length - i, source: 'baidu' as const }));
}

async function fetchToutiao(): Promise<HotItem[]> {
  const data = (await fetchJson('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc')) as {
    data?: Array<{ Title?: string; Url?: string }>;
  };
  return (data.data ?? [])
    .map((item) => ({
      title: String(item.Title || '').trim(),
      heat: 0,
      source: 'toutiao' as const,
      url: item.Url
    }))
    .filter((item) => item.title);
}

export async function fetchAllHotLists(): Promise<HotItem[]> {
  const results = await Promise.allSettled([
    fetchWeibo(),
    fetchZhihu(),
    fetchBilibili(),
    fetchBaidu(),
    fetchToutiao()
  ]);
  const items: HotItem[] = [];
  const labels = ['weibo', 'zhihu', 'bilibili', 'baidu', 'toutiao'];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
      console.log(`[trend] ${labels[i]}: ${result.value.length} 条`);
    } else {
      console.warn(
        `[trend] ${labels[i]} 抓取失败:`,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  });
  return items;
}
