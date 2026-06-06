import { getDashboardForUser, listStudentsForUser } from './schoolService';
import { listAlerts } from './schoolAlertService';
import { PublicAccount } from '../user/accountService';

export interface SchoolReportPayload {
  generatedAt: string;
  generatedBy: { id: string; displayName: string; role: string };
  dashboard: Awaited<ReturnType<typeof getDashboardForUser>>;
  students: Awaited<ReturnType<typeof listStudentsForUser>>;
  alerts: {
    total: number;
    pending: number;
    byLevel: Record<string, number>;
    recent: ReturnType<typeof listAlerts>;
  };
}

export async function buildSchoolReport(admin: PublicAccount): Promise<SchoolReportPayload> {
  const [dashboard, students] = await Promise.all([
    getDashboardForUser(admin),
    listStudentsForUser(admin)
  ]);

  const allAlerts = listAlerts();
  const byLevel: Record<string, number> = {};
  for (const a of allAlerts) {
    byLevel[a.level] = (byLevel[a.level] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: {
      id: admin.id,
      displayName: admin.displayName,
      role: admin.role
    },
    dashboard,
    students,
    alerts: {
      total: allAlerts.length,
      pending: allAlerts.filter((a) => a.status === 'pending').length,
      byLevel,
      recent: allAlerts.slice(0, 50)
    }
  };
}

function csvEscape(v: string | number | undefined): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function schoolReportToCsv(report: SchoolReportPayload): string {
  const lines: string[] = [];
  lines.push('心理港湾 · 全校心理态势报表');
  lines.push(`生成时间,${report.generatedAt}`);
  lines.push(`导出人,${csvEscape(report.generatedBy.displayName)}`);
  lines.push('');
  lines.push('【看板摘要】');
  lines.push(`累计咨询次数,${report.dashboard.totalConsultations}`);
  lines.push(`活跃学生数,${report.dashboard.activeStudents}`);
  lines.push(`高危对话数,${report.dashboard.highRiskCount}`);
  lines.push(`待处理告警,${report.dashboard.pendingAlerts}`);
  lines.push(`平均压力指数,${report.dashboard.avgStress}`);
  lines.push('');
  lines.push('【学生明细】');
  lines.push(
    '脱敏姓名,院系,咨询次数,最近咨询,最近情绪,最近风险,压力,焦虑,平稳度,待处理告警'
  );
  for (const s of report.students) {
    lines.push(
      [
        csvEscape(s.maskName),
        csvEscape(s.orgId),
        s.consultCount,
        csvEscape(s.lastConsultTime),
        csvEscape(s.lastEmotion),
        csvEscape(s.lastRisk),
        s.lastStressLevel ?? '',
        s.lastAnxietyLevel ?? '',
        s.lastMoodStability ?? '',
        s.pendingAlerts
      ].join(',')
    );
  }
  lines.push('');
  lines.push('【告警统计】');
  lines.push(`总数,${report.alerts.total}`);
  lines.push(`待处理,${report.alerts.pending}`);
  for (const [level, count] of Object.entries(report.alerts.byLevel)) {
    lines.push(`${level},${count}`);
  }
  return lines.join('\n');
}
