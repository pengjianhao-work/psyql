import { getDb } from '../../db/database';
import { AccountRecord, loadAccounts, PublicAccount } from '../user/accountService';
import { getCollegeById } from '../user/orgService';
import { canAccessStudent } from './schoolService';

/**
 * 教师端「闭环使用」聚合：院系级的签到覆盖、微行动完成分布、计划调整率、
 * 复盘数量——只输出聚合计数，不输出任何个体数据、心情文本或复盘内容。
 *
 * k-匿名与 schoolWeatherService 一致：院系学生数 < K_MIN 或窗口内
 * 参与去重人数 < K_MIN 时，kOk=false、detailed 指标不下发，计数并入
 * mergedSmallGroups。
 */

export interface LoopWeatherGroup {
  groupKey: string;
  label: string;
  participants: number;
  kOk: boolean;
  metrics: {
    checkins30d: number;
    checkinUserDays: number;
    avgStress: number | null;
    avgEnergy: number | null;
    actionsDone: number;
    actionsPartial: number;
    actionsSkipped: number;
    activePlans: number;
    adjustedPlans: number;
    reflections30d: number;
  } | null;
}

export interface SchoolLoopWeather {
  scope: string;
  generatedAt: string;
  windowDays: number;
  groups: LoopWeatherGroup[];
  mergedSmallGroups?: LoopWeatherGroup;
  total: {
    participants: number;
    checkins30d: number;
    actionsDone: number;
    reflections30d: number;
  };
}

const K_MIN = 5;
const WINDOW_DAYS = 30;
const DAY_MS = 86400000;
const MERGED_GROUP_KEY = 'merged-small';
const MERGED_GROUP_LABEL = '小样本院系合并';

interface MetricRow {
  user_id: string;
  stress: number | null;
  energy: number | null;
}
interface ActionRow {
  user_id: string;
  status: string;
}
interface PlanRow {
  user_id: string;
  status: string;
  source: string;
}
interface ReflRow {
  user_id: string;
}

function orgLabel(orgId: string): string {
  if (orgId === 'default') return '未分配院系';
  return getCollegeById(orgId)?.name ?? orgId;
}

const avg = (vals: (number | null)[]): number | null => {
  const xs = vals.filter((v): v is number => typeof v === 'number');
  return xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null;
};

interface GroupAcc {
  groupKey: string;
  label: string;
  studentCount: number;
  checkins: MetricRow[];
  actions: ActionRow[];
  plans: PlanRow[];
  reflections: ReflRow[];
}

function toGroup(acc: GroupAcc): LoopWeatherGroup {
  const participants = new Set([
    ...acc.checkins.map((r) => r.user_id),
    ...acc.actions.map((r) => r.user_id),
    ...acc.reflections.map((r) => r.user_id)
  ]).size;
  const kOk = acc.studentCount >= K_MIN && participants >= K_MIN;
  return {
    groupKey: acc.groupKey,
    label: acc.label,
    participants,
    kOk,
    metrics: kOk
      ? {
          checkins30d: acc.checkins.length,
          checkinUserDays: new Set(acc.checkins.map((r) => r.user_id)).size,
          avgStress: avg(acc.checkins.map((r) => r.stress)),
          avgEnergy: avg(acc.checkins.map((r) => r.energy)),
          actionsDone: acc.actions.filter((a) => a.status === 'done').length,
          actionsPartial: acc.actions.filter((a) => a.status === 'partial').length,
          actionsSkipped: acc.actions.filter((a) => a.status === 'skipped').length,
          activePlans: acc.plans.filter((p) => p.status === 'active').length,
          adjustedPlans: acc.plans.filter((p) => p.source.startsWith('adjust:')).length,
          reflections30d: acc.reflections.length
        }
      : null
  };
}

export async function buildSchoolLoopWeather(user: PublicAccount): Promise<SchoolLoopWeather> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
  const db = getDb();

  const accounts = (await loadAccounts()).users;
  const students = accounts.filter(
    (a): a is AccountRecord => a.role === 'student' && canAccessStudent(user, a)
  );
  const orgIds = [...new Set(students.map((s) => s.orgId || 'default'))].sort();
  const userOrg = new Map(students.map((s) => [s.id, s.orgId || 'default']));
  const inScope = (uid: string) => userOrg.has(uid);

  const checkins = (db
    .prepare('SELECT user_id, stress, energy FROM wellbeing_checkins WHERE created_at >= ? AND skipped = 0')
    .all(cutoff) as MetricRow[]).filter((r) => inScope(r.user_id));
  const actions = (db
    .prepare('SELECT user_id, status FROM plan_actions WHERE created_at >= ?')
    .all(cutoff) as ActionRow[]).filter((r) => inScope(r.user_id));
  const plans = (db
    .prepare('SELECT user_id, status, source FROM support_plans WHERE created_at >= ?')
    .all(cutoff) as PlanRow[]).filter((r) => inScope(r.user_id));
  const reflections = (db
    .prepare('SELECT user_id FROM reflections WHERE created_at >= ?')
    .all(cutoff) as ReflRow[]).filter((r) => inScope(r.user_id));

  const scope = user.role === 'admin' ? '全校' : orgIds.map(orgLabel).join('、') || '本院系';

  const byOrg = new Map<string, GroupAcc>();
  for (const orgId of orgIds) {
    byOrg.set(orgId, {
      groupKey: orgId,
      label: orgLabel(orgId),
      studentCount: students.filter((s) => (s.orgId || 'default') === orgId).length,
      checkins: [],
      actions: [],
      plans: [],
      reflections: []
    });
  }
  const push = <T extends { user_id: string }>(rows: T[], pick: (acc: GroupAcc) => T[]): void => {
    for (const r of rows) pick(byOrg.get(userOrg.get(r.user_id)!)!).push(r);
  };
  push(checkins, (a) => a.checkins);
  push(actions, (a) => a.actions);
  push(plans, (a) => a.plans);
  push(reflections, (a) => a.reflections);

  const groups: LoopWeatherGroup[] = [];
  const smallAccs: GroupAcc[] = [];
  for (const acc of byOrg.values()) {
    const g = toGroup(acc);
    groups.push(g);
    if (!g.kOk) smallAccs.push(acc);
  }

  let mergedSmallGroups: LoopWeatherGroup | undefined;
  if (smallAccs.length) {
    mergedSmallGroups = toGroup({
      groupKey: MERGED_GROUP_KEY,
      label: `${MERGED_GROUP_LABEL}（${smallAccs.map((a) => a.label).join('、')}）`,
      studentCount: smallAccs.reduce((s, a) => s + a.studentCount, 0),
      checkins: smallAccs.flatMap((a) => a.checkins),
      actions: smallAccs.flatMap((a) => a.actions),
      plans: smallAccs.flatMap((a) => a.plans),
      reflections: smallAccs.flatMap((a) => a.reflections)
    });
  }

  if (!groups.length) {
    groups.push(
      toGroup({
        groupKey: 'all',
        label: scope,
        studentCount: students.length,
        checkins,
        actions,
        plans,
        reflections
      })
    );
  }

  return {
    scope,
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    groups,
    mergedSmallGroups,
    total: {
      participants: new Set([
        ...checkins.map((r) => r.user_id),
        ...actions.map((r) => r.user_id),
        ...reflections.map((r) => r.user_id)
      ]).size,
      checkins30d: checkins.length,
      actionsDone: actions.filter((a) => a.status === 'done').length,
      reflections30d: reflections.length
    }
  };
}
