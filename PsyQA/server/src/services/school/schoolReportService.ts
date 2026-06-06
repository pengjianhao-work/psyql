import { getDashboardForUser, listStudentsForUser } from './schoolService';
import { listAlerts } from './schoolAlertService';
import { PublicAccount } from '../user/accountService';
import { buildSpreadsheetMl } from '../../utils/spreadsheetMl';

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

/** 院系月度心理台账（Excel 可直接打开 CSV） */
export function schoolMonthlyLedgerCsv(report: SchoolReportPayload, month: string): string {
  const lines: string[] = [];
  lines.push('院系月度心理健康工作台账');
  lines.push(`统计月份,${month}`);
  lines.push(`填报单位,心理港湾系统导出`);
  lines.push(`生成时间,${report.generatedAt}`);
  lines.push('');
  lines.push('序号,脱敏姓名,院系/班级,咨询次数,最近咨询日期,最近情绪,风险等级,压力指数,焦虑指数,待处理预警,备注');
  report.students.forEach((s, i) => {
    lines.push(
      [
        i + 1,
        csvEscape(s.maskName),
        csvEscape(s.orgId),
        s.consultCount,
        csvEscape(s.lastConsultTime?.slice(0, 10)),
        csvEscape(s.lastEmotion),
        csvEscape(s.lastRisk),
        s.lastStressLevel ?? '',
        s.lastAnxietyLevel ?? '',
        s.pendingAlerts,
        ''
      ].join(',')
    );
  });
  return lines.join('\n');
}

/** 高校心理中心标准 Excel 模板（SpreadsheetML .xls） */
export function schoolMonthlyLedgerExcel(report: SchoolReportPayload, month: string): string {
  const rows: Array<Array<string | number>> = [
    ['院系月度心理健康工作台账'],
    ['统计月份', month],
    ['填报单位', '心理港湾系统导出'],
    ['导出人', report.generatedBy.displayName],
    ['生成时间', report.generatedAt],
    [],
    [
      '序号',
      '脱敏姓名',
      '院系/班级',
      '咨询次数',
      '最近咨询日期',
      '最近情绪',
      '风险等级',
      '压力指数',
      '焦虑指数',
      '情绪平稳度',
      '待处理预警',
      '备注'
    ]
  ];
  report.students.forEach((s, i) => {
    rows.push([
      i + 1,
      s.maskName,
      s.orgId,
      s.consultCount,
      s.lastConsultTime?.slice(0, 10) ?? '',
      s.lastEmotion ?? '',
      s.lastRisk ?? '',
      s.lastStressLevel ?? '',
      s.lastAnxietyLevel ?? '',
      s.lastMoodStability ?? '',
      s.pendingAlerts,
      ''
    ]);
  });
  rows.push([]);
  rows.push([
    '汇总',
    '',
    '',
    report.dashboard.totalConsultations,
    '',
    '',
    '',
    '',
    '',
    '',
    report.dashboard.pendingAlerts,
    ''
  ]);
  return buildSpreadsheetMl('月度台账', rows);
}
