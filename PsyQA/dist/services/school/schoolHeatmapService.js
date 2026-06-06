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
exports.buildSchoolHeatmap = buildSchoolHeatmap;
const schoolService_1 = require("./schoolService");
const schoolAlertService_1 = require("./schoolAlertService");
function heatFromMetrics(highRisk, pending, avgStress) {
    if (highRisk >= 2 || pending >= 2)
        return 'critical';
    if (highRisk >= 1 || pending >= 1 || avgStress >= 65)
        return 'high';
    if (avgStress >= 50 || pending > 0)
        return 'medium';
    return 'low';
}
function buildSchoolHeatmap(user, month) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const targetMonth = month || new Date().toISOString().slice(0, 7);
        const students = yield (0, schoolService_1.listStudentsForUser)(user);
        const alerts = (0, schoolAlertService_1.listAlerts)();
        const byClass = new Map();
        for (const s of students) {
            const key = `${s.orgId}::${s.className || '未分班'}`;
            const list = byClass.get(key) || [];
            list.push(s);
            byClass.set(key, list);
        }
        const cells = [];
        for (const [key, group] of byClass) {
            const [orgId, className] = key.split('::');
            const ids = new Set(group.map((g) => g.id));
            const classAlerts = alerts.filter((a) => ids.has(a.studentId) && a.dialogTime.startsWith(targetMonth.slice(0, 7)));
            const highRisk = group.filter((g) => g.lastRisk === 'high' || g.lastRisk === 'critical').length;
            const pending = group.reduce((a, g) => a + (g.pendingAlerts || 0), 0);
            const stresses = group.map((g) => g.lastStressLevel).filter((v) => v != null);
            const avgStress = stresses.length
                ? Math.round(stresses.reduce((a, b) => a + b, 0) / stresses.length)
                : 0;
            const problems = {};
            for (const g of group) {
                if (g.lastProblem)
                    problems[g.lastProblem] = (problems[g.lastProblem] || 0) + 1;
            }
            const topIssue = (_a = Object.entries(problems).sort((a, b) => b[1] - a[1])[0]) === null || _a === void 0 ? void 0 : _a[0];
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
    });
}
