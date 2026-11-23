import { closeDb, getDb } from '../db/database';
import { collectUserSignals } from '../services/signals/userSignalService';
import { scheduleFactDistillation } from '../services/user/factDistillService';
import { getFactDistillState, recordFactDistillRun } from '../services/user/userFactService';

jest.mock('../services/llm/llmClient', () => {
  const actual = jest.requireActual('../services/llm/llmClient');
  return {
    ...actual,
    callLlmGenerate: jest.fn()
  };
});

const { callLlmGenerate } = jest.requireMock('../services/llm/llmClient') as {
  callLlmGenerate: jest.Mock;
};

function insertDialog(
  userId: string,
  dialogTime: string,
  userText: string,
  psychJson: string | null = null
): void {
  getDb()
    .prepare(
      'INSERT INTO dialogs(user_id, dialog_time, user_text, bot_text, summary, psych_json) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(userId, dialogTime, userText, '机器人回复', '对话摘要', psychJson);
}

function insertMood(userId: string, createdAt: string, mood: string, note: string | null = null): void {
  getDb()
    .prepare('INSERT INTO mood_checkins(user_id, mood, note, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, mood, note, createdAt);
}

function insertTraining(
  userId: string,
  id: string,
  trainingType: string,
  status: string,
  startedAt: string,
  completedAt: string | null
): void {
  getDb()
    .prepare(
      `INSERT INTO training_sessions
         (id, user_id, training_type, status, answers_json, current_step, feedback_json, started_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, '{}', 0, NULL, ?, ?, ?)`
    )
    .run(id, userId, trainingType, status, startedAt, completedAt ?? startedAt, completedAt);
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('userSignalService', () => {
  const userId = 'signal_user';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });

  beforeEach(() => {
    closeDb();
    const db = getDb();
    db.prepare('DELETE FROM dialogs').run();
    db.prepare('DELETE FROM mood_checkins').run();
    db.prepare('DELETE FROM training_sessions').run();
    db.prepare('DELETE FROM user_facts').run();
    db.prepare('DELETE FROM user_fact_distill_state').run();
    callLlmGenerate.mockReset();
    callLlmGenerate.mockResolvedValue('{"facts":[]}');
  });

  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
  });

  test('merges dialog/mood/training signals sorted by occurredAt DESC', () => {
    insertDialog(userId, '2026-11-01T10:00:00.000Z', '我最近因为考研复习压力特别大');
    insertMood(userId, '2026-11-03T09:00:00.000Z', '平静', '今天睡了个好觉');
    insertTraining(userId, 'tr1', 'emotion', 'completed', '2026-11-02T08:00:00.000Z', '2026-11-02T08:05:00.000Z');

    const signals = collectUserSignals(userId);
    expect(signals.map((s) => s.type)).toEqual(['mood', 'training', 'dialog']);
    expect(signals[0].text).toContain('心情打卡：平静');
    expect(signals[1].text).toContain('完成微训练：情绪觉察训练');
    expect(signals[2].text).toContain('用户说：我最近因为考研复习压力特别大');
  });

  test("types:['dialog'] returns only dialog signals", () => {
    insertDialog(userId, '2026-11-01T10:00:00.000Z', '我最近因为考研复习压力特别大');
    insertMood(userId, '2026-11-02T09:00:00.000Z', '开心');
    insertTraining(userId, 'tr2', 'sleep', 'completed', '2026-11-03T08:00:00.000Z', '2026-11-03T08:05:00.000Z');

    const signals = collectUserSignals(userId, { types: ['dialog'] });
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('dialog');
  });

  test('high-risk dialog is excluded by default and kept when excludeRiskSensitive=false', () => {
    insertDialog(userId, '2026-11-01T10:00:00.000Z', '我觉得活着没什么意思了', '{"risk":"high"}');
    insertDialog(userId, '2026-11-02T10:00:00.000Z', '今天天气不错出去走了走', null);

    const safe = collectUserSignals(userId);
    expect(safe).toHaveLength(1);
    expect(safe[0].text).toContain('今天天气不错');

    const all = collectUserSignals(userId, { excludeRiskSensitive: false });
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.riskSensitive)?.text).toContain('活着没什么意思');
  });

  test('dialog with user text shorter than 10 chars is filtered out', () => {
    insertDialog(userId, '2026-11-01T10:00:00.000Z', '嗯嗯', null);
    insertDialog(userId, '2026-11-02T10:00:00.000Z', '我最近睡眠一直不太好总失眠', null);

    const signals = collectUserSignals(userId, { types: ['dialog'] });
    expect(signals).toHaveLength(1);
    expect(signals[0].text).toContain('睡眠一直不太好');
  });

  test('empty database returns empty array', () => {
    expect(collectUserSignals('nobody')).toEqual([]);
  });

  test('scheduleFactDistillation skips when fewer than MIN new dialog signals', async () => {
    insertDialog(userId, '2026-11-01T10:00:00.000Z', '我最近因为考研复习压力特别大');
    insertDialog(userId, '2026-11-01T11:00:00.000Z', '晚上经常睡不着想很多事情');
    insertDialog(userId, '2026-11-01T12:00:00.000Z', '和室友的关系也让我有点烦');
    recordFactDistillRun(userId, 3);

    // 仅新增 2 条对话信号（< MIN_NEW_DIALOGS=4），应跳过去抖
    insertDialog(userId, '2026-11-02T10:00:00.000Z', '今天去图书馆复习了一整天');
    insertDialog(userId, '2026-11-02T11:00:00.000Z', '感觉效率比昨天好了一些');
    // 非对话信号再多也不触发蒸馏
    insertMood(userId, '2026-11-02T12:00:00.000Z', '还行');
    insertMood(userId, '2026-11-02T13:00:00.000Z', '不错');
    insertMood(userId, '2026-11-02T14:00:00.000Z', '平静');

    scheduleFactDistillation(userId);
    await flushAsync();

    expect(callLlmGenerate).not.toHaveBeenCalled();
    expect(getFactDistillState(userId).distilledCount).toBe(3);
  });

  test('scheduleFactDistillation runs when enough new dialog signals accumulate', async () => {
    insertDialog(userId, '2026-11-01T10:00:00.000Z', '我最近因为考研复习压力特别大');
    insertDialog(userId, '2026-11-01T11:00:00.000Z', '晚上经常睡不着想很多事情');
    insertDialog(userId, '2026-11-01T12:00:00.000Z', '和室友的关系也让我有点烦');
    insertDialog(userId, '2026-11-01T13:00:00.000Z', '不过今天在操场跑了步好多了');

    scheduleFactDistillation(userId);
    await flushAsync();

    expect(callLlmGenerate).toHaveBeenCalledTimes(1);
    // LLM 输出无 facts 时仍记录运行，distilledCount = 对话信号数
    expect(getFactDistillState(userId).distilledCount).toBe(4);
  });
});
