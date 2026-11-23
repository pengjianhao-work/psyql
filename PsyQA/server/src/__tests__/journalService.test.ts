import { closeDb, getDb } from '../db/database';
import {
  createJournal,
  deleteJournal,
  listJournals,
  updateJournal
} from '../services/user/journalService';
import { collectUserSignals } from '../services/signals/userSignalService';

describe('journalService (SQLite)', () => {
  const userId = 'journal_user';
  const otherUser = 'journal_other';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });

  beforeEach(() => {
    closeDb();
    const db = getDb();
    db.prepare('DELETE FROM user_journals').run();
  });

  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
  });

  test('create/list returns entries latest first', () => {
    const first = createJournal(userId, { title: '第一篇', body: '今天还不错' });
    // 让 created_at 可区分
    getDb()
      .prepare('UPDATE user_journals SET created_at = ? WHERE id = ?')
      .run('2026-11-01T09:00:00.000Z', first.id);
    const second = createJournal(userId, { title: '第二篇', body: '晚上有点烦躁' });
    getDb()
      .prepare('UPDATE user_journals SET created_at = ? WHERE id = ?')
      .run('2026-11-02T09:00:00.000Z', second.id);

    const list = listJournals(userId);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(second.id);
    expect(list[0].title).toBe('第二篇');
    expect(list[0].moodTag).toBeNull();
    expect(list[1].id).toBe(first.id);
    expect(list[0].createdAt).toBeDefined();
    expect(list[0].updatedAt).toBeDefined();
  });

  test('validates body required and length caps', () => {
    expect(() => createJournal(userId, { body: '   ' })).toThrow('日记内容不能为空');
    expect(() => createJournal(userId, { body: '' })).toThrow('日记内容不能为空');
    expect(listJournals(userId)).toHaveLength(0);

    const longBody = createJournal(userId, { body: '字'.repeat(6000) });
    expect(longBody.body).toHaveLength(5000);

    const longTitle = createJournal(userId, { title: '题'.repeat(80), body: '正文' });
    expect(longTitle.title).toHaveLength(50);
  });

  test('moodTag whitelist rejects unknown tags and clears on empty', () => {
    expect(() => createJournal(userId, { body: '正文', moodTag: '开心到飞起' })).toThrow(
      '无效的心情标签'
    );
    const ok = createJournal(userId, { body: '正文', moodTag: '有点累' });
    expect(ok.moodTag).toBe('有点累');
    const cleared = updateJournal(userId, ok.id, { moodTag: null });
    expect(cleared!.moodTag).toBeNull();
  });

  test('update is scoped by user_id: other user cannot edit', () => {
    const mine = createJournal(userId, { title: '我的', body: '原始内容', moodTag: '一般' });
    expect(updateJournal(otherUser, mine.id, { body: '被篡改' })).toBeNull();

    const updated = updateJournal(userId, mine.id, { body: '新内容', title: '改过的标题' });
    expect(updated).not.toBeNull();
    expect(updated!.body).toBe('新内容');
    expect(updated!.title).toBe('改过的标题');
    // 未提供的字段保持不变
    expect(updated!.moodTag).toBe('一般');
    expect(updated!.createdAt).toBe(mine.createdAt);
    expect(Date.parse(updated!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(mine.updatedAt));
  });

  test('update validates patched fields', () => {
    const mine = createJournal(userId, { body: '原始内容' });
    expect(() => updateJournal(userId, mine.id, { body: '  ' })).toThrow('日记内容不能为空');
    expect(() => updateJournal(userId, mine.id, { moodTag: '不存在的心情' })).toThrow(
      '无效的心情标签'
    );
  });

  test('deleteJournal returns boolean and is scoped', () => {
    const mine = createJournal(userId, { body: '要删掉的' });
    expect(deleteJournal(otherUser, mine.id)).toBe(false);
    expect(listJournals(userId)).toHaveLength(1);
    expect(deleteJournal(userId, mine.id)).toBe(true);
    expect(deleteJournal(userId, mine.id)).toBe(false);
    expect(listJournals(userId)).toHaveLength(0);
  });

  test('rule-layer risk scan flags high/critical content without blocking save', () => {
    const risky = createJournal(userId, { title: '很累', body: '我最近经常觉得活着没什么意思' });
    expect(risky.riskSensitive).toBe(true);
    // 私密日记不拦截：仍然正常保存并可列出
    expect(listJournals(userId)).toHaveLength(1);

    const calm = createJournal(userId, { body: '今天去操场跑了步，心情好多了' });
    expect(calm.riskSensitive).toBe(false);

    // 编辑把正文改成普通内容后标记会清掉
    const cleared = updateJournal(userId, risky.id, { body: '睡一觉起来感觉好一些了' });
    expect(cleared!.riskSensitive).toBe(false);
  });

  test('collectUserSignals includes journal signals after registration', () => {
    createJournal(userId, { title: '考试周', body: '今天复习了一整天，感觉有进步' });
    const signals = collectUserSignals(userId, { types: ['journal'] });
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('journal');
    expect(signals[0].text).toBe('日记《考试周》：今天复习了一整天，感觉有进步');

    const untitled = createJournal(userId, { body: '无标题的一篇' });
    const all = collectUserSignals(userId, { types: ['journal'] });
    expect(all).toHaveLength(2);
    expect(all[0].text).toBe('日记：无标题的一篇');
    expect(all[0].occurredAt).toBe(untitled.createdAt);
  });

  test('risk-flagged journal is excluded from signals by default', () => {
    createJournal(userId, { body: '写点普通的日常记录' });
    createJournal(userId, { title: '危险', body: '我想死，觉得撑不下去了' });

    const safe = collectUserSignals(userId, { types: ['journal'] });
    expect(safe).toHaveLength(1);
    expect(safe[0].text).toContain('写点普通的日常记录');

    const all = collectUserSignals(userId, { types: ['journal'], excludeRiskSensitive: false });
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.riskSensitive)?.text).toContain('危险');
  });
});
