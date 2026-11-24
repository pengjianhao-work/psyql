import { getDb } from '../../db/database';
import { AccountRecord, loadAccounts, PublicAccount } from '../user/accountService';
import { getCollegeById } from '../user/orgService';
import { MOOD_VALENCE } from '../user/moodCheckinService';
import { listAlerts, SchoolAlert } from './schoolAlertService';
import { canAccessStudent } from './schoolService';

/**
 * 教师端「情绪气象」：只输出院系级聚合数据。
 *
 * k-匿名：某院系学生账号数 < K_MIN，或窗口内打卡去重人数 < K_MIN 时，
 * 该组标记 kOk=false，不下发心情分布与 7 日趋势，其计数并入
 * mergedSmallGroups（小样本院系合并组）与 total。
 *
 * 心情分：复用 moodCheckinService 的 MOOD_VALENCE 效价表
 * （积极 +2 / 平稳 +1 / 疲惫中性 0 / 烦躁焦虑 -1 / 低落 -2），
 * trend7d 的 avgMoodScore 为当日打卡效价均值。
 */

export interface SchoolWeatherTrendPoint {
  /** UTC 日期 YYYY-MM-DD */
  day: string;
  count: number;
  avgMoodScore?: number;
}

export interface SchoolWeatherGroup {
  /** 院系 orgId，合并组为 'merged-small'，兜底组为 'all' */
  groupKey: string;
  label: string;
  /** 近 30 天打卡去重学生数 */
  activeUsers: number;
  kOk: boolean;
  /** 近 7 天心情 → 次数；kOk=false 时恒为空对象 */
  moodDistribution: Record<string, number>;
  /** 近 7 天逐日打卡；kOk=false 时恒为空数组 */
  trend7d: SchoolWeatherTrendPoint[];
  alerts: { pending: number; total30d: number };
}

export interface SchoolWeather {
  scope: string;
  generatedAt: string;
  groups: SchoolWeatherGroup[];
  /** 小样本院系合并组；没有小样本院系时缺省 */
  mergedSmallGroups?: SchoolWeatherGroup;
  total: {
    activeUsers: number;
    checkins7d: number;
    checkins30d: number;
    alertsPending: number;
    alerts30d: number;
  };
}

const K_MIN = 5;
const DAY_MS = 86400000;
const WINDOW_DAYS = 30;
const TREND_DAYS = 7;
const MERGED_GROUP_KEY = 'merged-small';
const MERGED_GROUP_LABEL = '小样本院系合并';

interface CheckinRow {
  user_id: string;
  mood: string;
  created_at: string;
}

