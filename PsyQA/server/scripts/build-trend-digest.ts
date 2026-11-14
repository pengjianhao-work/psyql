/**
 * 每周趋势词条构建：抓微博/知乎/B站热榜 → LLM 提炼流行语与时事 → 写 trend_terms。
 * 用法：npm run trends:build（建议每周一跑一次）
 */
import 'dotenv/config';
import { fetchAllHotLists } from '../src/services/trend/trendSources';
import { saveTrendTerms, currentWeekKey, type ExtractedTerm } from '../src/services/trend/trendService';
import { callLlmGenerate } from '../src/services/llm/llmClient';

const MAX_ITEMS = 60;

function dedupeTitles(items: { title: string; heat: number; source: string }[]): { title: string; heat: number; source: string }[] {
  const seen = new Map<string, { title: string; heat: number; source: string }>();
  for (const item of items) {
    const key = item.title.trim();
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev || item.heat > prev.heat) seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) => b.heat - a.heat).slice(0, MAX_ITEMS);
}

function parseExtractedJson(text: string): ExtractedTerm[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({
        term: String(x.term || '').trim(),
        kind: x.kind === 'slang' ? 'slang' : 'event',
        explanation: String(x.explanation || '').trim(),
        example: x.example ? String(x.example).trim() : undefined,
        heat: Number(x.heat) || 0
      }))
      .filter((x) => x.term && x.explanation);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const weekKey = currentWeekKey();
  console.log(`[trends] 构建 ${weekKey} 趋势词条`);

  const hot = dedupeTitles(await fetchAllHotLists());
  if (!hot.length) {
    console.error('[trends] 没有抓到任何热榜数据，退出');
    process.exit(1);
  }
  console.log(`[trends] 去重后 ${hot.length} 条热榜标题`);

  const listText = hot.map((h, i) => `${i + 1}. ${h.title}（${h.source}${h.heat ? `，热度${h.heat}` : ''}）`).join('\n');
  const prompt = `你是中文互联网趋势分析助手。下面是本周微博/知乎/B站/百度/头条热榜标题（带来源标注）。

${listText}

任务：从中提炼对大学生有用的词条，输出 JSON 数组（不要输出其他内容）：
[{"term":"词条名","kind":"slang|event","explanation":"一句话解释，30字内","example":"可选，一句使用示例","heat":0-100}]

规则：
- kind=slang：网络流行语、梗、缩写、新说法（如「班味」「i人」），必须是年轻人真的会用的词
- kind=event：时事热点、政策、考试安排、社会事件（学生可能关心的）
- explanation 必须准确：不确定词义就不要收录，宁缺毋滥，最多 30 条
- 优先大学生相关（学业、就业、恋爱、追星、游戏、AI、政策），纯娱乐八卦可以不收
- explanation 用大白话，心理咨询师读了能看懂`;

  const raw = await callLlmGenerate(prompt, {
    systemPrompt: '你只输出 JSON，不输出解释性文字。',
    temperature: 0.2,
    maxTokens: 4000,
    timeoutMs: 120_000
  });
  if (!raw) {
    console.error('[trends] LLM 不可用或返回为空，退出');
    process.exit(1);
  }

  const terms = parseExtractedJson(raw);
  console.log(`[trends] LLM 提炼出 ${terms.length} 条词条`);
  if (!terms.length) {
    console.error('[trends] JSON 解析失败，原始输出前 300 字：', raw.slice(0, 300));
    process.exit(1);
  }

  // LLM 给的 heat 不可靠：用词条能匹配上的热榜标题的真实热度，匹配不上按提取顺序递减
  const heatOf = (term: string): number => {
    const t = term.replace(/\s+/g, '');
    let best = 0;
    for (const h of hot) {
      const title = h.title.replace(/\s+/g, '');
      if (title.includes(t) || t.includes(title)) best = Math.max(best, h.heat);
    }
    return best;
  };
  terms.forEach((term, i) => {
    term.heat = heatOf(term.term) || MAX_ITEMS - i;
  });

  const saved = saveTrendTerms(terms, weekKey);
  console.log(`[trends] 已写入 trend_terms（week=${weekKey}），共 ${saved} 条`);

  // 热点词条沉淀为 wiki 草稿页（draft 需管理员审核后才上线）；失败不影响词条入库
  if (!process.argv.includes('--no-wiki')) {
    try {
      const { buildTrendWikiPages } = await import('../src/services/wiki/trendWikiBuilder');
      const wikiResults = await buildTrendWikiPages(terms);
      for (const r of wikiResults) {
        console.log(`[trends] wiki ${r.status}: ${r.term}${r.slug ? ' -> ' + r.slug : ''}`);
      }
    } catch (err) {
      console.warn('[trends] wiki 草稿生成失败（不影响词条入库）：', err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error('[trends] 构建失败:', err);
  process.exit(1);
});
