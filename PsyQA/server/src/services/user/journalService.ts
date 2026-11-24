import { getDb } from '../../db/database';
import { assessRisk } from '../psych/emotionService';

/**
 * 私密日记：user_journals 存用户自己写的日记条目。
 * - moodTag 复用情绪打卡的固定选项集（与客户端 MoodCheckinCard 的 MOOD_OPTIONS 一致）
 * - 写入时用规则层 assessRisk 做同步关键词扫描，命中 high/critical 记 risk_flagged=1，
 *   供 L2 蒸馏信号层标记 riskSensitive（默认排除），不对用户做任何拦截提示——日记是私密的
 */

export interface JournalEntry {
  id: number;
  userId: string;
  title: string;
  body: string;
  moodTag: string | null;
  createdAt: string;
  updatedAt: string;
  /** 规则层风险扫描命中 high/critical；仅用于下游信号过滤，不向用户展示 */
  riskSensitive: boolean;
}

/** 与 client/src/components/MoodCheckinCard.tsx 的 MOOD_OPTIONS 保持一致 */
export const JOURNAL_MOOD_TAGS: readonly string[] = ['还不错', '一般', '有点累', '烦躁', '低落'];

const MAX_TITLE_LEN = 50;
const MAX_BODY_LEN = 5000;
const MAX_LIST_LIMIT = 100;

interface JournalRow {
  id: number;
  user_id: string;
  title: string;
  body: string;
  mood_tag: string | null;
  created_at: string;
  updated_at: string;
  risk_flagged: number;
}

export interface JournalCreateInput {
  title?: string;
  body: string;
  moodTag?: string | null;
}

export interface JournalUpdateInput {
  title?: string;
  body?: string;
  moodTag?: string | null;
}

function toJournal(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    moodTag: row.mood_tag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    riskSensitive: row.risk_flagged === 1
  };
}

function cleanTitle(raw: string | undefined): string {
  return (raw ?? '').trim().slice(0, MAX_TITLE_LEN);
}

function cleanBody(raw: string): string {
  const body = raw.trim().slice(0, MAX_BODY_LEN);
  if (!body) {
    throw new Error('日记内容不能为空');
  }
  return body;
}

function cleanMoodTag(raw: string | null | undefined): string | null {
  const tag = (raw ?? '').trim();
  if (!tag) return null;
  if (!JOURNAL_MOOD_TAGS.includes(tag)) {
    throw new Error('无效的心情标签');
  }
  return tag;
}

/** 写入时的规则层风险扫描：标题+正文，命中 high/critical 视为敏感内容。 */
function scanRiskFlag(title: string, body: string): number {
  const text = title ? `${title}\n${body}` : body;
  try {
    const assessment = assessRisk(text);
    return assessment.level === 'high' || assessment.level === 'critical' ? 1 : 0;
  } catch {
    return 0;
  }
}

function getJournalRow(userId: string, id: number): JournalRow | undefined {
  return getDb()
    .prepare('SELECT * FROM user_journals WHERE id = ? AND user_id = ?')
    .get(id, userId) as JournalRow | undefined;
}

export function listJournals(userId: string, limit = 50): JournalEntry[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM user_journals WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
    )
    .all(userId, Math.max(1, Math.min(MAX_LIST_LIMIT, limit))) as JournalRow[];
  return rows.map(toJournal);
}

export function createJournal(userId: string, input: JournalCreateInput): JournalEntry {
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  const moodTag = cleanMoodTag(input.moodTag);
  const now = new Date().toISOString();
  const riskFlagged = scanRiskFlag(title, body);
  const result = getDb()
    .prepare(
      'INSERT INTO user_journals(user_id, title, body, mood_tag, created_at, updated_at, risk_flagged) VALUES(?, ?, ?, ?, ?, ?, ?)'
    )
    .run(userId, title, body, moodTag, now, now, riskFlagged);
  const row = getJournalRow(userId, Number(result.lastInsertRowid));
  if (!row) {
    throw new Error('日记保存失败');
  }
  return toJournal(row);
}

export function updateJournal(
  userId: string,
  id: number,
  patch: JournalUpdateInput
): JournalEntry | null {
  const row = getJournalRow(userId, id);
  if (!row) return null;

  const title = patch.title !== undefined ? cleanTitle(patch.title) : row.title;
  const body = patch.body !== undefined ? cleanBody(patch.body) : row.body;
  const moodTag = patch.moodTag !== undefined ? cleanMoodTag(patch.moodTag) : row.mood_tag;
  const updatedAt = new Date().toISOString();
  // 内容可能变了，重算风险标记，保持 risk_flagged 与当前文本一致
  const riskFlagged = scanRiskFlag(title, body);

  getDb()
    .prepare(
      'UPDATE user_journals SET title = ?, body = ?, mood_tag = ?, updated_at = ?, risk_flagged = ? WHERE id = ? AND user_id = ?'
    )
    .run(title, body, moodTag, updatedAt, riskFlagged, id, userId);
  return toJournal({
    ...row,
    title,
    body,
    mood_tag: moodTag,
    updated_at: updatedAt,
    risk_flagged: riskFlagged
  });
}

export function deleteJournal(userId: string, id: number): boolean {
  const result = getDb()
    .prepare('DELETE FROM user_journals WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}
