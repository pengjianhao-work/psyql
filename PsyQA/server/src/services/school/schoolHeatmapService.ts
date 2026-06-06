import { listStudentsForUser } from './schoolService';
import { listAlerts } from './schoolAlertService';
import { PublicAccount } from '../user/accountService';

export interface HeatmapCell {
  orgId: string;
  className: string;
  studentCount: number;
  consultCount: number;
  highRiskCount: number;
  pendingAlerts: number;
  avgStress: number;
  heatLevel: 'low' | 'medium' | 'high' | 'critical';
  topIssue?: string;
}

export interface SchoolHeatmapPayload {
  month: string;
  cells: HeatmapCell[];
  groupInsight: string;
}

function heatFromMetrics(highRisk: number, pending: number, avgStress: number): HeatmapCell['heatLevel'] {
  if (highRisk >= 2 || pending >= 2) return 'critical';
  if (highRisk >= 1 || pending >= 1 || avgStress >= 65) return 'high';
  if (avgStress >= 50 || pending > 0) return 'medium';
  return 'low';
}

export async function buildSchoolHeatmap(user: PublicAccount, month?: string): Promise<SchoolHeatmapPayload> {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const students = await listStudentsForUser(user);
  const alerts = listAlerts();

  const byClass = new Map<string, typeof students>();
  for (const s of students) {
    const key = `${s.orgId}::${s.className || '未分班'}`;
    const list = byClass.get(key) || [];
    list.push(s);
    byClass.set(key, list);
  }

  const cells: HeatmapCell[] = [];
  for (const [key, group] of byClass) {
    const [orgId, className] = key.split('::');
    const ids = new Set(group.map((g) => g.id));
    const classAlerts = alerts.filter(
      (a) => ids.has(a.studentId) && a.dialogTime.startsWith(targetMonth.slice(0, 7))
    );
    const highRisk = group.filter((g) => g.lastRisk === 'high' || g.lastRisk === 'critical').length;
    const pending = group.reduce((a, g) => a + (g.pendingAlerts || 0), 0);
    const stresses = group.map((g) => g.lastStressLevel).filter((v): v is number => v != null);
    const avgStress = stresses.length
      ? Math.round(stresses.reduce((a, b) => a + b, 0) / stresses.length)
      : 0;

    const problems: Record<string, number> = {};
    for (const g of group) {
      if (g.lastProblem) problems[g.lastProblem] = (problems[g.lastProblem] || 0) + 1;
    }
    const topIssue = Object.entries(problems).sort((a, b) => b[1] - a[1])[0]?.[0];

    cells.push({
      orgId,
      className,
      studentCount: group.length,
      consultCount: group.reduce((a, g) => a + g.consultCount, 0),
      highRiskCount: highRisk,
      pendingAlerts: pending + classAlerts.filter((a) => a.status === 'pending').length,
      avgStress,
      heatLevel: heatFromMetrics(highRisk, pending, avgStress),
      topIssue
    });
  }

  cells.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.heatLevel] - order[b.heatLevel];
  });

  const hot = cells.filter((c) => c.heatLevel === 'critical' || c.heatLevel === 'high');
  let groupInsight = `${targetMonth} 各班级心理态势整体平稳。`;
  if (hot.length) {
    groupInsight = `${hot.length} 个班级/分组呈现偏高风险聚集（${hot.map((h) => h.className).join('、')}），建议优先关注考前焦虑与人际适应议题。`;
  }

  return { month: targetMonth, cells, groupInsight };
}
