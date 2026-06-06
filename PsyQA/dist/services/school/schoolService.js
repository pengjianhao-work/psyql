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
exports.canViewFullTranscripts = canViewFullTranscripts;
exports.getDashboardForUser = getDashboardForUser;
exports.listStudentsForUser = listStudentsForUser;
exports.getStudentSummaryForUser = getStudentSummaryForUser;
exports.getStudentDetailForUser = getStudentDetailForUser;
exports.getAlertsForUser = getAlertsForUser;
const historyManager_1 = require("../common/historyManager");
const accountService_1 = require("../user/accountService");
const schoolAlertService_1 = require("./schoolAlertService");
const transcriptRequestService_1 = require("./transcriptRequestService");
const emotionService_1 = require("../psych/emotionService");
function canAccessOrg(user, orgId) {
    var _a;
    if (user.role === 'admin')
        return true;
    if (!((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length))
        return orgId === user.orgId || orgId === 'default';
    return user.managedOrgIds.includes(orgId);
}
function canAccessStudent(user, student) {
    if (!canAccessOrg(user, student.orgId || 'default'))
        return false;
    if (user.role === 'admin')
        return true;
    const classes = user.managedClassIds;
    if (!(classes === null || classes === void 0 ? void 0 : classes.length))
        return true;
    if (!student.className)
        return false;
    return classes.some((c) => { var _a; return student.className === c || ((_a = student.className) === null || _a === void 0 ? void 0 : _a.includes(c)); });
}
/** 辅导员需学生授权且在本院系；管理员始终可看原文；已审批申请可临时开放 */
function canViewFullTranscripts(viewer, student) {
    if (viewer.role === 'admin')
        return true;
    if (viewer.role !== 'counselor')
        return false;
    if (!canAccessStudent(viewer, student))
        return false;
    if ((0, transcriptRequestService_1.hasApprovedTranscriptAccess)(student.id, viewer.id))
        return true;
    return student.allowSchoolTranscriptView !== false;
}
function getDashboardForUser(user) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const accounts = (yield (0, accountService_1.loadAccounts)()).users.filter((a) => a.role === 'student');
        const visibleStudents = accounts.filter((a) => canAccessStudent(user, a));
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
            .filter((a) => canAccessStudent(user, a))
            .map((st) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            const hist = (0, historyManager_1.getUserHistory)(st.id);
            const last = hist === null || hist === void 0 ? void 0 : hist.dialogs.filter((d) => d.psych).slice(-1)[0];
            const pub = (0, accountService_1.enrichPublicAccount)(st);
            const canTranscript = canViewFullTranscripts(user, st);
            return {
                id: st.id,
                maskName: (0, accountService_1.maskStudentDisplay)(st.displayName, st.studentNo),
                displayName: st.displayName,
                username: st.username,
                studentNo: st.studentNo,
                avatar: st.avatar,
                orgId: st.orgId || 'default',
                orgName: pub.orgName,
                schoolName: pub.schoolName,
                className: st.className,
                lastConsultTime: last === null || last === void 0 ? void 0 : last.time,
                lastEmotion: (_a = last === null || last === void 0 ? void 0 : last.psych) === null || _a === void 0 ? void 0 : _a.emotion,
                lastEmotionLabel: ((_b = last === null || last === void 0 ? void 0 : last.psych) === null || _b === void 0 ? void 0 : _b.emotion) ? (0, emotionService_1.getEmotionLabel)(last.psych.emotion) : undefined,
                lastRisk: (_c = last === null || last === void 0 ? void 0 : last.psych) === null || _c === void 0 ? void 0 : _c.risk,
                lastRiskLabel: ((_d = last === null || last === void 0 ? void 0 : last.psych) === null || _d === void 0 ? void 0 : _d.risk) ? (0, emotionService_1.getRiskLabel)(last.psych.risk) : undefined,
                lastProblem: (_e = last === null || last === void 0 ? void 0 : last.psych) === null || _e === void 0 ? void 0 : _e.problem,
                lastProblemLabel: ((_f = last === null || last === void 0 ? void 0 : last.psych) === null || _f === void 0 ? void 0 : _f.problem)
                    ? (0, emotionService_1.getCategoryName)(last.psych.problem)
                    : undefined,
                lastStressLevel: (_g = last === null || last === void 0 ? void 0 : last.psych) === null || _g === void 0 ? void 0 : _g.stressLevel,
                lastAnxietyLevel: (_h = last === null || last === void 0 ? void 0 : last.psych) === null || _h === void 0 ? void 0 : _h.anxietyLevel,
                lastMoodStability: (_j = last === null || last === void 0 ? void 0 : last.psych) === null || _j === void 0 ? void 0 : _j.moodStability,
                consultCount: (_k = hist === null || hist === void 0 ? void 0 : hist.dialogs.length) !== null && _k !== void 0 ? _k : 0,
                pendingAlerts: pendingByStudent.get(st.id) || 0,
                allowSchoolTranscriptView: st.allowSchoolTranscriptView !== false,
                transcriptMasked: !canTranscript
            };
        })
            .sort((a, b) => (b.lastConsultTime || '').localeCompare(a.lastConsultTime || ''));
    });
}
function getStudentSummaryForUser(user, studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const accounts = (yield (0, accountService_1.loadAccounts)()).users;
        const st = accounts.find((a) => a.id === studentId && a.role === 'student');
        if (!st || !canAccessStudent(user, st))
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
function getStudentDetailForUser(user, studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const accounts = (yield (0, accountService_1.loadAccounts)()).users;
        const st = accounts.find((a) => a.id === studentId && a.role === 'student');
        if (!st || !canAccessStudent(user, st))
            return null;
        const pub = (0, accountService_1.enrichPublicAccount)(st);
        const canTranscript = canViewFullTranscripts(user, st);
        const hist = (0, historyManager_1.getUserHistory)(studentId);
        const orgFilter = user.role === 'admin'
            ? undefined
            : ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length)
                ? user.managedOrgIds
                : user.orgId
                    ? [user.orgId]
                    : undefined;
        const alerts = (0, schoolAlertService_1.listAlerts)({ orgIds: orgFilter }).filter((a) => a.studentId === studentId);
        const pendingCount = alerts.filter((a) => a.status === 'pending').length;
        const profile = {
            id: st.id,
            maskName: (0, accountService_1.maskStudentDisplay)(st.displayName, st.studentNo),
            displayName: st.displayName,
            username: st.username,
            studentNo: st.studentNo,
            avatar: st.avatar,
            orgId: st.orgId || 'default',
            orgName: pub.orgName,
            schoolName: pub.schoolName,
            className: st.className,
            consultCount: (_b = hist === null || hist === void 0 ? void 0 : hist.dialogs.length) !== null && _b !== void 0 ? _b : 0,
            pendingAlerts: pendingCount,
            allowSchoolTranscriptView: st.allowSchoolTranscriptView !== false,
            transcriptMasked: !canTranscript
        };
        const dialogs = ((_c = hist === null || hist === void 0 ? void 0 : hist.dialogs) !== null && _c !== void 0 ? _c : []).map((d) => ({
            time: d.time,
            user: canTranscript ? d.user : '（学生未授权或已关闭对话原文，仅展示摘要与指标）',
            bot: canTranscript ? d.bot : '—',
            summary: d.summary,
            report: canTranscript ? d.report : undefined,
            psych: d.psych
                ? {
                    emotion: d.psych.emotion,
                    emotionLabel: (0, emotionService_1.getEmotionLabel)(d.psych.emotion),
                    risk: d.psych.risk,
                    riskLabel: (0, emotionService_1.getRiskLabel)(d.psych.risk),
                    problem: d.psych.problem,
                    problemLabel: (0, emotionService_1.getCategoryName)(d.psych.problem),
                    confidence: d.psych.confidence,
                    stressLevel: d.psych.stressLevel,
                    anxietyLevel: d.psych.anxietyLevel,
                    moodStability: d.psych.moodStability
                }
                : undefined,
            portrait: canTranscript ? d.portrait : d.portrait ? { summary: d.portrait.summary } : undefined
        }));
        return { profile, dialogs, alerts };
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
