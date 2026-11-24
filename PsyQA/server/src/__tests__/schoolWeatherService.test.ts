import { closeDb, getDb } from '../db/database';
import { buildSchoolWeather } from '../services/school/schoolWeatherService';
import { AccountRecord, loadAccounts, PublicAccount } from '../services/user/accountService';

// loadAccounts 走真实实现会合并/回写 server/data/accounts.json，测试中替换为内存账号表
jest.mock('../services/user/accountService', () => {
  const actual = jest.requireActual('../services/user/accountService');
  return { ...actual, loadAccounts: jest.fn() };
});

const loadAccountsMock = loadAccounts as jest.Mock;

function makeStudent(id: string, orgId: string): AccountRecord {
  return {
    id,
    username: id,
    passwordHash: 'x',
    displayName: `学生${id}`,
    avatar: '🎓',
    role: 'student',
    orgId,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function makeViewer(
  role: PublicAccount['role'],
  orgId?: string,
  managedOrgIds?: string[]
): PublicAccount {
  return {
    id: `viewer_${role}`,
    username: `viewer_${role}`,
    displayName: '查看者',
    avatar: '🧑‍🏫',
    role,
    orgId,
    managedOrgIds,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function insertCheckin(userId: string, mood: string, createdAt: string): void {
  getDb()
    .prepare('INSERT INTO mood_checkins(user_id, mood, note, created_at) VALUES (?, ?, NULL, ?)')
    .run(userId, mood, createdAt);
}

function insertAlert(
  id: string,
  orgId: string,
  studentId: string,
  status: string,
  createdAt: string
): void {
  const alert = {
    id,
    studentId,
    studentMask: '**',
    orgId,
    level: 'medium',
    tier: 3,
    slaHours: 72,
    slaDueAt: createdAt,
    source: 'manual',
    summary: '',
    riskKeywords: [],
    dialogId: `d_${id}`,
    dialogTime: createdAt,
    status,
    isFalsePositive: false,
    createdAt,
    updatedAt: createdAt
  };
  getDb()
    .prepare(
      'INSERT INTO school_alerts(id, data_json, org_id, status, student_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, JSON.stringify(alert), orgId, status, studentId, createdAt);
}

function daysAgo(n: number, hour = 9): string {
  const d = new Date(Date.now() - n * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const ORG_X = 'org-x';
const ORG_Y = 'org-y';
const X_IDS = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'];
const Y_IDS = ['y1', 'y2', 'y3'];

function seedAccounts(): void {
  loadAccountsMock.mockResolvedValue({
    users: [
      ...X_IDS.map((id) => makeStudent(id, ORG_X)),
      ...Y_IDS.map((id) => makeStudent(id, ORG_Y))
    ]
  });
}

function seedCheckins(): void {
  // org-x：6 人近 7 天打卡，分布 开心x2 一般x2 低落x1 烦躁x1
  const moods = ['开心', '开心', '一般', '一般', '低落', '烦躁'];
  X_IDS.forEach((id, i) => insertCheckin(id, moods[i], daysAgo(1)));
  // x1 昨天之前（7 天外、30 天内）再打一次
  insertCheckin('x1', '平静', daysAgo(10));
  // org-y：3 人打卡（低于 k=5）
  Y_IDS.forEach((id) => insertCheckin(id, '难过', daysAgo(2)));
}

describe('schoolWeatherService', () => {
  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });

  beforeEach(() => {
    closeDb();
    const db = getDb();
    db.prepare('DELETE FROM mood_checkins').run();
    db.prepare('DELETE FROM school_alerts').run();
    loadAccountsMock.mockReset();
  });

  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
  });

  test('admin 视图：大样本院系分布正确，小样本院系被抑制并合并', async () => {
    seedAccounts();
    seedCheckins();
    insertAlert('a1', ORG_X, 'x1', 'pending', daysAgo(3));
    insertAlert('a2', ORG_X, 'x2', 'closed', daysAgo(20));
    insertAlert('a3', ORG_Y, 'y1', 'pending', daysAgo(5));

    const w = await buildSchoolWeather(makeViewer('admin'));
    expect(w.scope).toBe('全校');

    const gx = w.groups.find((g) => g.groupKey === ORG_X)!;
    expect(gx.kOk).toBe(true);
    expect(gx.activeUsers).toBe(6);
    // 近 7 天分布：x1 的 10 天前打卡不计入
    expect(gx.moodDistribution).toEqual({ 开心: 2, 一般: 2, 低落: 1, 烦躁: 1 });
    expect(gx.trend7d).toHaveLength(7);
    const d1 = gx.trend7d.find((t) => t.day === daysAgo(1).slice(0, 10))!;
    expect(d1.count).toBe(6);
    // (2+2+1+1-2-1)/6 = 0.5
    expect(d1.avgMoodScore).toBe(0.5);
    expect(gx.alerts).toEqual({ pending: 1, total30d: 2 });

    const gy = w.groups.find((g) => g.groupKey === ORG_Y)!;
    expect(gy.kOk).toBe(false);
    expect(gy.moodDistribution).toEqual({});
    expect(gy.trend7d).toEqual([]);

    expect(w.mergedSmallGroups).toBeDefined();
    expect(w.mergedSmallGroups!.groupKey).toBe('merged-small');
    expect(w.mergedSmallGroups!.activeUsers).toBe(3);
    // 合并后仍 <5 人：分布同样被抑制
    expect(w.mergedSmallGroups!.kOk).toBe(false);
    expect(w.mergedSmallGroups!.moodDistribution).toEqual({});
    expect(w.mergedSmallGroups!.alerts.pending).toBe(1);

    expect(w.total).toEqual({
      activeUsers: 9,
      checkins7d: 9,
      checkins30d: 10,
      alertsPending: 2,
      alerts30d: 3
    });
    expect(new Date(w.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('teacher 视图：只看本院系，org-y 不出现', async () => {
    seedAccounts();
    seedCheckins();
    insertAlert('a1', ORG_X, 'x1', 'pending', daysAgo(3));
    insertAlert('a3', ORG_Y, 'y1', 'pending', daysAgo(5));

    const w = await buildSchoolWeather(makeViewer('teacher', ORG_X));
    expect(w.scope).toBe(ORG_X);
    expect(w.groups).toHaveLength(1);
    expect(w.groups[0].groupKey).toBe(ORG_X);
    expect(w.groups[0].kOk).toBe(true);
    expect(w.mergedSmallGroups).toBeUndefined();
    expect(w.total).toEqual({
      activeUsers: 6,
      checkins7d: 6,
      checkins30d: 7,
      alertsPending: 1,
      alerts30d: 1
    });
  });

  test('teacher 带 managedOrgIds 时可看多院系', async () => {
    seedAccounts();
    seedCheckins();

    const w = await buildSchoolWeather(makeViewer('teacher', ORG_X, [ORG_X, ORG_Y]));
    const keys = w.groups.map((g) => g.groupKey).sort();
    expect(keys).toEqual([ORG_X, ORG_Y]);
    expect(w.total.checkins30d).toBe(10);
  });

  test('本院系样本不足时整组被抑制并进入合并组', async () => {
    loadAccountsMock.mockResolvedValue({
      users: Y_IDS.map((id) => makeStudent(id, ORG_Y))
    });
    Y_IDS.forEach((id) => insertCheckin(id, '开心', daysAgo(1)));

    const w = await buildSchoolWeather(makeViewer('teacher', ORG_Y));
    const gy = w.groups.find((g) => g.groupKey === ORG_Y)!;
    expect(gy.kOk).toBe(false);
    expect(gy.moodDistribution).toEqual({});
    expect(w.mergedSmallGroups!.activeUsers).toBe(3);
    expect(w.total.activeUsers).toBe(3);
  });

  test('无打卡与无告警时返回空分布与零值', async () => {
    seedAccounts();
    const w = await buildSchoolWeather(makeViewer('teacher', ORG_X));
    const gx = w.groups.find((g) => g.groupKey === ORG_X)!;
    // 6 个学生账号但 0 人打卡 → 仍不满足 k
    expect(gx.kOk).toBe(false);
    expect(gx.trend7d).toEqual([]);
    expect(w.total.checkins30d).toBe(0);
    expect(w.total.alertsPending).toBe(0);
  });
});