function orgLabel(orgId: string): string {
  if (orgId === 'default') return '未分配院系';
  return getCollegeById(orgId)?.name ?? orgId;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** 近 TREND_DAYS 个 UTC 日期（升序），含今天 */
function lastTrendDays(nowMs: number): string[] {
  const days: string[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    days.push(dayKey(new Date(nowMs - i * DAY_MS).toISOString()));
  }
  return days;
}

interface GroupAcc {
  groupKey: string;
  label: string;
  studentCount: number;
  checkins: CheckinRow[];
  alerts: SchoolAlert[];
}

function toWeatherGroup(acc: GroupAcc, nowMs: number, trendDays: string[]): SchoolWeatherGroup {
  const cutoff7 = dayKey(new Date(nowMs - (TREND_DAYS - 1) * DAY_MS).toISOString());
  const cutoff30 = new Date(nowMs - WINDOW_DAYS * DAY_MS).toISOString();
  const distinctUsers = new Set(acc.checkins.map((c) => c.user_id)).size;
  const kOk = acc.studentCount >= K_MIN && distinctUsers >= K_MIN;

  const moodDistribution: Record<string, number> = {};
  const trend7d: SchoolWeatherTrendPoint[] = [];
  if (kOk) {
    for (const c of acc.checkins) {
      if (dayKey(c.created_at) >= cutoff7) {
        moodDistribution[c.mood] = (moodDistribution[c.mood] ?? 0) + 1;
      }
    }
    for (const day of trendDays) {
      const dayRows = acc.checkins.filter((c) => dayKey(c.created_at) === day);
      const avg =
        dayRows.length > 0
          ? dayRows.reduce((s, c) => s + (MOOD_VALENCE[c.mood] ?? 0), 0) / dayRows.length
          : undefined;
      trend7d.push({
        day,
        count: dayRows.length,
        ...(avg !== undefined ? { avgMoodScore: Math.round(avg * 100) / 100 } : {})
      });
    }
  }

  return {
    groupKey: acc.groupKey,
    label: acc.label,
    activeUsers: distinctUsers,
    kOk,
    moodDistribution,
    trend7d,
    alerts: {
      pending: acc.alerts.filter((a) => a.status === 'pending').length,
      total30d: acc.alerts.filter((a) => a.createdAt >= cutoff30).length
    }
  };
}

export async function buildSchoolWeather(user: PublicAccount): Promise<SchoolWeather> {
  const nowMs = Date.now();
  const trendDays = lastTrendDays(nowMs);
  const cutoff30 = new Date(nowMs - WINDOW_DAYS * DAY_MS).toISOString();
  const cutoff7day = trendDays[0];

  const accounts = (await loadAccounts()).users;
  const students = accounts.filter(
    (a): a is AccountRecord => a.role === 'student' && canAccessStudent(user, a)
  );

  // 与 schoolService 一致的院系范围：admin 全校，其余按 managedOrgIds / orgId
  const orgFilter =
    user.role === 'admin'
      ? undefined
      : user.managedOrgIds?.length
        ? user.managedOrgIds
        : user.orgId
          ? [user.orgId]
          : undefined;

  const orgIds = [...new Set(students.map((s) => s.orgId || 'default'))].sort();
  const userOrg = new Map(students.map((s) => [s.id, s.orgId || 'default']));

  const checkins = (
    getDb()
      .prepare('SELECT user_id, mood, created_at FROM mood_checkins WHERE created_at >= ?')
      .all(cutoff30) as CheckinRow[]
  ).filter((r) => userOrg.has(r.user_id));

  const alerts = listAlerts({ orgIds: orgFilter });

  const scope =
    user.role === 'admin'
      ? '全校'
      : orgIds.length
        ? orgIds.map(orgLabel).join('、')
        : '本院系';

  const byOrg = new Map<string, GroupAcc>();
  for (const orgId of orgIds) {
    byOrg.set(orgId, {
      groupKey: orgId,
      label: orgLabel(orgId),
      studentCount: students.filter((s) => (s.orgId || 'default') === orgId).length,
      checkins: [],
      alerts: []
    });
  }
  for (const c of checkins) {
    byOrg.get(userOrg.get(c.user_id)!)?.checkins.push(c);
  }
  for (const a of alerts) {
    byOrg.get(a.orgId || 'default')?.alerts.push(a);
  }

  // kOk=false 的组保留在列表中（只有计数，无分布/趋势），计数同时并入合并组与 total
  const groups: SchoolWeatherGroup[] = [];
  const smallAccs: GroupAcc[] = [];
  for (const acc of byOrg.values()) {
    const g = toWeatherGroup(acc, nowMs, trendDays);
    groups.push(g);
    if (!g.kOk) smallAccs.push(acc);
  }

  let mergedSmallGroups: SchoolWeatherGroup | undefined;
  if (smallAccs.length > 0) {
    const merged: GroupAcc = {
      groupKey: MERGED_GROUP_KEY,
      label: MERGED_GROUP_LABEL,
      studentCount: smallAccs.reduce((s, a) => s + a.studentCount, 0),
      checkins: smallAccs.flatMap((a) => a.checkins),
      alerts: smallAccs.flatMap((a) => a.alerts)
    };
    mergedSmallGroups = toWeatherGroup(merged, nowMs, trendDays);
    mergedSmallGroups.label =
      `${MERGED_GROUP_LABEL}（${smallAccs.map((a) => a.label).join('、')}）`;
  }

  // 兜底：无法枚举任何院系时输出单一范围组
  if (groups.length === 0) {
    const fallback: GroupAcc = {
      groupKey: 'all',
      label: scope,
      studentCount: students.length,
      checkins,
      alerts
    };
    groups.push(toWeatherGroup(fallback, nowMs, trendDays));
  }

  return {
    scope,
    generatedAt: new Date(nowMs).toISOString(),
    groups,
    mergedSmallGroups,
    total: {
      activeUsers: new Set(checkins.map((c) => c.user_id)).size,
      checkins7d: checkins.filter((c) => dayKey(c.created_at) >= cutoff7day).length,
      checkins30d: checkins.length,
      alertsPending: alerts.filter((a) => a.status === 'pending').length,
      alerts30d: alerts.filter((a) => a.createdAt >= cutoff30).length
    }
  };
}
