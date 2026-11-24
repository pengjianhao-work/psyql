import { getDb } from '../../db/database';
import { listMoodCheckins } from './moodCheckinService';
import { listTrainingSessions } from '../../db/trainingStore';

/**
 * 打卡看板：wellness_tasks 存用户任务与已完成日期（本地 YYYY-MM-DD）。
 * kind=mood/training 的任务会与真实数据源自动同步完成日期：
 * - mood ← mood_checkins
 * - training ← training_sessions(status=completed)
 * custom 任务仅手动勾选。
 */

export type TaskKind = 'mood' | 'training' | 'custom';

export interface WellnessTask {
  id: number;
  title: string;
  kind: TaskKind;
  doneDates: string[];
  createdAt: string;
}

export interface TaskBoardStats {
  today: string;
  doneToday: number;
  totalActive: number;
  /** 连续打卡天数：今天或昨天起算的连续完成日 */
  streakDays: number;
  /** 最近 7 天（含今天）每天是否有任意任务完成 */
  week: Array<{ date: string; done: boolean }>;
}

export interface TaskBoardPayload {
  tasks: WellnessTask[];
  stats: TaskBoardStats;
}

const KIND_LABEL: Record<TaskKind, string> = {
  mood: '情绪打卡',
  training: '微训练',
  custom: '自定义'
};

export function taskKindLabel(kind: TaskKind): string {
  return KIND_LABEL[kind] ?? '自定义';
}

function toLocalDate(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocalDate(): string {
  return toLocalDate(new Date());
}

interface TaskRow {
  id: number;
  user_id: string;
  title: string;
  kind: string;
  done_dates: string;
  created_at: string;
  archived: number;
}

function parseDoneDates(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

function toTask(row: TaskRow): WellnessTask {
  return {
    id: row.id,
    title: row.title,
    kind: (['mood', 'training', 'custom'].includes(row.kind) ? row.kind : 'custom') as TaskKind,
    doneDates: parseDoneDates(row.done_dates),
    createdAt: row.created_at
  };
}

function listTaskRows(userId: string, includeArchived = false): TaskRow[] {
  const sql = includeArchived
    ? 'SELECT * FROM wellness_tasks WHERE user_id = ? ORDER BY id ASC'
    : 'SELECT * FROM wellness_tasks WHERE user_id = ? AND archived = 0 ORDER BY id ASC';
  return getDb().prepare(sql).all(userId) as TaskRow[];
}

const SEED_TASKS: Array<{ title: string; kind: TaskKind }> = [
  { title: '每日情绪打卡', kind: 'mood' },
  { title: '完成一次微训练', kind: 'training' },
  { title: '睡前 4-6 呼吸练习', kind: 'custom' }
];

function ensureSeedTasks(userId: string): void {
  const count = (
    getDb()
      .prepare('SELECT COUNT(*) as c FROM wellness_tasks WHERE user_id = ? AND archived = 0')
      .get(userId) as { c: number }
  ).c;
  if (count > 0) return;
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    'INSERT INTO wellness_tasks(user_id, title, kind, done_dates, created_at, archived) VALUES(?, ?, ?, ?, ?, 0)'
  );
  for (const seed of SEED_TASKS) {
    stmt.run(userId, seed.title, seed.kind, '[]', now);
  }
}

/** 把真实数据源的完成日期合并进 mood/training 任务的 done_dates（幂等）。 */
function syncAutoCompletions(userId: string, tasks: WellnessTask[]): void {
  const needMood = tasks.some((t) => t.kind === 'mood');
  const needTraining = tasks.some((t) => t.kind === 'training');
  if (!needMood && !needTraining) return;

  const sourceDates = new Set<string>();
  if (needMood) {
    for (const c of listMoodCheckins(userId, 100)) {
      const d = toLocalDate(c.createdAt);
      if (d) sourceDates.add(d);
    }
  }
  const trainingDates = new Set<string>();
  if (needTraining) {
    for (const s of listTrainingSessions(userId, 100)) {
      if (s.status !== 'completed' || !s.completedAt) continue;
      const d = toLocalDate(s.completedAt);
      if (d) trainingDates.add(d);
    }
  }

  const update = getDb().prepare(
    'UPDATE wellness_tasks SET done_dates = ? WHERE id = ? AND user_id = ?'
  );
  for (const task of tasks) {
    const extra =
      task.kind === 'mood' ? [...sourceDates] : task.kind === 'training' ? [...trainingDates] : [];
    if (!extra.length) continue;
    const merged = new Set([...task.doneDates, ...extra]);
    if (merged.size === task.doneDates.length) continue;
    task.doneDates = [...merged].sort();
    update.run(JSON.stringify(task.doneDates), task.id, userId);
  }
}

function computeStreak(allDoneDates: Set<string>, today: string): number {
  let cursor = new Date(`${today}T00:00:00`);
  // 今天没完成则从昨天开始算
  if (!allDoneDates.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (allDoneDates.has(toLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getTaskBoard(userId: string): TaskBoardPayload {
  ensureSeedTasks(userId);
  const tasks = listTaskRows(userId).map(toTask);
  syncAutoCompletions(userId, tasks);

  const today = todayLocalDate();
  const allDone = new Set<string>();
  let doneToday = 0;
  for (const t of tasks) {
    for (const d of t.doneDates) allDone.add(d);
    if (t.doneDates.includes(today)) doneToday += 1;
  }

  const week: TaskBoardStats['week'] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - i);
    const date = toLocalDate(d);
    week.push({ date, done: allDone.has(date) });
  }

  return {
    tasks,
    stats: {
      today,
      doneToday,
      totalActive: tasks.length,
      streakDays: computeStreak(allDone, today),
      week
    }
  };
}

export function addWellnessTask(userId: string, title: string, kind: TaskKind = 'custom'): WellnessTask {
  const clean = title.trim().slice(0, 40);
  if (!clean) throw new Error('任务标题不能为空');
  const safeKind: TaskKind = ['mood', 'training', 'custom'].includes(kind) ? kind : 'custom';
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      'INSERT INTO wellness_tasks(user_id, title, kind, done_dates, created_at, archived) VALUES(?, ?, ?, ?, ?, 0)'
    )
    .run(userId, clean, safeKind, '[]', now);
  const row = getDb()
    .prepare('SELECT * FROM wellness_tasks WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as TaskRow;
  return toTask(row);
}

export function toggleTaskDone(userId: string, taskId: number): WellnessTask | null {
  const row = getDb()
    .prepare('SELECT * FROM wellness_tasks WHERE id = ? AND user_id = ? AND archived = 0')
    .get(taskId, userId) as TaskRow | undefined;
  if (!row) return null;
  const task = toTask(row);
  const today = todayLocalDate();
  const has = task.doneDates.includes(today);
  const next = has
    ? task.doneDates.filter((d) => d !== today)
    : [...task.doneDates, today].sort();
  getDb()
    .prepare('UPDATE wellness_tasks SET done_dates = ? WHERE id = ? AND user_id = ?')
    .run(JSON.stringify(next), taskId, userId);
  return { ...task, doneDates: next };
}

export function archiveWellnessTask(userId: string, taskId: number): boolean {
  const result = getDb()
    .prepare('UPDATE wellness_tasks SET archived = 1 WHERE id = ? AND user_id = ?')
    .run(taskId, userId);
  return result.changes > 0;
}
