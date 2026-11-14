/**
 * LLM Wiki 存储层：wiki_documents 表 + 已发布页内存缓存。
 * 缓存只在写库 / 状态变更 / reload 时失效；在线检索走缓存，不打 DB。
 */

import { getDb } from '../../db/database';
import {
  WikiListParams,
  WikiListResult,
  WikiPage,
  WikiPageWithEmbedding,
  WikiSourceRef,
  WikiStatus
} from './wikiTypes';

const PUBLISHED_CACHE_TTL_MS = 5 * 60 * 1000;

const UPSERT_SQL = [
  'INSERT INTO wiki_documents',
  '(id, title, category, summary, sections_json, related_json, sources_json,',
  ' embedding_json, status, model, prompt_hash, updated_at)',
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  'ON CONFLICT(id) DO UPDATE SET',
  'title = excluded.title,',
  'category = excluded.category,',
  'summary = excluded.summary,',
  'sections_json = excluded.sections_json,',
  'related_json = excluded.related_json,',
  'sources_json = excluded.sources_json,',
  'embedding_json = COALESCE(excluded.embedding_json, wiki_documents.embedding_json),',
  'status = excluded.status,',
  'model = excluded.model,',
  'prompt_hash = excluded.prompt_hash,',
  'updated_at = excluded.updated_at'
].join(' ');

interface WikiRow {
  id: string;
  title: string;
  category: string;
  summary: string;
  sections_json: string;
  related_json: string;
  sources_json: string;
  embedding_json: string | null;
  status: string;
  model: string | null;
  prompt_hash: string | null;
  updated_at: string;
}

let publishedCache: { pages: WikiPageWithEmbedding[]; at: number } | null = null;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToPage(row: WikiRow): WikiPage {
  return {
    slug: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary,
    sections: parseJson(row.sections_json, []),
    relatedQuestions: parseJson(row.related_json, []),
    sourceRefs: parseJson<WikiSourceRef[]>(row.sources_json, []),
    status: (row.status as WikiStatus) || 'draft',
    model: row.model || '',
    promptHash: row.prompt_hash || '',
    updatedAt: row.updated_at
  };
}

export function resetWikiPageCache(): void {
  publishedCache = null;
}

export function upsertWikiPage(page: WikiPage, embedding: number[] | null): void {
  const now = page.updatedAt || new Date().toISOString();
  getDb()
    .prepare(UPSERT_SQL)
    .run(
      page.slug,
      page.title,
      page.category,
      page.summary,
      JSON.stringify(page.sections),
      JSON.stringify(page.relatedQuestions),
      JSON.stringify(page.sourceRefs),
      embedding ? JSON.stringify(embedding) : null,
      page.status,
      page.model,
      page.promptHash,
      now
    );
  resetWikiPageCache();
}

export function getWikiPage(slug: string): WikiPage | null {
  const row = getDb()
    .prepare('SELECT * FROM wiki_documents WHERE id = ?')
    .get(slug) as WikiRow | undefined;
  return row ? rowToPage(row) : null;
}

export function updateWikiStatus(slug: string, status: WikiStatus): boolean {
  const result = getDb()
    .prepare('UPDATE wiki_documents SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), slug);
  if (result.changes > 0) resetWikiPageCache();
  return result.changes > 0;
}

export function listWikiPages(params: WikiListParams = {}): WikiListResult {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize || 20));
  const where: string[] = [];
  const args: unknown[] = [];

  if (params.category && params.category !== 'all') {
    where.push('category = ?');
    args.push(params.category);
  }
  if (params.status && params.status !== 'all') {
    where.push('status = ?');
    args.push(params.status);
  }
  if (params.q && params.q.trim()) {
    where.push('(title LIKE ? OR summary LIKE ?)');
    const like = '%' + params.q.trim() + '%';
    args.push(like, like);
  }

  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS n FROM wiki_documents' + whereSql).get(...args) as { n: number }
  ).n;
  const rows = db
    .prepare('SELECT * FROM wiki_documents' + whereSql + ' ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(...args, pageSize, (page - 1) * pageSize) as WikiRow[];

  return {
    total,
    page,
    pageSize,
    items: rows.map((row) => {
      const wikiPage = rowToPage(row);
      return {
        slug: wikiPage.slug,
        title: wikiPage.title,
        category: wikiPage.category,
        summary: wikiPage.summary,
        status: wikiPage.status,
        updatedAt: wikiPage.updatedAt,
        sourceCount: wikiPage.sourceRefs.length,
        sectionCount: wikiPage.sections.length,
        hasEmbedding: Boolean(row.embedding_json)
      };
    })
  };
}

export function countWikiPages(status?: WikiStatus): number {
  const db = getDb();
  if (status) {
    return (db.prepare('SELECT COUNT(*) AS n FROM wiki_documents WHERE status = ?').get(status) as { n: number }).n;
  }
  return (db.prepare('SELECT COUNT(*) AS n FROM wiki_documents').get() as { n: number }).n;
}

/** 在线检索用：只加载已发布页及嵌入，整库几十到一百页，常驻内存。 */
export function loadPublishedWikiPages(force = false): WikiPageWithEmbedding[] {
  const now = Date.now();
  if (!force && publishedCache && now - publishedCache.at < PUBLISHED_CACHE_TTL_MS) {
    return publishedCache.pages;
  }
  const rows = getDb()
    .prepare("SELECT * FROM wiki_documents WHERE status = 'published'")
    .all() as WikiRow[];
  const pages = rows.map((row) => ({
    page: rowToPage(row),
    embedding: parseJson<number[] | null>(row.embedding_json, null)
  }));
  publishedCache = { pages, at: now };
  return pages;
}
