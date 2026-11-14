/**
 * LLM Wiki 生成器：按分类选种子 -> 取真实来源 -> LLM 生成 JSON 页 -> 校验 -> 嵌入 -> 入库。
 * 校验不通过落 draft（管理员可见、线上不检索）；已存在且 promptHash 未变则跳过。
 */

import { createHash } from 'crypto';
import { embedText } from '../knowledge/embeddingService';
import { callLlmGenerate } from '../llm/llmClient';
import { getCategoryName, ProblemCategory } from '../psych/emotionService';
import { WIKI_SYSTEM_PROMPT, buildPromptHash, buildWikiUserPrompt } from './wikiPrompt';
import { WIKI_CATEGORIES, collectSourceRefs, selectCategorySeeds } from './wikiSeeds';
import { validateDraft } from './wikiValidator';
import { getWikiPage, upsertWikiPage } from './wikiStore';
import { WikiPage, WikiSourceRef } from './wikiTypes';

export interface BuildOptions {
  category?: ProblemCategory | 'all';
  /** 多分类并行 worker 用；与 category 二选一 */
  categories?: ProblemCategory[];
  perCategory?: number;
  dryRun?: boolean;
  provider?: 'zhipu' | 'ollama';
  /** 生成模型（SiliconFlow 模型名）；不传则用 WIKI_LLM_MODEL 或 Qwen2.5-72B */
  model?: string;
  sleepMs?: number;
  force?: boolean;
  maxPages?: number;
}

export type PageBuildStatus = 'published' | 'draft' | 'skipped' | 'failed';

export interface PageBuildResult {
  slug: string;
  title: string;
  category: string;
  status: PageBuildStatus;
  sourceCount: number;
  errors?: string[];
}

