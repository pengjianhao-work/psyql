/**
 * 闭环编排：把离散的签到/计划/行动/复盘服务编成「今天该做什么」与
 * 「这周过得怎么样」两个可回看视图。
 *
 * - getTodayState：今日签到、当前计划与今日微行动、晚间复盘是否已做，
 *   以及一个可选的下一步（不强迫、可跳过）；
 * - getWeeklySummary：一周内签到/行动/复盘的聚合，写入
 *   progress_snapshots（UNIQUE(user_id, period) 幂等覆盖），并顺带把
 *   已过期的 active 计划标记 completed——周复盘即是收口点。
 * 全部确定性聚合，不依赖 LLM。
 */
import { getDb } from '../../db/database';
import { listWellbeingCheckins, type WellbeingCheckin } from './checkinService';
import { getActivePlan, type SupportPlan } from './supportPlanService';

const dayKey = (d = new Date()): string => d.toISOString().slice(0, 10);
const addDays = (isoDay: string, n: number): string => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (d = new Date()): string => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 周一
  return dayKey(x);
};

export interface TodayState {
  date: string;
  checkin: WellbeingCheckin | null;
  plan: { id: number; goal: string; weekOf: string } | null;
  todayActions: { id: number; text: string; status: string }[];
  eveningReflectionDone: boolean;
  nextStep: string;
}

export function getTodayState(userId: string, today = dayKey()): TodayState {
  const checkin = listWellbeingCheckins(userId, 14).find((c) => c.createdAt.slice(0, 10) === today) ?? null;
  const plan = getActivePlan(userId);
  const db = getDb();
  const reflectionDone = !!db
    .prepare("SELECT 1 FROM reflections WHERE user_id = ? AND scope = 'evening' AND substr(created_at,1,10) = ? LIMIT 1")
    .get(userId, today);

  const todayActions = plan
    ? plan.actions
        .filter((a) => a.day === today)
        .map((a) => ({ id: a.id, text: a.actionText, status: a.status }))
    : [];

  let nextStep = '想签个到吗？心情、睡眠、一件事都行，跳过也算数。';
  if (checkin && todayActions.some((a) => a.status === 'pending')) {
    const pending = todayActions.find((a) => a.status === 'pending');
    nextStep = `今天还有一件小事可以挑：${pending!.text}。做不完也没关系。`;
  } else if (checkin && todayActions.length && !reflectionDone) {
    nextStep = '晚上可以留三行复盘：今天什么有用、什么没用、明天怎么调。';
  } else if (!checkin) {
    nextStep = '想签个到吗？心情、睡眠、一件事都行，跳过也算数。';
  } else if (!plan) {
    nextStep = '要不要为这周定一个小目标？一个就够。';
  }

  return {
    date: today,
    checkin,
    plan: plan ? { id: plan.id, goal: plan.goalText, weekOf: plan.weekOf } : null,
    todayActions,
    eveningReflectionDone: reflectionDone,
    nextStep
  };
}

export interface WeekMetrics {
  checkinDays: number;
  skippedCheckins: number;
  avgStress: number | null;
  avgEnergy: number | null;
  avgSleepHours: number | null;
  moods: string[];
  actions: { done: number; partial: number; skipped: number; pending: number };
  reflections: { evening: number; weekly: number };
}

export interface WeeklySummary {
  period: string;
  weekOf: string;
  metrics: WeekMetrics;
  text: string;
}

const avg = (vals: (number | null)[]): number | null => {
  const xs = vals.filter((v): v is number => typeof v === 'number');
  return xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null;
};

export function getWeeklySummary(userId: string, weekOf = weekStart()): WeeklySummary {
  const db = getDb();
  const end = addDays(weekOf, 7);

  const checkins = db
    .prepare('SELECT * FROM wellbeing_checkins WHERE user_id = ? AND created_at >= ? AND created_at < ?')
    .all(userId, weekOf, end) as Record<string, unknown>[];
  const real = checkins.filter((c) => c.skipped !== 1);

  const actionRows = db
    .prepare('SELECT status FROM plan_actions WHERE user_id = ? AND day >= ? AND day < ?')
    .all(userId, weekOf, end) as { status: string }[];
  const actions = { done: 0, partial: 0, skipped: 0, pending: 0 };
  for (const r of actionRows) {
    if (r.status in actions) actions[r.status as keyof typeof actions] += 1;
  }

  const reflRows = db
    .prepare('SELECT scope FROM reflections WHERE user_id = ? AND created_at >= ? AND created_at < ?')
    .all(userId, weekOf, end) as { scope: string }[];

  const metrics: WeekMetrics = {
    checkinDays: new Set(real.map((c) => String(c.created_at).slice(0, 10))).size,
    skippedCheckins: checkins.length - real.length,
    avgStress: avg(real.map((c) => c.stress as number | null)),
    avgEnergy: avg(real.map((c) => c.energy as number | null)),
    avgSleepHours: avg(real.map((c) => c.sleep_hours as number | null)),
    moods: [...new Set(real.map((c) => String(c.mood)).filter(Boolean))].slice(0, 8),
    actions,
    reflections: {
      evening: reflRows.filter((r) => r.scope === 'evening').length,
      weekly: reflRows.filter((r) => r.scope === 'weekly').length
    }
  };

  // 过期 active 计划收口为 completed（周复盘即收口点，未完成不惩罚）
  db.prepare("UPDATE support_plans SET status = 'completed', updated_at = ? WHERE user_id = ? AND status = 'active' AND week_of < ?")
    .run(new Date().toISOString(), userId, weekOf);

  const period = `week:${weekOf}`;
  db.prepare(
    'INSERT INTO progress_snapshots (user_id, period, metrics_json, created_at) VALUES (?,?,?,?) ' +
      'ON CONFLICT(user_id, period) DO UPDATE SET metrics_json = excluded.metrics_json, created_at = excluded.created_at'
  ).run(userId, period, JSON.stringify(metrics), new Date().toISOString());

  return { period, weekOf, metrics, text: renderWeekText(metrics) };
}

function renderWeekText(m: WeekMetrics): string {
  const doneTotal = m.actions.done + m.actions.partial;
  const parts: string[] = [
    `这周你签到了 ${m.checkinDays} 天${m.skippedCheckins ? `（含 ${m.skippedCheckins} 次选择跳过）` : ''}。`
  ];
  if (m.avgStress != null || m.avgEnergy != null) {
    parts.push(
      `平均压力 ${m.avgStress ?? '—'}/5，平均能量 ${m.avgEnergy ?? '—'}/5` +
        (m.avgSleepHours != null ? `，平均睡眠 ${m.avgSleepHours} 小时` : '') +
        '——只是自我觉察，不是诊断。'
    );
  }
  if (m.moods.length) parts.push(`这周常出现的心情：${m.moods.join('、')}。`);
  parts.push(
    doneTotal > 0
      ? `微行动完成 ${m.actions.done} 件、部分完成 ${m.actions.partial} 件` +
          (m.actions.skipped ? `，跳过 ${m.actions.skipped} 件——跳过也是真实记录` : '') +
          '。'
      : '这周还没有微行动记录，没关系，下周可以从一件小事开始。'
  );
  if (m.reflections.evening + m.reflections.weekly > 0) {
    parts.push(`留下了 ${m.reflections.evening + m.reflections.weekly} 条复盘。`);
  }
  parts.push('下周想继续、调整还是换个方向，都可以。');
  return parts.join('\n');
}
