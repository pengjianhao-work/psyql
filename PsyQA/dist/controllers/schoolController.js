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
exports.postMarkSchoolNotificationsRead = exports.getSchoolNotifications = exports.patchSchoolAlert = exports.getSchoolAlerts = exports.getSchoolStudentDetail = exports.getSchoolStudents = exports.getSchoolDashboard = void 0;
const schoolService_1 = require("../services/school/schoolService");
const schoolAlertService_1 = require("../services/school/schoolAlertService");
const schoolNotificationService_1 = require("../services/school/schoolNotificationService");
const getSchoolDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const stats = yield (0, schoolService_1.getDashboardForUser)(req.authUser);
    res.json(stats);
});
exports.getSchoolDashboard = getSchoolDashboard;
const getSchoolStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const students = yield (0, schoolService_1.listStudentsForUser)(req.authUser);
    res.json({ students });
});
exports.getSchoolStudents = getSchoolStudents;
const getSchoolStudentDetail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const studentId = String(req.params.studentId || '').trim();
    if (!studentId) {
        res.status(400).json({ error: '缺少学生 ID' });
        return;
    }
    const detail = yield (0, schoolService_1.getStudentDetailForUser)(req.authUser, studentId);
    if (!detail) {
        res.status(404).json({ error: '未找到该学生或无权访问' });
        return;
    }
    res.json(detail);
});
exports.getSchoolStudentDetail = getSchoolStudentDetail;
const getSchoolAlerts = (req, res) => {
    var _a;
    const status = req.query.status ? String(req.query.status) : undefined;
    const level = req.query.level ? String(req.query.level) : undefined;
    const tier = req.query.tier ? String(req.query.tier) : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const user = req.authUser;
    const orgIds = user.role === 'admin'
        ? undefined
        : ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length)
            ? user.managedOrgIds
            : user.orgId
                ? [user.orgId]
                : undefined;
    const alerts = (0, schoolAlertService_1.listAlerts)({ status: status, level, tier, orgIds, from, to });
    res.json({ count: alerts.length, alerts });
};
exports.getSchoolAlerts = getSchoolAlerts;
function userCanAccessAlertOrg(user, orgId) {
    var _a;
    if (user.role === 'admin')
        return true;
    const allowed = ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length) ? user.managedOrgIds : user.orgId ? [user.orgId] : [];
    return allowed.includes(orgId);
}
const patchSchoolAlert = (req, res) => {
    const alertId = String(req.params.alertId || '').trim();
    if (!alertId) {
        res.status(400).json({ error: '缺少预警 ID' });
        return;
    }
    const alert = (0, schoolAlertService_1.getAlertById)(alertId);
    if (!alert) {
        res.status(404).json({ error: '未找到该预警' });
        return;
    }
    const user = req.authUser;
    if (!userCanAccessAlertOrg(user, alert.orgId)) {
        res.status(403).json({ error: '无权处理该预警' });
        return;
    }
    const body = req.body;
    const updated = (0, schoolAlertService_1.updateAlert)(alertId, {
        status: body.status,
        assignee: body.assignee !== undefined ? String(body.assignee) : undefined,
        notes: body.notes !== undefined ? String(body.notes) : undefined,
        isFalsePositive: body.isFalsePositive
    });
    if (!updated) {
        res.status(404).json({ error: '未找到该预警' });
        return;
    }
    res.json({ message: '预警已更新', alert: updated });
};
exports.patchSchoolAlert = patchSchoolAlert;
const getSchoolNotifications = (req, res) => {
    var _a;
    const user = req.authUser;
    const orgIds = user.role === 'admin'
        ? undefined
        : ((_a = user.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length)
            ? user.managedOrgIds
            : user.orgId
                ? [user.orgId]
                : undefined;
    res.json({ notifications: (0, schoolNotificationService_1.listNotificationsForUser)(user.id, orgIds) });
};
exports.getSchoolNotifications = getSchoolNotifications;
const postMarkSchoolNotificationsRead = (req, res) => {
    var _a;
    const ids = Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.ids) ? req.body.ids : [];
    (0, schoolNotificationService_1.markNotificationsRead)(req.authUser.id, ids);
    res.json({ message: '已标记为已读' });
};
exports.postMarkSchoolNotificationsRead = postMarkSchoolNotificationsRead;
