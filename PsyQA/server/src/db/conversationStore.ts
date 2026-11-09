import { randomBytes } from 'crypto';
import { getDb } from './database';

export type ConversationStatus = 'active' | 'archived';

export type ConversationRecord = {
  id: string;
  userId: string;
  title: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  turns: number;
};

type ConversationSqlRow = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  turns: number;
};

export function ensureConversationSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);
  `);
  const columns = db.prepare('PRAGMA table_info(dialogs)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'conversation_id')) {
    db.exec('ALTER TABLE dialogs ADD COLUMN conversation_id TEXT');
  }
}

function mapRow(row: ConversationSqlRow): ConversationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    turns: row.turns
  };
}

function selectAll(userId: string): ConversationRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.user_id, c.title, c.status, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM dialogs d WHERE d.conversation_id = c.id) AS turns
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`
    )
    .all(userId) as ConversationSqlRow[];
  return rows.map(mapRow);
}

function adoptLooseDialogs(userId: string): void {
  const loose = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM dialogs
       WHERE user_id = ? AND (conversation_id IS NULL OR conversation_id = '')`
    )
    .get(userId) as { n: number };
  if (!loose.n) return;
  const now = new Date().toISOString();
  const id = `c_${randomBytes(6).toString('hex')}`;
  getDb()
    .prepare(
      `INSERT INTO conversations(id, user_id, title, status, created_at, updated_at)
       VALUES(?, ?, '以往的对话', 'active', ?, ?)`
    )
    .run(id, userId, now, now);
  getDb()
    .prepare(
      `UPDATE dialogs SET conversation_id = ?
       WHERE user_id = ? AND (conversation_id IS NULL OR conversation_id = '')`
    )
    .run(id, userId);
}

function insertConversation(userId: string): ConversationRecord {
  const now = new Date().toISOString();
  const id = `c_${randomBytes(6).toString('hex')}`;
  getDb()
    .prepare(
      `INSERT INTO conversations(id, user_id, title, status, created_at, updated_at)
       VALUES(?, ?, '新对话', 'active', ?, ?)`
    )
    .run(id, userId, now, now);
  return {
    id,
    userId,
    title: '新对话',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    turns: 0
  };
}

export function listConversations(userId: string): ConversationRecord[] {
  if (!userId) return [];
  ensureConversationSchema();
  adoptLooseDialogs(userId);
  return selectAll(userId);
}

export function createConversation(userId: string): ConversationRecord {
  ensureConversationSchema();
  adoptLooseDialogs(userId);
  const existing = selectAll(userId).find((row) => row.status === 'active' && row.turns === 0);
  if (existing) return existing;
  return insertConversation(userId);
}

export function archiveConversation(userId: string, conversationId: string): boolean {
  ensureConversationSchema();
  const result = getDb()
    .prepare(
      `UPDATE conversations SET status = 'archived', updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'active'`
    )
    .run(new Date().toISOString(), conversationId, userId);
  return result.changes > 0;
}

/** 只把还在进行中的会话交给这一轮。已结束或不存在的 id 会另开一段。 */
export function resolveConversation(userId: string, requestedId?: string): ConversationRecord {
  ensureConversationSchema();
  adoptLooseDialogs(userId);
  const rows = selectAll(userId);
  const requested = requestedId ? rows.find((row) => row.id === requestedId) : undefined;
  if (requested?.status === 'active') return requested;
  const current = rows.find((row) => row.status === 'active');
  if (!requestedId && current) return current;
  return insertConversation(userId);
}

export function noteConversationTurn(userId: string, conversationId: string, userText: string): void {
  ensureConversationSchema();
  const row = getDb()
    .prepare('SELECT title FROM conversations WHERE id = ? AND user_id = ?')
    .get(conversationId, userId) as { title: string } | undefined;
  if (!row) return;
  const title =
    row.title === '新对话'
      ? userText.replace(/\s+/g, ' ').trim().slice(0, 18) || '新对话'
      : row.title;
  getDb()
    .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(title, new Date().toISOString(), conversationId, userId);
}
