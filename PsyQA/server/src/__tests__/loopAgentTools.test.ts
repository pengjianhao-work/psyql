import { closeDb, getDb } from '../db/database';
import { executeLoopTool } from '../services/loop/loopAgentTools';
import { runLoopTurn } from '../services/loop/loopRuntime';
import { createSupportPlan } from '../services/loop/supportPlanService';
import { upsertSafetyPlan } from '../services/loop/reflectionService';
import { listUserFacts } from '../services/user/userFactService';

describe('loop agent tools + runtime 安全门禁', () => {
  const u = 'tool_user';
  const other = 'tool_other';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
    getDb();
  });

  it('safety_check 返回风险等级与热线', () => {
    const r = executeLoopTool(u, 'safety_check', { text: '今天有点累' });
    expect(r.ok).toBe(true);
    const out = r.output as { level: string; hotline: string };
    expect(['low', 'medium', 'high', 'critical']).toContain(out.level);
    expect(out.hotline).toContain('400-161-9995');
  });

  it('high/critical 下除 safety_check 外全部工具被阻断', () => {
    const ctx = { riskLevel: 'high' as const };
    for (const name of [
      'get_recent_signals',
      'search_psych_knowledge',
      'create_support_plan',
      'adjust_plan',
      'log_micro_action',
      'log_reflection',
      'suggest_practice',
      'update_memory'
    ] as const) {
      const r = executeLoopTool(u, name, { confirmed: true, goalText: 'x', text: 'x' }, ctx);
      expect(r.blocked).toBe(true);
      expect(r.ok).toBe(false);
    }
    const safe = executeLoopTool(u, 'safety_check', { text: 'x' }, ctx);
    expect(safe.ok).toBe(true);
  });

  it('update_memory 未经确认拒绝写入，确认后写进 user_facts', () => {
    const refused = executeLoopTool(u, 'update_memory', { fact: '用户确认散步有效' });
    expect(refused.ok).toBe(false);
    const wrote = executeLoopTool(u, 'update_memory', { fact: '用户确认散步有效', confirmed: true });
    expect(wrote.ok).toBe(true);
    const facts = listUserFacts(u);
    expect(facts.some((f) => f.fact === '用户确认散步有效')).toBe(true);
  });

  it('log_micro_action 不越权更新他人行动，自由练习写 practice_logs', () => {
    const plan = createSupportPlan(other, '别人的计划', [{ actionText: '散步' }]);
    const stolen = executeLoopTool(u, 'log_micro_action', { actionId: plan.actions[0].id, status: 'done' });
    expect(stolen.ok).toBe(true);
    expect(stolen.output).toBeNull(); // 越权返回 null，行动仍是 pending
    const log = executeLoopTool(u, 'log_micro_action', { kind: 'breathing', outcome: 'done' });
    expect(log.ok).toBe(true);
    const row = getDb()
      .prepare('SELECT * FROM practice_logs WHERE user_id = ? AND kind = ?')
      .get(u, 'breathing') as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!.outcome).toBe('done');
  });

  it('runLoopTurn：危机文本走安全路径，含热线与用户应急卡', () => {
    upsertSafetyPlan(u, { contacts: ['室友小王'], coping: ['下楼走走'], warningSigns: ['睡不着'] });
    const r = runLoopTurn(u, '活着没意思，想自杀');
    expect(r.mode).toBe('safety');
    expect(['high', 'critical']).toContain(r.riskLevel);
    expect(r.reply).toContain('400-161-9995');
    expect(r.reply).toContain('室友小王');
    expect(r.toolsUsed).toEqual(['safety_check']); // 安全路径只跑一个工具
  });

  it('runLoopTurn：普通文本走 support，给可选下一步', () => {
    const r = runLoopTurn(u, '明天有考试，有点紧张');
    expect(r.mode).toBe('support');
    expect(r.riskLevel).not.toBe('high');
    expect(r.riskLevel).not.toBe('critical');
    expect(r.toolsUsed[0]).toBe('safety_check');
    expect(r.steps).toBeLessThanOrEqual(5);
    expect(r.reply.length).toBeGreaterThan(0);
  });
});
