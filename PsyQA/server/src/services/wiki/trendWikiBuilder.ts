/**
 * 把趋势词条沉淀为 LLM Wiki 草稿页。
 * 只生成 status='draft' 的页，走现有 SchoolWikiAdmin 人工审核后才参与线上检索；
 * 复用 WIKI_SYSTEM_PROMPT 的伦理约束和 validateDraft 校验，不通过就跳过不落库。
 */

import { createHash } from 'crypto';
import { embedText } from '../knowledge/embeddingService';
import { callLlmGenerate } from '../llm/llmClient';
import { getCategoryName, ProblemCategory } from '../psych/emotionService';
import { WIKI_CATEGORIES } from './wikiSeeds';
import { WIKI_SYSTEM_PROMPT, buildPromptHash, REQUIRED_HEADINGS } from './wikiPrompt';
import { validateDraft } from './wikiValidator';
import { upsertWikiPage } from './wikiStore';
import { WikiPage } from './wikiTypes';
export interface TrendWikiInput {
  term: string;
  kind?: string;
  explanation?: string;
  example?: string | null;
  source?: string | null;
  heat?: number;
}

const MAX_PAGES = 8;

function slugOf(term: string): string {
  const hash = createHash('sha256').update('trend::' + term).digest('hex').slice(0, 8);
  return 'trend-' + hash;
}

function categoryList(): string {
  return WIKI_CATEGORIES.map((c) => c + '=' + getCategoryName(c)).join('、');
}

function buildTrendWikiPrompt(term: TrendWikiInput): string {
  const schema = [
    '{',
    '  "verdict": "page|skip",',
    '  "category": "若 verdict=page，从以下分类选一个：' + categoryList() + '",',
    '  "title": "通用主题名，4-20 字",',
    '  "summary": "一句话理解，20-60 字",',
    '  "sections": [',
    '    {"heading": "' + REQUIRED_HEADINGS[0] + '", "body": "100-180 字，至少 3 句"},',
    '    {"heading": "' + REQUIRED_HEADINGS[1] + '", "body": "100-180 字，至少 3 句"},',
    '    {"heading": "' + REQUIRED_HEADINGS[2] + '", "body": "120-220 字，至少 3 句"},',
    '    {"heading": "' + REQUIRED_HEADINGS[3] + '", "body": "80-180 字，至少 3 句"}',
    '  ],',
    '  "relatedQuestions": ["2-3 个用户可能接着问的问题"]',
    '}'
  ].join('\n');

  return [
    '本周网络热词条：' + term.term,
    '类型：' + (term.kind === 'slang' ? '网络流行语/梗' : '时事热点'),
    '背景解释：' + (term.explanation || ''),
    term.example ? '使用示例：' + term.example : '',
    '来源：' + (term.source || 'unknown') + '，热度：' + (term.heat ?? 0),
    '',
    '任务：判断这个词条值不值得为大学生做一页「心理科普+自助支持」主题 wiki。',
    '- verdict=skip：纯娱乐八卦、明星绯闻、与心理/学生生活无关的时政军事新闻、不适合写成心理主题页的词',
    '- verdict=page：与大学生心理、学业、就业、人际、情绪、网络亚文化困扰相关的词（如「班味」「脆皮大学生」「考研焦虑」「AI 焦虑」这类）',
    '- 如果 verdict=page，category 必须从上面分类列表里选最贴近的一个',
    '',
    '只输出 JSON 对象，不要 markdown 代码块：',
    schema
  ]
    .filter(Boolean)
    .join('\n');
}

export interface TrendWikiResult {
  term: string;
  slug?: string;
  status: 'published_draft' | 'skipped' | 'failed';
  errors?: string[];
}

/** 为热度最高的词条生成 wiki 草稿页，返回逐条结果。 */
export async function buildTrendWikiPages(
  terms: TrendWikiInput[],
  options: { maxPages?: number; dryRun?: boolean } = {}
): Promise<TrendWikiResult[]> {
  const maxPages = Math.min(MAX_PAGES, Math.max(1, options.maxPages || MAX_PAGES));
  const results: TrendWikiResult[] = [];
  const candidates = [...terms]
    .sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0))
    .slice(0, maxPages);

  for (const term of candidates) {
    const prompt = buildTrendWikiPrompt(term);
    const promptHash = buildPromptHash([prompt]);
    const raw = await callLlmGenerate(prompt, {
      systemPrompt: WIKI_SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: 2500,
      timeoutMs: 120_000
    });

    const parsed = raw ? safeJson(raw) : null;
    if (!parsed || parsed.verdict !== 'page') {
      results.push({ term: term.term, status: 'skipped' });
      continue;
    }

    // 拼回 validateDraft 认识的格式做校验
    const validation = validateDraft(
      JSON.stringify({
        title: parsed.title,
        summary: parsed.summary,
        sections: parsed.sections,
        relatedQuestions: parsed.relatedQuestions
      }),
      String(parsed.category || '')
    );
    if (!validation.ok || !validation.draft) {
      results.push({ term: term.term, status: 'failed', errors: validation.errors });
      continue;
    }

    const category = WIKI_CATEGORIES.includes(parsed.category as ProblemCategory)
      ? (parsed.category as ProblemCategory)
      : 'other';
    const slug = slugOf(term.term);
    const page: WikiPage = {
      slug,
      title: validation.draft.title,
      category,
      summary: validation.draft.summary,
      sections: validation.draft.sections,
      relatedQuestions: validation.draft.relatedQuestions,
      sourceRefs: [],
      status: 'draft',
      model: 'trend-digest',
      promptHash,
      updatedAt: new Date().toISOString()
    };

    if (!options.dryRun) {
      let embedding: number[] | null = null;
      try {
        embedding = await embedText(
          [page.title, page.summary, ...page.sections.map((s) => s.heading + '：' + s.body)].join('\n')
        );
      } catch {
        // 嵌入失败不阻塞入库，线上语义检索会退回关键词分
      }
      upsertWikiPage(page, embedding);
    }
    results.push({ term: term.term, slug, status: 'published_draft' });
  }
  return results;
}

function safeJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
