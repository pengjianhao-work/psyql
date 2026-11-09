import { closeDb, getDb } from '../db/database';
import { saveDialogToDb } from '../db/historyStore';
import {
  archiveConversation,
  createConversation,
  ensureConversationSchema,
  listConversations,
  resolveConversation
} from '../db/conversationStore';
import { getRecentDialogTranscript } from '../services/common/historyManager';

describe('conversation lifecycle', () => {
  const userId = 'test_conversation_user';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });

  beforeEach(() => {
    closeDb();
    ensureConversationSchema();
    const db = getDb();
    db.prepare('DELETE FROM dialogs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
  });

  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
  });

  test('a new conversation does not keep the previous turn in context', () => {
    const first = createConversation(userId);
    saveDialogToDb(userId, '我书丢了', '先找找看。', '书', undefined, undefined, '2026/11/09 10:00:00', first.id);
    const second = createConversation(userId);
    expect(second.id).not.toBe(first.id);
    expect(getRecentDialogTranscript(userId, 2, second.id)).toBe('');
    expect(getRecentDialogTranscript(userId, 2, first.id)).toContain('书丢了');
  });

  test('an ended conversation is not resumed', () => {
    const first = createConversation(userId);
    saveDialogToDb(userId, '地铁没赶上', '先喘口气。', '地铁', undefined, undefined, '2026/11/09 11:00:00', first.id);
    expect(archiveConversation(userId, first.id)).toBe(true);
    const next = resolveConversation(userId, first.id);
    expect(next.id).not.toBe(first.id);
    expect(next.status).toBe('active');
    expect(next.turns).toBe(0);
  });

  test('dialogs from before sessions stay in one conversation', () => {
    saveDialogToDb(userId, '以前的事', '嗯。', '旧', undefined, undefined, '2026/11/01 10:00:00');
    const legacy = listConversations(userId).find((row) => row.title === '以往的对话');
    expect(legacy?.turns).toBe(1);
    expect(getRecentDialogTranscript(userId, 2, legacy!.id)).toContain('以前的事');
  });
});
