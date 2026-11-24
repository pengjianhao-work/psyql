/**
 * 闭环离线评测（npm run eval:loop）。
 *
 * 用合成 fixture 在临时 SQLite 上重放一个试点周，度量：
 * - 签到覆盖率、微行动完成分布、计划调整率、复盘深度、危机路由率
 * 全部确定性计算，不依赖 LLM/外部服务；分数不达标时退出码 1。
 * 用法：npm run eval:loop（或 ts-node server/scripts/eval-loop.ts）
 */
import { closeDb, getDb } from '../src/db/database';
import { createWellbeingCheckin } from '../src/services/loop/checkinService';
import { createSupportPlan, updateActionStatus, adjustPlan } from '../src/services/loop/supportPlanService';
import { addReflection } from '../src/services/loop/reflectionService';
import { getTodayState, getWeeklySummary } from '../src/services/loop/loopOrchestrator';
import { runLoopTurn } from '../src/services/loop/loopRuntime';

process.env.PSYQA_DB_PATH = ':memory:';
closeDb();
const db = getDb();

const day = (n: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
};
const dayKey = (n: number): string => day(n).slice(0, 10);

// --- fixture：学生 A 完整走完 7 天，B 部分完成，C 只签到 --------------------
const A = 'eval_a';
const B = 'eval_b';
const C = 'eval_c';

// 服务层只负责「今天」的写入（不接受自定义日期）；历史分布用直插模拟
const insCheckin = db.prepare(
  'INSERT INTO wellbeing_checkins(user_id, mood, stress, energy, sleep_hours, event_text, skipped, created_at) VALUES (?,?,?,?,?,?,0,?)'
);
const insRefl = db.prepare("INSERT INTO reflections(user_id, scope, created_at) VALUES (?, 'evening', ?)");

// A：7 天签到 + 计划 + 每天 2 行动 + 5 次晚间复盘 + 1 次计划调整
const planA = createSupportPlan(
  A,
  '睡好一点',
  Array.from({ length: 14 }, (_, i) => ({ day: dayKey(6 - Math.floor(i / 2)), actionText: `微行动${i}` }))
);
for (let n = 6; n >= 1; n--) {
  insCheckin.run(A, n % 2 ? '平静' : '紧张', 2 + (n % 3), 3, 6 + n * 0.2, `第${7 - n}天`, day(n));
  if (n <= 4) insRefl.run(A, day(n));
}
createWellbeingCheckin(A, { mood: '平静', stress: 2, energy: 3, eventText: '今天' });
addReflection(A, { scope: 'evening', lines: ['发生了什么', '有用', '调整'] });
planA.actions.slice(0, 10).forEach((a, i) => updateActionStatus(A, a.id, i % 3 === 2 ? 'partial' : 'done'));
planA.actions[10] && updateActionStatus(A, planA.actions[10].id, 'skipped');
const adjustedA = adjustPlan(A, planA.id, '睡前不刷手机', [{ actionText: '手机放客厅' }]);

// B：3 天签到（1 次跳过）+ 计划但不行动
createSupportPlan(B, '少熬夜', [{ actionText: '11 点关电脑' }]);
for (const n of [5, 3]) insCheckin.run(B, '累', 4, 2, null, '', day(n));
createWellbeingCheckin(B, { skipped: true });

// C：只签到一次
createWellbeingCheckin(C, { mood: '一般', stress: 2 });

// --- 度量 -----------------------------------------------------------------
const users = [A, B, C];
const checkinRows = db
  .prepare('SELECT user_id, skipped, substr(created_at,1,10) AS d FROM wellbeing_checkins')
  .all() as { user_id: string; skipped: number; d: string }[];
const actionRows = db.prepare('SELECT status FROM plan_actions').all() as { status: string }[];
const planRows = db.prepare('SELECT source FROM support_plans').all() as { source: string }[];
const reflRows = db.prepare('SELECT scope FROM reflections').all() as { scope: string }[];

const realCheckins = checkinRows.filter((c) => !c.skipped);
const coverage = new Set(realCheckins.map((c) => `${c.user_id}:${c.d}`)).size / (users.length * 7);
const doneLike = actionRows.filter((a) => a.status === 'done' || a.status === 'partial').length;
const adjustRate = planRows.length ? planRows.filter((p) => p.source.startsWith('adjust:')).length / planRows.length : 0;
const reflectionDepth = reflRows.length / users.length;

// 危机路由：高风险文本必须走 safety 且含热线；普通文本不得误触发
const crisis = runLoopTurn(A, '活着没意思，想自杀');
const normal = runLoopTurn(A, '明天考试有点紧张');
const crisisRouted = crisis.mode === 'safety' && crisis.reply.includes('400-161-9995');
const normalNotRouted = normal.mode === 'support';

// 编排视图：today 与 weekly summary 能产出且快照落库
const today = getTodayState(A);
const summary = getWeeklySummary(A);
const snapshotRow = db
  .prepare('SELECT 1 FROM progress_snapshots WHERE user_id = ? AND period = ?')
  .get(A, summary.period);

// --- 报告 -----------------------------------------------------------------
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
console.log('=== 心理闭环离线评测（合成 fixture，3 名学生）===');
console.log(`签到覆盖率（人×天）: ${pct(coverage)}  [目标 ≥ 40%]`);
console.log(`微行动完成/部分完成率: ${pct(actionRows.length ? doneLike / actionRows.length : 0)}  [目标 ≥ 40%]`);
console.log(`计划调整率: ${pct(adjustRate)}  [0–100% 均为有效信息]`);
console.log(`人均复盘条数: ${reflectionDepth.toFixed(1)}  [目标 ≥ 1]`);
console.log(`危机路由（高风险→safety+热线）: ${crisisRouted ? '通过' : '失败'}  [必须通过]`);
console.log(`普通文本不误触发: ${normalNotRouted ? '通过' : '失败'}  [必须通过]`);
console.log(`today 视图 nextStep: ${today.nextStep ? '产出' : '缺失'}`);
console.log(`周总结快照落库: ${snapshotRow ? '产出' : '缺失'}`);
console.log(`A 的计划调整链: ${adjustedA && adjustedA.source === `adjust:${planA.id}` ? '保留' : '丢失'}`);

const checks = [
  coverage >= 0.4,
  actionRows.length > 0 && doneLike / actionRows.length >= 0.4,
  reflectionDepth >= 1,
  crisisRouted,
  normalNotRouted,
  !!today.nextStep,
  !!snapshotRow,
  !!adjustedA
];
const pass = checks.every(Boolean);
console.log(`\n结论: ${pass ? '全部达标 ✓' : '存在未达标项 ✗'}`);
process.exit(pass ? 0 : 1);
