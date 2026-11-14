/**
 * LLM Wiki 在线检索：只读已发布页（内存缓存），默认关键词打分（快、无网络），
 * 设置 PSYQA_WIKI_SEMANTIC=1 时尝试用页面嵌入做语义分（120ms 预算，拿不到就退回关键词）。
 * 任何异常都返回 []，绝不让 wiki 拖慢或拖垮正常回答。
 */

import { cosineSimilarity, embedText } from '../knowledge/embeddingService';
import { extractChineseNGrams } from '../../utils/textProcessor';
import { loadPublishedWikiPages } from './wikiStore';
import { WikiHit, WikiPage } from './wikiTypes';

const DEFAULT_BUDGET_MS = 120;
const MIN_SCORE = 0.06;

export function isWikiEnabled(): boolean {
  return process.env.PSYQA_WIKI_ENABLED !== '0';
}

function tokensOf(text: string): Set<string> {
  return new Set(extractChineseNGrams(text, 2, 3));
}

function pageText(page: WikiPage): string {
  return [
    page.title,
    page.summary,
    ...page.sections.map((section) => section.heading + ' ' + section.body)
  ].join(' ');
}

function keywordScore(queryTokens: Set<string>, page: WikiPage): number {
  const pageTokens = tokensOf(pageText(page));
  if (!pageTokens.size || !queryTokens.size) return 0;
  let hit = 0;
  queryTokens.forEach((token) => {
    if (pageTokens.has(token)) hit += 1;
  });
  return hit / Math.max(8, Math.min(queryTokens.size, 24));
}

function semanticEnabled(): boolean {
  return process.env.PSYQA_WIKI_SEMANTIC === '1';
}

async function embedQueryWithBudget(query: string, budgetMs: number): Promise<number[] | null> {
  if (!semanticEnabled()) return null;
  try {
    return await Promise.race([
      embedText(query),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), budgetMs))
    ]);
  } catch {
    return null;
  }
}

export interface WikiSearchOptions {
  category?: string;
  topK?: number;
  budgetMs?: number;
}

export async function searchWiki(
  query: string,
  options: WikiSearchOptions = {}
): Promise<WikiHit[]> {
  if (!isWikiEnabled() || !query.trim()) return [];
  try {
    const pages = loadPublishedWikiPages();
    if (!pages.length) return [];
    const topK = Math.max(1, Math.min(3, options.topK || 2));
    const queryTokens = tokensOf(query);
    const queryVector = await embedQueryWithBudget(query, options.budgetMs || DEFAULT_BUDGET_MS);
    // 同分类页足够时优先只在本分类内取，避免"与父母沟通"这类跨分类页蹭关键词
    const sameCategory =
      options.category && options.category !== 'other'
        ? pages.filter((item) => item.page.category === options.category)
        : [];
    const candidates = sameCategory.length >= topK ? sameCategory : pages;

    const scored = candidates
      .map(({ page, embedding }) => {
        const keyword = keywordScore(queryTokens, page);
        const semantic = queryVector && embedding && embedding.length === queryVector.length
          ? cosineSimilarity(queryVector, embedding)
          : 0;
        let score = semantic > 0 ? semantic * 0.7 + keyword * 0.3 : keyword;
        if (options.category && options.category !== 'other' && page.category === options.category) {
          score += 0.08;
        }
        return { page, score };
      })
      .filter((item) => item.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ page, score }) => ({
      slug: page.slug,
      title: page.title,
      category: page.category,
      summary: page.summary,
      sections: page.sections,
      score,
      sourceDocIds: page.sourceRefs.map((source) => source.docId)
    }));
  } catch (err) {
    console.warn('[wiki] 检索失败，跳过 wiki：', err instanceof Error ? err.message : err);
    return [];
  }
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max) + '…';
}

/** 注入回答提示词的"主题背景"：只给背景，不让模型照抄或据此诊断。 */
export function formatWikiForPrompt(hits: WikiHit[]): string {
  if (!hits.length) return '';
  // 只给模型一张最短的背景卡：用于组织思路，不喧宾夺主
  const hit = hits[0];
  const points = hit.sections
    .map((section) => section.heading + '：' + clip(section.body, 70))
    .join('；');
  return '【' + hit.title + '】' + clip(hit.summary, 60) + '\n要点：' + points;
}
