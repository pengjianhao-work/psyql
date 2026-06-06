"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSchoolReport = buildSchoolReport;
exports.schoolReportToCsv = schoolReportToCsv;
exports.schoolMonthlyLedgerCsv = schoolMonthlyLedgerCsv;
exports.schoolMonthlyLedgerExcel = schoolMonthlyLedgerExcel;
const schoolService_1 = require("./schoolService");
const schoolAlertService_1 = require("./schoolAlertService");
const spreadsheetMl_1 = require("../../utils/spreadsheetMl");
function buildSchoolReport(admin) {
    return __awaiter(this, void 0, void 0, function* () {
        const [dashboard, students] = yield Promise.all([
            (0, schoolService_1.getDashboardForUser)(admin),
            (0, schoolService_1.listStudentsForUser)(admin)
        ]);
        const allAlerts = (0, schoolAlertService_1.listAlerts)();
        const byLevel = {};
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
    });
}
function csvEscape(v) {
    const s = String(v !== null && v !== void 0 ? v : '');
    if (/[",\n\r]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
function schoolReportToCsv(report) {
    var _a, _b, _c;
    const lines = [];
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
    lines.push('脱敏姓名,院系,咨询次数,最近咨询,最近情绪,最近风险,压力,焦虑,平稳度,待处理告警');
    for (const s of report.students) {
        lines.push([
            csvEscape(s.maskName),
            csvEscape(s.orgId),
            s.consultCount,
            csvEscape(s.lastConsultTime),
            csvEscape(s.lastEmotion),
            csvEscape(s.lastRisk),
            (_a = s.lastStressLevel) !== null && _a !== void 0 ? _a : '',
            (_b = s.lastAnxietyLevel) !== null && _b !== void 0 ? _b : '',
            (_c = s.lastMoodStability) !== null && _c !== void 0 ? _c : '',
            s.pendingAlerts
        ].join(','));
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
function schoolMonthlyLedgerCsv(report, month) {
    const lines = [];
    lines.push('院系月度心理健康工作台账');
    lines.push(`统计月份,${month}`);
    lines.push(`填报单位,心理港湾系统导出`);
    lines.push(`生成时间,${report.generatedAt}`);
    lines.push('');
    lines.push('序号,脱敏姓名,院系/班级,咨询次数,最近咨询日期,最近情绪,风险等级,压力指数,焦虑指数,待处理预警,备注');
    report.students.forEach((s, i) => {
        var _a, _b, _c;
        lines.push([
            i + 1,
            csvEscape(s.maskName),
            csvEscape(s.orgId),
            s.consultCount,
            csvEscape((_a = s.lastConsultTime) === null || _a === void 0 ? void 0 : _a.slice(0, 10)),
            csvEscape(s.lastEmotion),
            csvEscape(s.lastRisk),
            (_b = s.lastStressLevel) !== null && _b !== void 0 ? _b : '',
            (_c = s.lastAnxietyLevel) !== null && _c !== void 0 ? _c : '',
            s.pendingAlerts,
            ''
        ].join(','));
    });
    return lines.join('\n');
}
/** 高校心理中心标准 Excel 模板（SpreadsheetML .xls） */
function schoolMonthlyLedgerExcel(report, month) {
    const rows = [
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
        var _a, _b, _c, _d, _e, _f, _g;
        rows.push([
            i + 1,
            s.maskName,
            s.orgId,
            s.consultCount,
            (_b = (_a = s.lastConsultTime) === null || _a === void 0 ? void 0 : _a.slice(0, 10)) !== null && _b !== void 0 ? _b : '',
            (_c = s.lastEmotion) !== null && _c !== void 0 ? _c : '',
            (_d = s.lastRisk) !== null && _d !== void 0 ? _d : '',
            (_e = s.lastStressLevel) !== null && _e !== void 0 ? _e : '',
            (_f = s.lastAnxietyLevel) !== null && _f !== void 0 ? _f : '',
            (_g = s.lastMoodStability) !== null && _g !== void 0 ? _g : '',
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
    return (0, spreadsheetMl_1.buildSpreadsheetMl)('月度台账', rows);
}
