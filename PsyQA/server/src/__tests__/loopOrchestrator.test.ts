import { closeDb, getDb } from '../db/database';
import { getTodayState, getWeeklySummary } from '../services/loop/loopOrchestrator';
import { createWellbeingCheckin } from '../services/loop/checkinService';
import { createSupportPlan, updateActionStatus } from '../services/loop/supportPlanService';
import { addReflection } from '../services/loop/reflectionService';

const dayKey = (d = new Date()): string => d.toISOString().slice(0, 10);
const monday = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
};

describe('loopOrchestrator：今日状态与周总结', () => {
  const u = 'orch_user';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  it('getTodayState：无签到时下一步是邀请签到（可跳过）', () => {
    const s = getTodayState(u);
    expect(s.checkin).toBeNull();
    expect(s.nextStep).toContain('签个到');
    expect(s.nextStep).toContain('跳过');
  });

  it('getTodayState：签到+计划后给出今日微行动，复盘完成后收口', () => {
    createWellbeingCheckin(u, { mood: '紧张', stress: 4, energy: 2 });
    const plan = createSupportPlan(u, '睡好一点', [{ actionText: '睡前不刷手机' }]);
    const s1 = getTodayState(u);
    expect(s1.checkin?.mood).toBe('紧张');
    expect(s1.plan?.goal).toBe('睡好一点');
    expect(s1.todayActions.length).toBe(1);
    expect(s1.nextStep).toContain('睡前不刷手机');

    updateActionStatus(u, plan.actions[0].id, 'done');
    addReflection(u, { scope: 'evening', lines: ['手机放下了', '睡得还行', '明天继续'] });
    const s2 = getTodayState(u);
    expect(s2.todayActions[0].status).toBe('done');
    expect(s2.eveningReflectionDone).toBe(true);
  });

  it('getWeeklySummary：聚合一周数据并写入 progress_snapshots（幂等）', () => {
    const wk = monday();
    const s = getWeeklySummary(u, wk);
    expect(s.period).toBe(`week:${wk}`);
    expect(s.metrics.checkinDays).toBeGreaterThanOrEqual(1);
    expect(s.metrics.actions.done).toBe(1);
    expect(s.metrics.reflections.evening).toBe(1);
    expect(s.text).toContain('签到');

    const row = getDb()
      .prepare('SELECT metrics_json FROM progress_snapshots WHERE user_id = ? AND period = ?')
      .get(u, s.period) as { metrics_json: string } | undefined;
    expect(row).toBeDefined();
    expect(JSON.parse(row!.metrics_json).checkinDays).toBe(s.metrics.checkinDays);

    // 再跑一遍不报错、不重复插行
    const s2 = getWeeklySummary(u, wk);
    expect(s2.metrics.checkinDays).toBe(s.metrics.checkinDays);
    const cnt = getDb()
      .prepare('SELECT COUNT(*) AS n FROM progress_snapshots WHERE user_id = ? AND period = ?')
      .get(u, s.period) as { n: number };
    expect(cnt.n).toBe(1);
  });

  it('跨周计划收口：week_of 早于汇总周的 active 计划转为 completed', () => {
    const db = getDb();
    const oldWeek = '2020-01-06';
    const plan = createSupportPlan(u, '老计划', [{ actionText: '旧行动' }]);
    db.prepare('UPDATE support_plans SET week_of = ? WHERE id = ?').run(oldWeek, plan.id);
    db.prepare("UPDATE support_plans SET status = 'active' WHERE id = ?").run(plan.id);

    getWeeklySummary(u, monday());
    const status = (db.prepare('SELECT status FROM support_plans WHERE id = ?').get(plan.id) as { status: string }).status;
    expect(status).toBe('completed');
  });
});
