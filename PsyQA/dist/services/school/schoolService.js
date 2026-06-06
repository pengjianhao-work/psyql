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
exports.getDashboardForUser = getDashboardForUser;
exports.listStudentsForUser = listStudentsForUser;
exports.getStudentSummaryForUser = getStudentSummaryForUser;
exports.getAlertsForUser = getAlertsForUser;
const historyManager_1 = require("../common/historyManager");
const accountService_1 = require("../user/accountService");
const schoolAlertService_1 = require("./schoolAlertService");
const emotionService_1 = require("../psych/emotionService");
function canAccessOrg(user, orgId) {
    var _a;
    if (user.role === 'admin')
        return true;
    if (!((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length))
        return orgId === user.orgId || orgId === 'default';
    return user.managedOrgIds.includes(orgId);
}
function getDashboardForUser(user) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const accounts = (yield (0, accountService_1.loadAccounts)()).users.filter((a) => a.role === 'student');
        const visibleStudents = accounts.filter((a) => canAccessOrg(user, a.orgId || 'default'));
        let totalConsultations = 0;
        const activeSet = new Set();
        let highRiskCount = 0;
        const problemCounts = new Map();
        const emotionCounts = new Map();
        let stressSum = 0;
        let stressN = 0;
        for (const st of visibleStudents) {
            const hist = (0, historyManager_1.getUserHistory)(st.id);
            if (!(hist === null || hist === void 0 ? void 0 : hist.dialogs.length))
                continue;
            activeSet.add(st.id);
            totalConsultations += hist.dialogs.length;
            for (const d of hist.dialogs) {
                if (!d.psych)
                    continue;
                if (d.psych.risk === 'high' || d.psych.risk === 'critical')
                    highRiskCount++;
                const prob = (0, emotionService_1.getCategoryName)(d.psych.problem);
                problemCounts.set(prob, (problemCounts.get(prob) || 0) + 1);
                emotionCounts.set(d.psych.emotion, (emotionCounts.get(d.psych.emotion) || 0) + 1);
                stressSum += d.psych.stressLevel;
                stressN++;
            }
        }
        const orgFilter = user.role === 'admin' ? undefined : ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length) ? user.managedOrgIds : user.orgId ? [user.orgId] : undefined;
        const pendingAlerts = (0, schoolAlertService_1.listAlerts)({ status: 'pending', orgIds: orgFilter }).length;
        const toTop3Category = (m) => {
            const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
            return [...m.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([category, count]) => ({ category, count, share: Math.round((count / total) * 100) }));
        };
        const toTop3Emotion = (m) => {
            const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
            return [...m.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([emotion, count]) => ({ emotion, count, share: Math.round((count / total) * 100) }));
        };
        return {
            totalConsultations,
            activeStudents: activeSet.size,
            highRiskCount,
            pendingAlerts,
            problemTop3: toTop3Category(problemCounts),
            emotionTop3: toTop3Emotion(emotionCounts),
            avgStress: stressN ? Math.round(stressSum / stressN) : 0
        };
    });
}
function listStudentsForUser(user) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const accounts = (yield (0, accountService_1.loadAccounts)()).users.filter((a) => a.role === 'student');
        const orgFilter = user.role === 'admin' ? undefined : ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length) ? user.managedOrgIds : user.orgId ? [user.orgId] : undefined;
        const pendingByStudent = new Map();
        (0, schoolAlertService_1.listAlerts)({ status: 'pending', orgIds: orgFilter }).forEach((a) => {
            pendingByStudent.set(a.studentId, (pendingByStudent.get(a.studentId) || 0) + 1);
        });
        return accounts
            .filter((a) => canAccessOrg(user, a.orgId || 'default'))
            .map((st) => {
            var _a, _b, _c, _d, _e, _f;
            const hist = (0, historyManager_1.getUserHistory)(st.id);
            const last = hist === null || hist === void 0 ? void 0 : hist.dialogs.filter((d) => d.psych).slice(-1)[0];
            return {
                id: st.id,
                maskName: (0, accountService_1.maskStudentDisplay)(st.displayName, st.studentNo),
                orgId: st.orgId || 'default',
                lastConsultTime: last === null || last === void 0 ? void 0 : last.time,
                lastEmotion: (_a = last === null || last === void 0 ? void 0 : last.psych) === null || _a === void 0 ? void 0 : _a.emotion,
                lastRisk: (_b = last === null || last === void 0 ? void 0 : last.psych) === null || _b === void 0 ? void 0 : _b.risk,
                lastStressLevel: (_c = last === null || last === void 0 ? void 0 : last.psych) === null || _c === void 0 ? void 0 : _c.stressLevel,
                lastAnxietyLevel: (_d = last === null || last === void 0 ? void 0 : last.psych) === null || _d === void 0 ? void 0 : _d.anxietyLevel,
                lastMoodStability: (_e = last === null || last === void 0 ? void 0 : last.psych) === null || _e === void 0 ? void 0 : _e.moodStability,
                consultCount: (_f = hist === null || hist === void 0 ? void 0 : hist.dialogs.length) !== null && _f !== void 0 ? _f : 0,
                pendingAlerts: pendingByStudent.get(st.id) || 0
            };
        })
            .sort((a, b) => (b.lastConsultTime || '').localeCompare(a.lastConsultTime || ''));
    });
}
function getStudentSummaryForUser(user, studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const accounts = (yield (0, accountService_1.loadAccounts)()).users;
        const st = accounts.find((a) => a.id === studentId && a.role === 'student');
        if (!st || !canAccessOrg(user, st.orgId || 'default'))
            return null;
        const hist = (0, historyManager_1.getUserHistory)(studentId);
        if (!hist) {
            return {
                id: studentId,
                maskName: (0, accountService_1.maskStudentDisplay)(st.displayName, st.studentNo),
                orgId: st.orgId || 'default',
                timeline: [],
                trend: []
            };
        }
        const recent = hist.dialogs.filter((d) => d.psych).slice(-5);
        return {
            id: studentId,
            maskName: (0, accountService_1.maskStudentDisplay)(st.displayName, st.studentNo),
            orgId: st.orgId || 'default',
            timeline: recent.map((d) => ({
                time: d.time,
                emotion: d.psych.emotion,
                risk: d.psych.risk,
                problem: (0, emotionService_1.getCategoryName)(d.psych.problem),
                summary: d.summary,
                stressLevel: d.psych.stressLevel
            })),
            trend: hist.dialogs
                .filter((d) => d.psych)
                .slice(-8)
                .map((d, i) => ({
                index: i + 1,
                stress: d.psych.stressLevel,
                anxiety: d.psych.anxietyLevel,
                mood: d.psych.moodStability
            }))
        };
    });
}
function getAlertsForUser(user, status) {
    var _a;
    const orgIds = user.role === 'admin'
        ? undefined
        : ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length)
            ? user.managedOrgIds
            : user.orgId
                ? [user.orgId]
                : undefined;
    return (0, schoolAlertService_1.listAlerts)({
        status: status,
        orgIds
    });
}
