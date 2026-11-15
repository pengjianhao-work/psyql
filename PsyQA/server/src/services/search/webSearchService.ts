/**
 * 实时联网检索：给大模型补"知识库里没有的最新背景"（比赛结果、新闻、版本更新等）。
 *
 * Provider 策略：
 * - 配置了 API key 就先走 API（Tavily → Serper → Bing），拿够结果就不再打免费源；
 * - 否则并行跑免费源（百度 → B站 → DuckDuckGo → 维基），全部 best-effort。
 * 整体受 budgetMs 预算约束，超时或任何异常返回已拿到的部分或 []，
 * 绝不拖垮正常回答。
 *
 * 环境变量：
 *   PSYQA_WEB_SEARCH=0        关闭联网检索
 *   TAVILY_API_KEY            https://tavily.com 申请
 *   SERPER_API_KEY            https://serper.dev 申请
 *   BING_SEARCH_KEY           Azure Bing Search 申请
 */

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  source: 'tavily' | 'serper' | 'bing' | 'baidu' | 'so360' | 'duckduckgo' | 'wikipedia' | 'bilibili';
  publishedAt?: string;
}

export interface WebSearchOptions {
  /** 整个检索链的总预算，默认 4000ms */
  budgetMs?: number;
  maxResults?: number;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_BUDGET_MS = 4_000;
const PER_REQUEST_TIMEOUT_MS = 6_000;

export function isWebSearchEnabled(): boolean {
  return process.env.PSYQA_WEB_SEARCH !== '0';
}

/** 时效性意号：强事件词直接触发；弱时间词要和领域名词同现才触发，避免"我最近压力很大"误搜。 */
const STRONG_FRESH_PATTERN =
  /比赛|比分|赛事|赛程|排名|输了|赢了|夺冠|冠军|热搜|新闻|直播|攻略|发布会|新歌|新剧|新番|票房|油价|房价|汇率|降价|涨价|世界杯|奥运会?|KPL|LPL|王者荣耀|英雄联盟|英雄联盟手游|无畏契约|VALORANT|DOTA|CS2|CS:GO|GPT|Sora|大模型|AI绘画|哪吒|流浪地球|新版本|版本更新|更新了|上线了|发布了/;
const WEAK_TIME_PATTERN = /最近|今天|昨天|刚刚|刚才|最新|这周|本周|这星期|今年|现在/;
const DOMAIN_NOUN_PATTERN =
  /比赛|新闻|版本|游戏|电影|电视剧|剧|歌|专辑|手机|电脑|车|房|股票|基金|政策|法规|技术|产品|模型|大赛|赛事|公告|活动|演唱会|展览|新茶|油价|房价|汇率|降价|大模型|AI|冠军|热搜|直播|攻略|赛程|比分|排名|发布|上线|更新|动画|综艺|选秀|代言|联名/;

export function needsFreshWebSearch(text: string): boolean {
  if (!text.trim()) return false;
  if (STRONG_FRESH_PATTERN.test(text)) return true;
  return WEAK_TIME_PATTERN.test(text) && DOMAIN_NOUN_PATTERN.test(text);
}

function clip(text: string, max: number): string {
  const clean = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|#x27|ensp|nbsp|mdash|hellip);/gi, ' ')
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const n = Number(code);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length <= max ? clean : clean.slice(0, max) + '…';
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = PER_REQUEST_TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchHtml(url: string, timeoutMs = PER_REQUEST_TIMEOUT_MS): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

interface ApiProvider {
  name: 'tavily' | 'serper' | 'bing';
  run: (query: string, maxResults: number, timeoutMs: number) => Promise<WebResult[]>;
}

async function searchTavily(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const data = (await fetchJson(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: maxResults, search_depth: 'basic' })
    },
    timeoutMs
  )) as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
  return (data.results ?? [])
    .map((item) => ({
      title: clip(item.title || '', 80),
      url: String(item.url || ''),
      snippet: clip(item.content || '', 160),
      source: 'tavily' as const,
      publishedAt: item.published_date
    }))
    .filter((item) => item.title && item.url);
}

async function searchSerper(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const data = (await fetchJson(
    'https://google.serper.dev/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: maxResults })
    },
    timeoutMs
  )) as { organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }> };
  return (data.organic ?? [])
    .map((item) => ({
      title: clip(item.title || '', 80),
      url: String(item.link || ''),
      snippet: clip(item.snippet || '', 160),
      source: 'serper' as const,
      publishedAt: item.date
    }))
    .filter((item) => item.title && item.url);
}

