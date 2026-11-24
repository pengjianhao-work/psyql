import { closeDb, getDb } from '../db/database';
import { buildSchoolLoopWeather } from '../services/school/schoolLoopWeatherService';
import { AccountRecord, loadAccounts, PublicAccount } from '../services/user/accountService';

jest.mock('../services/user/accountService', () => {
  const actual = jest.requireActual('../services/user/accountService');
  return { ...actual, loadAccounts: jest.fn() };
});
const loadAccountsMock = loadAccounts as jest.Mock;

const ORG_X = 'org-x';
const ORG_Y = 'org-y';
const X_IDS = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'];
const Y_IDS = ['y1', 'y2', 'y3'];

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

function makeViewer(role: PublicAccount['role'], orgId?: string, managedOrgIds?: string[]): PublicAccount {
  return {
    id: `v_${role}`,
    username: `v_${role}`,
    displayName: 'v',
    avatar: '🧑‍🏫',
    role,
    orgId,
    managedOrgIds,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

const daysAgo = (n: number): string => new Date(Date.now() - n * 86400000).toISOString();

function seedAccounts(): void {
  loadAccountsMock.mockResolvedValue({
    users: [...X_IDS.map((id) => makeStudent(id, ORG_X)), ...Y_IDS.map((id) => makeStudent(id, ORG_Y))]
  });
}

function seedLoopData(): void {
  const db = getDb();
  const insCheckin = db.prepare(
    'INSERT INTO wellbeing_checkins(user_id, mood, stress, energy, skipped, created_at) VALUES (?,?,?,?,0,?)'
  );
  X_IDS.forEach((id, i) => insCheckin.run(id, '平静', 3 + (i % 2), 2, daysAgo(1)));
  Y_IDS.forEach((id) => insCheckin.run(id, '紧张', 4, 2, daysAgo(2)));

  const insPlan = db.prepare(
    "INSERT INTO support_plans(user_id, week_of, goal_text, status, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?)"
  );
  const insAction = db.prepare(
    'INSERT INTO plan_actions(plan_id, user_id, day, action_text, status, created_at) VALUES (?,?,?,?,?,?)'
  );
  X_IDS.forEach((id, i) => {
    const pid = Number(
      insPlan.run(id, '2026-11-16', '目标', i === 0 ? 'adjusted' : 'active', i === 0 ? 'adjust:1' : 'manual', daysAgo(1), daysAgo(1)).lastInsertRowid
    );
    insAction.run(pid, id, daysAgo(1).slice(0, 10), '散步', i % 2 === 0 ? 'done' : 'partial', daysAgo(1));
  });
  const insRefl = db.prepare("INSERT INTO reflections(user_id, scope, created_at) VALUES (?,?,?)");
  X_IDS.forEach((id) => insRefl.run(id, 'evening', daysAgo(1)));
}

describe('schoolLoopWeatherService：闭环使用聚合', () => {
  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });
  beforeEach(() => {
    closeDb();
    const db = getDb();
    for (const t of ['wellbeing_checkins', 'support_plans', 'plan_actions', 'reflections']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    loadAccountsMock.mockReset();
  });
  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
  });

  test('admin：大样本院系有明细，小样本院系抑制并合并', async () => {
    seedAccounts();
    seedLoopData();
    const w = await buildSchoolLoopWeather(makeViewer('admin'));

    const gx = w.groups.find((g) => g.groupKey === ORG_X)!;
    expect(gx.kOk).toBe(true);
    expect(gx.participants).toBe(6);
    expect(gx.metrics!.checkins30d).toBe(6);
    expect(gx.metrics!.actionsDone).toBe(3);
    expect(gx.metrics!.actionsPartial).toBe(3);
    expect(gx.metrics!.adjustedPlans).toBe(1);
    expect(gx.metrics!.activePlans).toBe(5);
    expect(gx.metrics!.reflections30d).toBe(6);
    expect(gx.metrics!.avgStress).not.toBeNull();

    const gy = w.groups.find((g) => g.groupKey === ORG_Y)!;
    expect(gy.kOk).toBe(false);
    expect(gy.metrics).toBeNull(); // 明细被抑制，计数仍保留

    expect(w.mergedSmallGroups).toBeDefined();
    expect(w.mergedSmallGroups!.kOk).toBe(false);
    expect(w.mergedSmallGroups!.metrics).toBeNull();

    expect(w.total.checkins30d).toBe(9);
    expect(w.total.participants).toBe(9);
  });

  test('teacher：仅本院系，明细与 weather 一致受 k 约束', async () => {
    seedAccounts();
    seedLoopData();
    const w = await buildSchoolLoopWeather(makeViewer('teacher', ORG_X));
    expect(w.groups).toHaveLength(1);
    expect(w.groups[0].groupKey).toBe(ORG_X);
    expect(w.groups[0].kOk).toBe(true);
    expect(w.total.checkins30d).toBe(6);
  });

  test('本院系学生 <5 时整组抑制，不下发明细', async () => {
    loadAccountsMock.mockResolvedValue({ users: Y_IDS.map((id) => makeStudent(id, ORG_Y)) });
    Y_IDS.forEach((id) =>
      getDb()
        .prepare('INSERT INTO wellbeing_checkins(user_id, mood, skipped, created_at) VALUES (?,?,0,?)')
        .run(id, '平静', daysAgo(1))
    );
    const w = await buildSchoolLoopWeather(makeViewer('teacher', ORG_Y));
    const gy = w.groups.find((g) => g.groupKey === ORG_Y)!;
    expect(gy.kOk).toBe(false);
    expect(gy.metrics).toBeNull();
  });
});