export interface BuildReport {
  startedAt: string;
  finishedAt: string;
  options: BuildOptions;
  totals: {
    categories: number;
    seeds: number;
    published: number;
    drafts: number;
    skipped: number;
    failed: number;
  };
  perCategory: Record<string, { total: number; published: number; drafts: number; skipped: number; failed: number }>;
  pages: PageBuildResult[];
  samples: Array<{
    slug: string;
    title: string;
    summary: string;
    sections: Array<{ heading: string; body: string }>;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugOf(category: string, question: string): string {
  const hash = createHash('sha256').update(category + '::' + question).digest('hex').slice(0, 8);
  return category + '-' + hash;
}

function embeddingInput(draft: { title: string; summary: string; sections: Array<{ heading: string; body: string }> }): string {
  return [
    '标题：' + draft.title,
    '摘要：' + draft.summary,
    ...draft.sections.map((section) => section.heading + '：' + section.body)
  ].join('\n');
}

async function callModel(
  prompt: string,
  provider: 'zhipu' | 'ollama',
  model: string
): Promise<string | null> {
  return callLlmGenerate(prompt, {
    provider,
    model: provider === 'zhipu' ? model : undefined,
    systemPrompt: WIKI_SYSTEM_PROMPT,
    temperature: 0.25,
    maxTokens: 1800,
    timeoutMs: 120_000
  });
}

function draftFromFailure(
  seedQuestion: string,
  category: ProblemCategory,
  sources: WikiSourceRef[],
  errors: string[]
): WikiPage {
  return {
    slug: slugOf(category, seedQuestion),
    title: seedQuestion.slice(0, 20),
    category,
    summary: '生成未通过校验，暂不参与检索。',
    sections: [{ heading: '校验错误', body: errors.join('；').slice(0, 300) }],
    relatedQuestions: [],
    sourceRefs: sources,
    status: 'draft',
    model: 'unknown',
    promptHash: '',
    updatedAt: new Date().toISOString()
  };
}

export async function buildLlmWiki(options: BuildOptions = {}): Promise<BuildReport> {
  const startedAt = new Date().toISOString();
  const perCategory = Math.min(20, Math.max(1, options.perCategory || 8));
  const provider = options.provider || 'zhipu';
  const model = options.model || process.env.WIKI_LLM_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  const sleepMs = Math.max(0, options.sleepMs ?? 1000);
  const categories: ProblemCategory[] =
    options.categories && options.categories.length
      ? options.categories
      : options.category && options.category !== 'all'
        ? [options.category]
        : WIKI_CATEGORIES;
  const maxPages = options.maxPages && options.maxPages > 0 ? options.maxPages : Number.POSITIVE_INFINITY;
  const pages: PageBuildResult[] = [];
  const samples: BuildReport['samples'] = [];
  const perCategoryStats: BuildReport['perCategory'] = {};
  const totalStats = { categories: categories.length, seeds: 0, published: 0, drafts: 0, skipped: 0, failed: 0 };
  let written = 0;

  for (const category of categories) {
    perCategoryStats[category] = { total: 0, published: 0, drafts: 0, skipped: 0, failed: 0 };
    const categoryLabel = getCategoryName(category);
    const seeds = selectCategorySeeds(category, perCategory);

    for (const seed of seeds) {
      if (written >= maxPages) break;
      totalStats.seeds += 1;
      perCategoryStats[category].total += 1;
      const slug = slugOf(category, seed.question);
      const sources = collectSourceRefs(seed.question, category, 8);

      if (sources.length < 3) {
        pages.push({ slug, title: seed.question.slice(0, 20), category, status: 'failed', sourceCount: sources.length, errors: ['来源少于 3 条'] });
        totalStats.failed += 1;
        perCategoryStats[category].failed += 1;
        continue;
      }

      const prompt = buildWikiUserPrompt({ seedQuestion: seed.question, categoryLabel, sources });
      const promptHash = buildPromptHash([prompt, ...sources.map((source) => source.docId)]);

      const existing = getWikiPage(slug);
      if (!options.force && existing && existing.status !== 'archived' && existing.promptHash === promptHash) {
        pages.push({ slug, title: existing.title, category, status: 'skipped', sourceCount: sources.length });
        totalStats.skipped += 1;
        perCategoryStats[category].skipped += 1;
        written += 1;
        continue;
      }

      let raw = await callModel(prompt, provider, model);
      let validation = raw ? validateDraft(raw, categoryLabel) : { ok: false, errors: ['模型没有返回内容'] };
      if (raw && !validation.ok) {
        const repairPrompt = prompt + '\n\n上一版输出未通过校验：' + validation.errors.join('；') + '。请只输出修正后的 JSON。';
        raw = await callModel(repairPrompt, provider, model);
        validation = raw ? validateDraft(raw, categoryLabel) : { ok: false, errors: ['修复调用没有返回内容'] };
      }

      if (!raw || !validation.ok || !validation.draft) {
        const failedErrors = validation.errors;
        if (!options.dryRun) {
          upsertWikiPage(draftFromFailure(seed.question, category, sources, failedErrors), null);
        }
        pages.push({ slug, title: seed.question.slice(0, 20), category, status: 'draft', sourceCount: sources.length, errors: failedErrors });
        totalStats.drafts += 1;
        perCategoryStats[category].drafts += 1;
        if (sleepMs) await sleep(sleepMs);
        continue;
      }

      const draft = validation.draft;
      const page: WikiPage = {
        slug,
        title: draft.title,
        category,
        summary: draft.summary,
        sections: draft.sections,
        relatedQuestions: draft.relatedQuestions,
        sourceRefs: sources,
        status: 'published',
        model: provider === 'zhipu' ? model : provider,
        promptHash,
        updatedAt: new Date().toISOString()
      };

      if (samples.length < 3) {
        samples.push({ slug, title: page.title, summary: page.summary, sections: page.sections });
      }

      if (!options.dryRun) {
        let embedding: number[] | null = null;
        try {
          embedding = await embedText(embeddingInput(page));
        } catch (err) {
          console.warn('[wiki] 嵌入失败，仅保存正文：', err instanceof Error ? err.message : err);
        }
        upsertWikiPage(page, embedding);
      }

      pages.push({ slug, title: page.title, category, status: 'published', sourceCount: sources.length });
      totalStats.published += 1;
      perCategoryStats[category].published += 1;
      written += 1;
      if (sleepMs) await sleep(sleepMs);
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    options: { ...options, perCategory, provider, model, sleepMs },
    totals: totalStats,
    perCategory: perCategoryStats,
    pages,
    samples
  };
}
