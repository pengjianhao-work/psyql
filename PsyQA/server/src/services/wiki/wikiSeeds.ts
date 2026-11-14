/**
 * LLM Wiki 的种子与来源选择。
 * 种子来自带人工标签的 mental_dataset（1264 条，10 类）；来源只取 vector_documents，
 * 因为来源必须带真实 doc id，才能透传到回答引用里。
 */

import fs from 'fs';
import { resolveDataFile } from '../../config/paths';
import { getDb } from '../../db/database';
import { getCategoryName, ProblemCategory } from '../psych/emotionService';
import { extractChineseNGrams } from '../../utils/textProcessor';
import { WikiSourceRef } from './wikiTypes';

export const WIKI_CATEGORIES: ProblemCategory[] = [
  'academic_stress',
  'emotion_regulation',
  'interpersonal',
  'family_relationship',
  'romantic_relationship',
  'career_future',
  'self_identity',
  'body_image',
  'addiction',
  'trauma'
];

const SOURCE_SQL =
  'SELECT id, question, answer, content FROM vector_documents' +
  ' WHERE (question LIKE ? OR content LIKE ?)' +
  ' AND length(answer) >= 60' +
  ' LIMIT ?';

const STOPWORDS = /^(可以|如果|怎么|什么|这个|那个|我们|你们|他们|就是|不是|还是|因为|所以|但是|然后|或者|觉得|自己|一个|没有|时候|现在|可能|应该)$/;

export interface SeedEntry {
  question: string;
  answer: string;
  problems: ProblemCategory[];
}

interface VectorRow {
  id: string;
  question: string;
  answer: string;
  content: string;
}

let datasetCache: SeedEntry[] | null = null;

export function loadTaggedKnowledge(): SeedEntry[] {
  if (datasetCache) return datasetCache;
  const dataset = JSON.parse(fs.readFileSync(resolveDataFile('mental_dataset.json'), 'utf-8')) as {
    knowledge?: Array<{ question?: string; answer?: string; tags?: { problems?: ProblemCategory[] } }>;
  };
  datasetCache = (dataset.knowledge || [])
    .map((item) => ({
      question: String(item.question || '').trim(),
      answer: String(item.answer || '').trim(),
      problems: (item.tags?.problems || []) as ProblemCategory[]
    }))
    .filter((item) => item.question && item.answer);
  return datasetCache;
}

function tokensOf(text: string): string[] {
  return Array.from(
    new Set(
      extractChineseNGrams(text, 2, 3).filter((token) => {
        if (token.length < 2) return false;
        if (/^\d+$/.test(token)) return false;
        return !STOPWORDS.test(token);
      })
    )
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((token) => {
    if (b.has(token)) inter += 1;
  });
  return inter / (a.size + b.size - inter);
}

/** 同一分类内贪心选差异最大的种子，避免 8 页都在讲同一件事。 */
export function selectCategorySeeds(category: ProblemCategory, limit: number): SeedEntry[] {
  const pool = loadTaggedKnowledge().filter((item) => item.problems.includes(category));
  const seeds: SeedEntry[] = [];
  const pickedTokens: Array<Set<string>> = [];
  const remaining = [...pool];

  while (seeds.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    remaining.forEach((item, index) => {
      const tokens = new Set(tokensOf(item.question + item.answer));
      const maxSimilarity = pickedTokens.length
        ? Math.max(...pickedTokens.map((picked) => jaccard(tokens, picked)))
        : 0;
      if (maxSimilarity < bestScore) {
        bestScore = maxSimilarity;
        bestIndex = index;
      }
    });
    const [chosen] = remaining.splice(bestIndex, 1);
    seeds.push(chosen);
    pickedTokens.push(new Set(tokensOf(chosen.question + chosen.answer)));
  }
  return seeds;
}

function queryVectorDocs(token: string, limit: number): VectorRow[] {
  const like = '%' + token + '%';
  try {
    return getDb().prepare(SOURCE_SQL).all(like, like, limit) as VectorRow[];
  } catch {
    return [];
  }
}

/** 优先按问题关键词取来源，不够时按分类词兜底。 */
export function collectSourceRefs(seedQuestion: string, category: ProblemCategory, limit = 8): WikiSourceRef[] {
  const keywords = tokensOf(seedQuestion).slice(0, 6);
  const categoryTokens = tokensOf(getCategoryName(category));
  const seen = new Map<string, WikiSourceRef>();
  const attempts = [...keywords, ...categoryTokens];

  for (const token of attempts) {
    for (const row of queryVectorDocs(token, 40)) {
      if (seen.has(row.id)) continue;
      const overlap = keywords.filter((kw) => row.question.includes(kw) || row.content.includes(kw)).length;
      if (overlap === 0 && seen.size >= limit) continue;
      seen.set(row.id, {
        docId: row.id,
        question: row.question.trim().slice(0, 120),
        answer: row.answer.trim().slice(0, 320)
      });
      if (seen.size >= limit) break;
    }
    if (seen.size >= limit) break;
  }

  return Array.from(seen.values());
}
