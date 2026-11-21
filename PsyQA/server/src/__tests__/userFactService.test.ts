import fs from 'fs';
import os from 'os';
import path from 'path';
import { closeDb, getDb } from '../db/database';
import { buildUserDataExport } from '../services/user/dataExportService';
import {
  deleteUserFact,
  factSimilarity,
  formatUserFactsForPrompt,
  getFactDistillState,
  importUserFactsFromJson,
  listUserFacts,
  recordFactDistillRun,
  updateUserFact,
  upsertUserFact,
  UserFact
} from '../services/user/userFactService';

describe('userFactService (SQLite)', () => {
  const userId = 'test_fact_user';
  const otherUser = 'test_fact_other';
  const tmpFiles: string[] = [];

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });

  beforeEach(() => {
    closeDb();
    const db = getDb();
    db.prepare('DELETE FROM user_facts').run();
    db.prepare('DELETE FROM user_fact_distill_state').run();
    db.prepare("DELETE FROM meta WHERE key = 'user_facts_json_imported'").run();
  });

  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  test('merges near-identical facts of the same category', () => {
    const a = '我最近因为考研压力很大，经常失眠';
    const b = '我最近因为考研压力很大经常失眠';
    expect(factSimilarity(a, b)).toBeGreaterThanOrEqual(0.55);
    const first = upsertUserFact(userId, { fact: a, category: 'academic', confidence: 'medium' }, '2026/11/01 10:00:00');
    const second = upsertUserFact(userId, { fact: b, category: 'academic', confidence: 'high' }, '2026/11/02 10:00:00');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.id).toBe(first!.id);
    const facts = listUserFacts(userId);
    expect(facts).toHaveLength(1);
    expect(facts[0].occurrences).toBe(2);
    expect(facts[0].confidence).toBe('high');
    expect(facts[0].sourceDialogTimes).toEqual(
      expect.arrayContaining(['2026/11/01 10:00:00', '2026/11/02 10:00:00'])
    );
  });

  test('same text under a different category creates a separate fact', () => {
    const text = '我习惯每天晚上跑步三十分钟';
    upsertUserFact(userId, { fact: text, category: 'habit', confidence: 'medium' });
    upsertUserFact(userId, { fact: text, category: 'preference', confidence: 'medium' });
    expect(listUserFacts(userId)).toHaveLength(2);
  });

  test('rejects facts shorter than 4 or longer than 120 chars', () => {
    expect(upsertUserFact(userId, { fact: '太短', category: 'context', confidence: 'low' })).toBeNull();
    expect(
      upsertUserFact(userId, { fact: '长'.repeat(121), category: 'context', confidence: 'low' })
    ).toBeNull();
    expect(listUserFacts(userId)).toHaveLength(0);
  });

  test('archive/restore via updateUserFact and invalid text patch is ignored', () => {
    const fact = upsertUserFact(userId, { fact: '我和室友相处不太融洽', category: 'relationship', confidence: 'medium' })!;
    const archived = updateUserFact(userId, fact.id, { status: 'archived' });
    expect(archived!.status).toBe('archived');
    expect(listUserFacts(userId)).toHaveLength(0);
    expect(listUserFacts(userId, { includeArchived: true })).toHaveLength(1);

    const patched = updateUserFact(userId, fact.id, { fact: '短', status: 'active' });
    expect(patched!.status).toBe('active');
    expect(patched!.fact).toBe('我和室友相处不太融洽');
    expect(listUserFacts(userId)).toHaveLength(1);
  });

  test('deleteUserFact is scoped to the owner', () => {
    const fact = upsertUserFact(userId, { fact: '我准备明年申请交换项目', category: 'academic', confidence: 'medium' })!;
    expect(deleteUserFact(otherUser, fact.id)).toBe(false);
    expect(listUserFacts(userId)).toHaveLength(1);
    expect(deleteUserFact(userId, fact.id)).toBe(true);
    expect(deleteUserFact(userId, fact.id)).toBe(false);
  });

  test('recordFactDistillRun keeps the max distilled count', () => {
    upsertUserFact(userId, { fact: '我最近睡眠规律变好了一点', category: 'habit', confidence: 'low' });
    recordFactDistillRun(userId, 8);
    recordFactDistillRun(userId, 5);
    const state = getFactDistillState(userId);
    expect(state.distilledCount).toBe(8);
    expect(state.lastDistillAt).toBeDefined();
    expect(state.totalFacts).toBe(1);

    const fact = listUserFacts(userId)[0];
    updateUserFact(userId, fact.id, { status: 'archived' });
    expect(getFactDistillState(userId).totalFacts).toBe(0);
  });

  test('importUserFactsFromJson imports once and is idempotent', () => {
    const filePath = path.join(os.tmpdir(), `psyqa_facts_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    tmpFiles.push(filePath);
    const legacyFact: UserFact = {
      id: 'fact_legacy_1',
      fact: '我在准备期末考试感到焦虑',
      category: 'emotion',
      confidence: 'high',
      occurrences: 3,
      sourceDialogTimes: ['2026/10/01 09:00:00'],
      status: 'active',
      createdAt: '2026-10-01T01:00:00.000Z',
      updatedAt: '2026-10-02T01:00:00.000Z'
    };
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        byUser: {
          [userId]: {
            facts: [legacyFact],
            lastDistillAt: '2026-10-03T01:00:00.000Z',
            distilledCount: 7
          }
        }
      }),
      'utf8'
    );

    expect(importUserFactsFromJson(filePath)).toBe(1);
    const facts = listUserFacts(userId);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      id: 'fact_legacy_1',
      fact: legacyFact.fact,
      category: 'emotion',
      confidence: 'high',
      occurrences: 3,
      status: 'active'
    });
    const state = getFactDistillState(userId);
    expect(state.lastDistillAt).toBe('2026-10-03T01:00:00.000Z');
    expect(state.distilledCount).toBe(7);

    expect(importUserFactsFromJson(filePath)).toBe(0);
    expect(listUserFacts(userId)).toHaveLength(1);
  });

  test('formatUserFactsForPrompt includes active facts and empty case matches previous behavior', () => {
    expect(formatUserFactsForPrompt(userId)).toBe('');
    upsertUserFact(userId, { fact: '我遇到压力时喜欢独处消化情绪', category: 'emotion', confidence: 'medium' });
    const block = formatUserFactsForPrompt(userId);
    expect(block).toContain('我遇到压力时喜欢独处消化情绪');
    expect(block).toContain('【关于TA的记忆事实');
  });

  test('buildUserDataExport exposes memoryFacts including archived ones', () => {
    const fact = upsertUserFact(userId, { fact: '我在减肥期间坚持记录饮食', category: 'habit', confidence: 'medium' })!;
    updateUserFact(userId, fact.id, { status: 'archived' });
    const data = buildUserDataExport(userId);
    expect(data.memoryFacts).toHaveLength(1);
    expect(data.memoryFacts[0]).toMatchObject({
      fact: '我在减肥期间坚持记录饮食',
      status: 'archived',
      category: 'habit'
    });
  });
});
