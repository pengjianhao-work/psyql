import fs from 'fs';
import { readJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';
import { getDb, getMeta, setMeta } from '../../db/database';

/**
 * L2 层记忆：从对话中蒸馏出的「事实/偏好/稳定模式」。
 * 与 L1（原始对话向量+memory_meta 标签）和 L3（月/年总结、画像）分层：
 * - L1：可逐条查看/归档/删除的原始对话记忆
 * - L2：本文件，聚合后的稳定事实，用户可编辑/删除，注入 Agent prompt
 * - L3：portrait / monthlySummaries / annualReports，由现有服务生成
 */

export type UserFactCategory =
  | 'emotion'
  | 'relationship'
  | 'academic'
  | 'habit'
  | 'preference'
  | 'context';

export type UserFactConfidence = 'low' | 'medium' | 'high';

export interface UserFact {
  id: string;
  fact: string;
  category: UserFactCategory;
  confidence: UserFactConfidence;
  /** 同一事实被独立对话反复印证的次数 */
  occurrences: number;
  /** 来源对话 dialog_time（截断保留最近 10 条） */
  sourceDialogTimes: string[];
  /** active 展示并注入 prompt；archived 仅保留记录 */
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface UserFactDraft {
  fact: string;
  category: UserFactCategory;
  confidence: UserFactConfidence;
}

interface UserFactFile {
  byUser: Record<
    string,
    {
      facts: UserFact[];
      lastDistillAt?: string;
      distilledCount?: number;
    }
  >;
}

const FACT_CATEGORIES = new Set<UserFactCategory>([
  'emotion',
  'relationship',
  'academic',
  'habit',
  'preference',
  'context'
]);

interface FactRow {
  id: string;
  user_id: string;
  fact: string;
  category: string;
  confidence: string;
  occurrences: number;
  source_dialog_times: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToFact(row: FactRow): UserFact {
  let sourceDialogTimes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.source_dialog_times);
    if (Array.isArray(parsed)) sourceDialogTimes = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    sourceDialogTimes = [];
  }
  return {
    id: row.id,
    fact: row.fact,
    category: (FACT_CATEGORIES.has(row.category as UserFactCategory) ? row.category : 'context') as UserFactCategory,
    confidence: (['low', 'medium', 'high'].includes(row.confidence) ? row.confidence : 'medium') as UserFactConfidence,
    occurrences: row.occurrences,
    sourceDialogTimes,
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

let jsonImportChecked = false;

function ensureFactsJsonImported(): void {
  if (jsonImportChecked) return;
  jsonImportChecked = true;
  if (getMeta('user_facts_json_imported') !== null) return;
  const legacyPath = resolveDataFile('user_facts.json');
  try {
    if (fs.existsSync(legacyPath)) {
      importUserFactsFromJson(legacyPath);
    }
    setMeta('user_facts_json_imported', new Date().toISOString());
  } catch (err) {
    console.warn('[user-facts] legacy JSON import failed:', err instanceof Error ? err.message : err);
  }
}

export function normalizeFactText(text: string): string {
  return text
    .replace(/[\s，。！？；：、,.!?;:()（）\[\]【】《》<>-—_]+/g, '')
    .toLowerCase();
}

/** 简单字符 bigram Jaccard，用于事实去重合并（不引入向量依赖） */
export function factSimilarity(a: string, b: string): number {
  const na = normalizeFactText(a);
  const nb = normalizeFactText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const grams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(na);
  const gb = grams(nb);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  const union = ga.size + gb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function nextFactId(): string {
  return `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 写入一条蒸馏事实：同分类下与已有 active 事实相似度 ≥0.55 视为同一事实，
 * 合并为 occurrences+1 并更新置信度/来源，不重复新增。
 */
export function upsertUserFact(
  userId: string,
  draft: UserFactDraft,
  sourceDialogTime?: string
): UserFact | null {
  const factText = draft.fact.trim();
  if (!factText || factText.length < 4 || factText.length > 120) return null;
  const category = FACT_CATEGORIES.has(draft.category) ? draft.category : 'context';
  const confidence = ['low', 'medium', 'high'].includes(draft.confidence)
    ? draft.confidence
    : 'medium';

  ensureFactsJsonImported();
  const db = getDb();
  const now = new Date().toISOString();

  return db.transaction((): UserFact | null => {
    const rows = db
      .prepare('SELECT * FROM user_facts WHERE user_id = ? AND status = ? AND category = ?')
      .all(userId, 'active', category) as FactRow[];

    let best: UserFact | null = null;
    let bestScore = 0;
    for (const row of rows) {
      const f = rowToFact(row);
      const score = factSimilarity(f.fact, factText);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }

    if (best && bestScore >= 0.55) {
      best.occurrences += 1;
      best.updatedAt = now;
      if (sourceDialogTime && !best.sourceDialogTimes.includes(sourceDialogTime)) {
        best.sourceDialogTimes.push(sourceDialogTime);
        if (best.sourceDialogTimes.length > 10) {
          best.sourceDialogTimes = best.sourceDialogTimes.slice(-10);
        }
      }
      const rank = { low: 0, medium: 1, high: 2 };
      if (rank[confidence] > rank[best.confidence]) best.confidence = confidence;
      db.prepare(
        'UPDATE user_facts SET fact = ?, confidence = ?, occurrences = ?, source_dialog_times = ?, updated_at = ? WHERE id = ?'
      ).run(best.fact, best.confidence, best.occurrences, JSON.stringify(best.sourceDialogTimes), now, best.id);
      return best;
    }

    const fact: UserFact = {
      id: nextFactId(),
      fact: factText,
      category,
      confidence,
      occurrences: 1,
      sourceDialogTimes: sourceDialogTime ? [sourceDialogTime] : [],
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    db.prepare(
      'INSERT INTO user_facts(id, user_id, fact, category, confidence, occurrences, source_dialog_times, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(fact.id, userId, fact.fact, fact.category, fact.confidence, fact.occurrences, JSON.stringify(fact.sourceDialogTimes), fact.status, fact.createdAt, fact.updatedAt);

    const total = (db.prepare('SELECT COUNT(*) AS c FROM user_facts WHERE user_id = ?').get(userId) as { c: number }).c;
    if (total > 200) {
      db.prepare(
        `DELETE FROM user_facts WHERE user_id = ? AND id NOT IN (
           SELECT id FROM user_facts WHERE user_id = ? AND status = 'active'
           ORDER BY created_at DESC, id DESC LIMIT 200
         )`
      ).run(userId, userId);
    }
    return fact;
  })();
}

export function listUserFacts(
  userId: string,
  opts: { includeArchived?: boolean } = {}
): UserFact[] {
  ensureFactsJsonImported();
  const db = getDb();
  const rows = (
    opts.includeArchived
      ? db.prepare('SELECT * FROM user_facts WHERE user_id = ? ORDER BY updated_at DESC, id DESC').all(userId)
      : db.prepare("SELECT * FROM user_facts WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC, id DESC").all(userId)
  ) as FactRow[];
  return rows.map(rowToFact);
}

export function updateUserFact(
  userId: string,
  factId: string,
  patch: { fact?: string; status?: 'active' | 'archived' }
): UserFact | null {
  ensureFactsJsonImported();
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_facts WHERE id = ? AND user_id = ?').get(factId, userId) as FactRow | undefined;
  if (!row) return null;
  const target = rowToFact(row);

  if (patch.fact !== undefined) {
    const text = patch.fact.trim();
    if (text.length >= 4 && text.length <= 120) {
      target.fact = text;
    }
  }
  if (patch.status === 'active' || patch.status === 'archived') {
    target.status = patch.status;
  }
  target.updatedAt = new Date().toISOString();
  db.prepare('UPDATE user_facts SET fact = ?, status = ?, updated_at = ? WHERE id = ?').run(
    target.fact,
    target.status,
    target.updatedAt,
    target.id
  );
  return target;
}

export function deleteUserFact(userId: string, factId: string): boolean {
  ensureFactsJsonImported();
  const result = getDb().prepare('DELETE FROM user_facts WHERE id = ? AND user_id = ?').run(factId, userId);
  return result.changes > 0;
}

export function getFactDistillState(
  userId: string
): { lastDistillAt?: string; distilledCount: number; totalFacts: number } {
  ensureFactsJsonImported();
  const db = getDb();
  const state = db.prepare('SELECT * FROM user_fact_distill_state WHERE user_id = ?').get(userId) as
    | { last_distill_at: string | null; distilled_count: number }
    | undefined;
  const totalFacts = (
    db.prepare("SELECT COUNT(*) AS c FROM user_facts WHERE user_id = ? AND status = 'active'").get(userId) as { c: number }
  ).c;
  return {
    lastDistillAt: state?.last_distill_at ?? undefined,
    distilledCount: state?.distilled_count ?? 0,
    totalFacts
  };
}

export function recordFactDistillRun(userId: string, dialogCount: number): void {
  ensureFactsJsonImported();
  getDb()
    .prepare(
      `INSERT INTO user_fact_distill_state(user_id, last_distill_at, distilled_count) VALUES(?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         last_distill_at = excluded.last_distill_at,
         distilled_count = MAX(user_fact_distill_state.distilled_count, excluded.distilled_count)`
    )
    .run(userId, new Date().toISOString(), dialogCount);
}

/** 一次性把旧 user_facts.json 迁进 SQLite；返回新插入的事实条数。 */
export function importUserFactsFromJson(filePath: string): number {
  ensureFactsJsonImported();
  const file = readJsonFileSync<UserFactFile>(filePath, { byUser: {} });
  const db = getDb();
  let inserted = 0;
  db.transaction(() => {
    const insertFact = db.prepare(
      `INSERT OR IGNORE INTO user_facts(id, user_id, fact, category, confidence, occurrences, source_dialog_times, status, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const upsertState = db.prepare(
      `INSERT INTO user_fact_distill_state(user_id, last_distill_at, distilled_count) VALUES(?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         last_distill_at = excluded.last_distill_at,
         distilled_count = MAX(user_fact_distill_state.distilled_count, excluded.distilled_count)`
    );
    for (const [uid, bucket] of Object.entries(file.byUser)) {
      for (const f of bucket.facts ?? []) {
        const r = insertFact.run(
          f.id,
          uid,
          f.fact,
          FACT_CATEGORIES.has(f.category) ? f.category : 'context',
          ['low', 'medium', 'high'].includes(f.confidence) ? f.confidence : 'medium',
          f.occurrences ?? 1,
          JSON.stringify(Array.isArray(f.sourceDialogTimes) ? f.sourceDialogTimes.slice(-10) : []),
          f.status === 'archived' ? 'archived' : 'active',
          f.createdAt,
          f.updatedAt
        );
        inserted += r.changes;
      }
      if (bucket.lastDistillAt !== undefined || bucket.distilledCount !== undefined) {
        upsertState.run(uid, bucket.lastDistillAt ?? null, bucket.distilledCount ?? 0);
      }
    }
  })();
  return inserted;
}

export const FACT_CATEGORY_LABEL: Record<UserFactCategory, string> = {
  emotion: '情绪模式',
  relationship: '人际关系',
  academic: '学业',
  habit: '生活习惯',
  preference: '偏好',
  context: '处境背景'
};

export const CONFIDENCE_LABEL: Record<UserFactConfidence, string> = {
  low: '初步',
  medium: '较稳定',
  high: '稳定'
};

/** 注入 Agent prompt 的 L2 事实块；无事实或用户无档案时返回空串。 */
export function formatUserFactsForPrompt(userId: string): string {
  if (!userId || userId === 'default_user') return '';
  const facts = listUserFacts(userId).slice(0, 20);
  if (!facts.length) return '';
  const lines = facts.map(
    (f) =>
      `- [${FACT_CATEGORY_LABEL[f.category]}·${CONFIDENCE_LABEL[f.confidence]}] ${f.fact}` +
      (f.occurrences > 1 ? `（印证 ${f.occurrences} 次）` : '')
  );
  return `【关于TA的记忆事实 · 仅供参考，不要逐条复述】\n${lines.join('\n')}`;
}
