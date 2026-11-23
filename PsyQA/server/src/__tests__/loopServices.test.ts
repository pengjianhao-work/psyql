import { closeDb, getDb } from '../db/database';
import { createWellbeingCheckin, listWellbeingCheckins } from '../services/loop/checkinService';
import {
  adjustPlan,
  createSupportPlan,
  getActivePlan,
  updateActionStatus
} from '../services/loop/supportPlanService';
import { addReflection, getSafetyPlan, listReflections, upsertSafetyPlan } from '../services/loop/reflectionService';

describe('loop services (SQLite)', () => {
  const u = 'loop_user';
  const other = 'loop_other';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  it('wellbeing checkin：正常打卡与跳过都被接受', () => {
    const c1 = createWellbeingCheckin(u, { mood: '有点累', stress: 3, sleepHours: 6.5, energy: 2, eventText: '考试周' });
    expect(c1.mood).toBe('有点累');
    expect(c1.stress).toBe(3);
    const c2 = createWellbeingCheckin(u, { skipped: true });
    expect(c2.skipped).toBe(true);
    const list = listWellbeingCheckins(u);
    expect(list.length).toBe(2);
    expect(list[0].skipped).toBe(true); // 最新的在前
  });

  it('checkin：空内容且未跳过被拒绝', () => {
    expect(() => createWellbeingCheckin(u, {})).toThrow();
  });

  it('support plan：创建计划 + 微行动状态流转', () => {
    const plan = createSupportPlan(u, '这周睡够 7 小时', [
      { actionText: '23:30 前放下手机' },
      { actionText: '晚饭后散步 15 分钟' }
    ]);
    expect(plan.goalText).toContain('睡够');
    expect(plan.actions.length).toBe(2);
    expect(getActivePlan(u)?.id).toBe(plan.id);

    const done = updateActionStatus(u, plan.actions[0].id, 'done');
    expect(done?.status).toBe('done');
    expect(done?.doneAt).toBeTruthy();
    const partial = updateActionStatus(u, plan.actions[1].id, 'partial');
    expect(partial?.status).toBe('partial');
    // 越权：别人的 actionId 不可改
    expect(updateActionStatus(other, plan.actions[0].id, 'done')).toBeNull();
  });

  it('support plan：调整后旧计划归档、新计划激活', () => {
    const old = createSupportPlan(u, '原计划', [{ actionText: 'a' }]);
    const adj = adjustPlan(u, old.id, '调整后的目标', [{ actionText: 'b1' }, { actionText: 'b2' }]);
    expect(adj).toBeTruthy();
    expect(adj!.source).toBe(`adjust:${old.id}`);
    expect(getActivePlan(u)?.id).toBe(adj!.id);
  });

  it('reflection：晚间三行 + 周复盘', () => {
    const e = addReflection(u, { scope: 'evening', lines: ['今天考了试', '比想象好', '早点睡'] });
    expect(e.lines.length).toBe(3);
    const w = addReflection(u, { scope: 'weekly', helped: '散步有用', notHelped: '熬夜', adjustNote: '下周少喝咖啡' });
    expect(w.helped).toBe('散步有用');
    const ev = listReflections(u, 'evening');
    expect(ev.length).toBe(1);
    expect(ev[0].lines[0]).toBe('今天考了试');
  });

  it('reflection：空复盘被拒绝', () => {
    expect(() => addReflection(u, { scope: 'evening', lines: [] })).toThrow();
  });

  it('safety plan：写入并回读，覆盖更新', () => {
    upsertSafetyPlan(u, {
      contacts: ['室友小李', '辅导员 138xxxx'],
      coping: ['去操场走两圈', '给妈妈打电话'],
      warningSigns: ['连续两天睡不着']
    });
    const p = getSafetyPlan(u);
    expect(p.contacts).toContain('室友小李');
    expect(p.warningSigns[0]).toContain('睡不着');
    upsertSafetyPlan(u, { contacts: ['新联系人'], coping: [], warningSigns: [] });
    expect(getSafetyPlan(u).contacts).toEqual(['新联系人']);
    expect(getSafetyPlan(other).contacts).toEqual([]); // 隔离
  });
});