async function searchBing(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const key = process.env.BING_SEARCH_KEY;
  if (!key) return [];
  const url =
    'https://api.bing.microsoft.com/v7.0/search?q=' +
    encodeURIComponent(query) +
    `&count=${maxResults}&mkt=zh-CN`;
  const data = (await fetchJson(url, { headers: { 'Ocp-Apim-Subscription-Key': key } }, timeoutMs)) as {
    webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string; datePublished?: string }> };
  };
  return (data.webPages?.value ?? [])
    .map((item) => ({
      title: clip(item.name || '', 80),
      url: String(item.url || ''),
      snippet: clip(item.snippet || '', 160),
      source: 'bing' as const,
      publishedAt: item.datePublished
    }))
    .filter((item) => item.title && item.url);
}

type FreeProvider = (query: string, maxResults: number, timeoutMs: number) => Promise<WebResult[]>;

/** 百度网页搜索：h3>a 提取标题链接；摘要取该条结果块内的可见文本（c-abstract 等 class 经常变）。 */
async function searchBaidu(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const html = await fetchHtml(
    'https://www.baidu.com/s?wd=' + encodeURIComponent(query) + `&rn=${maxResults * 2}`,
    timeoutMs
  );
  const titleRe = /<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches: Array<{ url: string; title: string; end: number; nextStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null) {
    matches.push({ url: m[1], title: m[2], end: m.index + m[0].length, nextStart: -1 });
  }
  for (let i = 0; i < matches.length - 1; i += 1) matches[i].nextStart = matches[i + 1].end;

  const results: WebResult[] = [];
  const seen = new Set<string>();
  for (const item of matches) {
    if (results.length >= maxResults) break;
    if (!item.url.startsWith('http') || seen.has(item.url)) continue;
    seen.add(item.url);
    const segment = html.slice(item.end, item.nextStart > 0 ? item.nextStart : item.end + 4000);
    const snippet = clip(
      segment
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' '),
      160
    );
    results.push({ title: clip(item.title, 80), url: item.url, snippet, source: 'baidu' });
  }
  return results;
}

/** DuckDuckGo lite 结果页是纯 HTML 表格，best-effort 正则提取。 */
async function searchDuckDuckGo(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const html = await fetchHtml(
    'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query),
    timeoutMs
  );
  const results: WebResult[] = [];
  const linkRe = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1]);
  let i = 0;
  while ((m = linkRe.exec(html)) !== null && results.length < maxResults) {
    let url = m[1];
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//.test(url)) continue;
    results.push({
      title: clip(m[2], 80),
      url,
      snippet: clip(snippets[i] || '', 160),
      source: 'duckduckgo'
    });
    i += 1;
  }
  return results;
}

async function searchWikipedia(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const url =
    'https://zh.wikipedia.org/w/api.php?action=opensearch&namespace=0&limit=' +
    maxResults +
    '&search=' +
    encodeURIComponent(query) +
    '&format=json&origin=*';
  const data = (await fetchJson(url, {}, timeoutMs)) as [string, string[], string[], string[]];
  const titles = data?.[1] ?? [];
  const descs = data?.[2] ?? [];
  const urls = data?.[3] ?? [];
  return titles
    .map((title, idx) => ({
      title: clip(title, 80),
      url: urls[idx] || '',
      snippet: clip(descs[idx] || '', 160),
      source: 'wikipedia' as const
    }))
    .filter((item) => item.title && item.url);
}

