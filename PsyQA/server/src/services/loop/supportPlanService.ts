import { getDb } from '../../db/database';

export type PlanStatus = 'active' | 'adjusted' | 'completed' | 'archived';
export type ActionStatus = 'pending' | 'done' | 'partial' | 'skipped';

export interface PlanAction {
  id: number;
  planId: number;
  day: string;
  actionText: string;
  status: ActionStatus;
  doneAt: string | null;
}

export interface SupportPlan {
  id: number;
  userId: string;
  weekOf: string;
  goalText: string;
  status: PlanStatus;
  source: string;
  actions: PlanAction[];
  createdAt: string;
  updatedAt: string;
}

const now = () => new Date().toISOString();
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const weekOf = (d = new Date()) => {
  const day = new Date(d);
  day.setDate(day.getDate() - day.getDay()); // 周一开始
  return dayKey(day);
};

const ACTION_STATUSES: ActionStatus[] = ['pending', 'done', 'partial', 'skipped'];

function mapAction(r: Record<string, unknown>): PlanAction {
  return {
    id: r.id as number,
    planId: r.plan_id as number,
    day: String(r.day),
    actionText: String(r.action_text),
    status: r.status as ActionStatus,
    doneAt: (r.done_at as string | null) ?? null
  };
}

function loadActions(planId: number): PlanAction[] {
  const rows = getDb()
    .prepare('SELECT * FROM plan_actions WHERE plan_id = ? ORDER BY day, id')
    .all(planId) as Array<Record<string, unknown>>;
  return rows.map(mapAction);
}

function mapPlan(r: Record<string, unknown>): SupportPlan {
  return {
    id: r.id as number,
    userId: String(r.user_id),
    weekOf: String(r.week_of),
    goalText: String(r.goal_text),
    status: r.status as PlanStatus,
    source: String(r.source),
    actions: loadActions(r.id as number),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  };
}

export function createSupportPlan(
  userId: string,
  goalText: string,
  actions: { day?: string; actionText: string }[],
  source = 'manual'
): SupportPlan {
  const goal = String(goalText ?? '').trim().slice(0, 200);
  if (!goal) throw new Error('周目标不能为空');
  const items = (actions ?? [])
    .map((a) => ({ day: a.day || dayKey(), actionText: String(a.actionText ?? '').trim().slice(0, 200) }))
    .filter((a) => a.actionText)
    .slice(0, 21); // 每天最多 3 个 × 7 天
  const ts = now();
  const db = getDb();
  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO support_plans (user_id, week_of, goal_text, status, source, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?)`
      )
      .run(userId, weekOf(), goal, source, ts, ts);
    const planId = Number(res.lastInsertRowid);
    const ins = db.prepare(
      'INSERT INTO plan_actions (plan_id, user_id, day, action_text, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const a of items) ins.run(planId, userId, a.day, a.actionText, 'pending', ts);
    return planId;
  });
  const planId = tx();
  return getPlanById(userId, planId)!;
}

export function getActivePlan(userId: string): SupportPlan | null {
  const row = getDb()
    .prepare("SELECT * FROM support_plans WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC, id DESC LIMIT 1")
    .get(userId) as Record<string, unknown> | undefined;
  return row ? mapPlan(row) : null;
}

export function getPlanById(userId: string, planId: number): SupportPlan | null {
  const row = getDb()
    .prepare('SELECT * FROM support_plans WHERE id = ? AND user_id = ?')
    .get(planId, userId) as Record<string, unknown> | undefined;
  return row ? mapPlan(row) : null;
}

export function listPlans(userId: string, limit = 8): SupportPlan[] {
  const rows = getDb()
    .prepare('SELECT * FROM support_plans WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?')
    .all(userId, limit) as Array<Record<string, unknown>>;
  return rows.map(mapPlan);
}

/** 标记微行动状态：done/partial/skipped 都是合法结果，不评判 */
export function updateActionStatus(userId: string, actionId: number, status: ActionStatus): PlanAction | null {
  if (!ACTION_STATUSES.includes(status)) throw new Error('无效状态');
  const db = getDb();
  const doneAt = status === 'pending' ? null : now();
  const res = db
    .prepare('UPDATE plan_actions SET status = ?, done_at = ? WHERE id = ? AND user_id = ?')
    .run(status, doneAt, actionId, userId);
  if (res.changes === 0) return null;
  const row = db.prepare('SELECT * FROM plan_actions WHERE id = ?').get(actionId) as Record<string, unknown>;
  return mapAction(row);
}

/** 蒸馏信号用：最近完成的微行动（done/partial），不取 pending/skipped 的噪声 */
export function listActionSignalRows(
  userId: string,
  limit: number
): { actionText: string; status: ActionStatus; doneAt: string }[] {
  const rows = getDb()
    .prepare(
      `SELECT action_text, status, done_at FROM plan_actions
       WHERE user_id = ? AND status IN ('done','partial') AND done_at IS NOT NULL
       ORDER BY done_at DESC, id DESC LIMIT ?`
    )
    .all(userId, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    actionText: String(r.action_text),
    status: r.status as ActionStatus,
    doneAt: String(r.done_at)
  }));
}

/** 调整计划：旧计划标 adjusted，新计划保留 source 记录调整来源 */
export function adjustPlan(
  userId: string,
  planId: number,
  goalText: string,
  actions: { day?: string; actionText: string }[]
): SupportPlan | null {
  const db = getDb();
  const owned = db.prepare('SELECT id FROM support_plans WHERE id = ? AND user_id = ?').get(planId, userId);
  if (!owned) return null;
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare("UPDATE support_plans SET status = 'adjusted', updated_at = ? WHERE id = ?").run(ts, planId);
    return createSupportPlan(userId, goalText, actions, `adjust:${planId}`);
  });
  return tx();
}