/** 必应中文网页版：li.b_algo 块内 h2>a 标题 + p.b_lineclamp 摘要。 */
async function searchBingHtml(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const html = await fetchHtml(
    'https://cn.bing.com/search?q=' + encodeURIComponent(query) + `&mkt=zh-CN&count=${maxResults * 2}`,
    timeoutMs
  );
  const results: WebResult[] = [];
  const blockRe = /<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|<li class="b_ans|$)/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(html)) !== null && results.length < maxResults) {
    const seg = block[0];
    const link = seg.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = link[1];
    if (!/^https?:\/\//.test(url)) continue;
    const snip = seg.match(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    results.push({
      title: clip(link[2], 80),
      url,
      snippet: clip(snip?.[1] || '', 160),
      source: 'bing'
    });
  }
  return results;
}

/** 360 搜索：h3.title>a 标题 + res-desc 摘要，按出现顺序配对，结构经常变。 */
async function searchSo360(query: string, maxResults: number, timeoutMs: number): Promise<WebResult[]> {
  const html = await fetchHtml(
    'https://www.so.com/s?q=' + encodeURIComponent(query),
    timeoutMs
  );
  const titles: Array<{ url: string; title: string }> = [];
  const titleRe = /<h3[^>]*class="title"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null && titles.length < maxResults * 2) {
    if (/^https?:\/\//.test(m[1])) titles.push({ url: m[1], title: m[2] });
  }
  const descRe = /class="res-desc"[^>]*>([\s\S]*?)<\/p>/gi;
  const descs: string[] = [];
  while ((m = descRe.exec(html)) !== null && descs.length < titles.length) {
    descs.push(m[1]);
  }
  return titles.slice(0, maxResults).map((t, i) => ({
    title: clip(t.title, 80),
    url: t.url,
    snippet: clip(descs[i] || '', 160),
    source: 'so360' as const
  }));
}

// B站视频搜索接口有 wbi 签名 + 412 风控，免费直连不可用；配 API key 或后续接入签名再加回。
// 搜狗网页版有验证码风控，实测不稳定，不作为免费源。
const FREE_PROVIDERS: Array<{ name: WebResult['source']; run: FreeProvider }> = [
  { name: 'bing', run: searchBingHtml },
  { name: 'baidu', run: searchBaidu },
  { name: 'so360', run: searchSo360 },
  { name: 'duckduckgo', run: searchDuckDuckGo },
  { name: 'wikipedia', run: searchWikipedia }
];

/**
 * 联网搜索。API 源（若配置）先串行尝试，拿够结果即返回；
 * 否则免费源并行竞速，合并去重后按序截断。
 */
export async function searchWeb(query: string, options: WebSearchOptions = {}): Promise<WebResult[]> {
  if (!isWebSearchEnabled() || !query.trim()) return [];
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxResults = Math.max(1, Math.min(8, options.maxResults || 5));
  const deadline = Date.now() + budgetMs;

  const apis: ApiProvider[] = [];
  if (process.env.TAVILY_API_KEY) apis.push({ name: 'tavily', run: searchTavily });
  if (process.env.SERPER_API_KEY) apis.push({ name: 'serper', run: searchSerper });
  if (process.env.BING_SEARCH_KEY) apis.push({ name: 'bing', run: searchBing });

  const results: WebResult[] = [];
  const seen = new Set<string>();
  const pushUnique = (items: WebResult[]) => {
    for (const item of items) {
      if (results.length >= maxResults) return;
      const key = item.url || item.title;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  };

  for (const api of apis) {
    const remain = deadline - Date.now();
    if (remain <= 300 || results.length >= Math.min(3, maxResults)) break;
    try {
      pushUnique(await api.run(query, maxResults, Math.min(remain, PER_REQUEST_TIMEOUT_MS)));
    } catch (err) {
      console.warn(`[web-search] ${api.name} 失败:`, err instanceof Error ? err.message : err);
    }
  }

  if (results.length < maxResults) {
    const remain = deadline - Date.now();
    if (remain > 300) {
      const settled = await Promise.allSettled(
        FREE_PROVIDERS.map((p) =>
          p.run(query, maxResults, Math.min(remain, PER_REQUEST_TIMEOUT_MS)).catch((err) => {
            console.warn(`[web-search] ${p.name} 失败:`, err instanceof Error ? err.message : err);
            return [] as WebResult[];
          })
        )
      );
      // 免费源按 providers 顺序合并：百度/B站优先于 DDG/维基
      settled.forEach((r) => {
        if (r.status === 'fulfilled') pushUnique(r.value);
      });
    }
  }
  return results.slice(0, maxResults);
}

const SOURCE_LABEL: Record<WebResult['source'], string> = {
  tavily: 'Tavily',
  serper: 'Google',
  bing: 'Bing',
  baidu: '百度',
  so360: '360搜索',
  duckduckgo: 'DuckDuckGo',
  wikipedia: '维基百科',
  bilibili: 'B站'
};

/** 注入提示词的实时背景：标明是联网结果、可能不完整，引导模型只作背景。 */
export function formatWebResultsForPrompt(results: WebResult[]): string {
  if (!results.length) return '';
  const lines = results.map((item) => {
    const date = item.publishedAt ? `（${item.publishedAt.slice(0, 10)}）` : '';
    return `· [${SOURCE_LABEL[item.source]}] ${item.title}${date}：${item.snippet} ${item.url}`;
  });
  return (
    '以下是联网搜索到的实时结果，仅供你了解最新背景（如比赛、新闻、版本动态）。' +
    '信息可能不完整或已过时，不要当成知识库事实逐字引用；拿不准的细节（比分、日期、人名）如实说明不确定。\n' +
    lines.join('\n')
  );
}
