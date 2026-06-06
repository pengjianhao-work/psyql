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
exports.patchAdminUser = exports.postAdminUser = exports.getAdminUsers = exports.getSchoolReportExport = void 0;
const schoolReportService_1 = require("../services/schoolReportService");
const adminAccountService_1 = require("../services/adminAccountService");
const getSchoolReportExport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const format = String(req.query.format || 'json').toLowerCase();
    const report = yield (0, schoolReportService_1.buildSchoolReport)(req.authUser);
    if (format === 'csv') {
        const csv = (0, schoolReportService_1.schoolReportToCsv)(report);
        const filename = `psyqa-school-report-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\ufeff' + csv);
        return;
    }
    res.json(report);
});
exports.getSchoolReportExport = getSchoolReportExport;
const getAdminUsers = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const users = yield (0, adminAccountService_1.listUsersForAdmin)();
    res.json({ count: users.length, users });
});
exports.getAdminUsers = getAdminUsers;
const postAdminUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = req.body;
    if (!body.username || !body.password || !body.role) {
        res.status(400).json({ error: '需提供 username、password、role' });
        return;
    }
    const result = yield (0, adminAccountService_1.createUserByAdmin)({
        username: String(body.username),
        password: String(body.password),
        displayName: body.displayName ? String(body.displayName) : undefined,
        role: body.role,
        orgId: body.orgId ? String(body.orgId) : undefined,
        managedOrgIds: Array.isArray(body.managedOrgIds) ? body.managedOrgIds.map(String) : undefined
    });
    if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
    }
    res.status(201).json({ message: '用户已创建', user: result.user });
});
exports.postAdminUser = postAdminUser;
const patchAdminUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
        res.status(400).json({ error: '缺少用户 ID' });
        return;
    }
    const body = req.body;
    const result = yield (0, adminAccountService_1.updateUserByAdmin)(req.authUser.id, userId, {
        displayName: body.displayName !== undefined ? String(body.displayName) : undefined,
        role: body.role,
        orgId: body.orgId !== undefined ? String(body.orgId) : undefined,
        className: body.className !== undefined ? String(body.className) : undefined,
        studentNo: body.studentNo !== undefined ? String(body.studentNo) : undefined,
        managedOrgIds: Array.isArray(body.managedOrgIds) ? body.managedOrgIds.map(String) : undefined,
        allowSchoolTranscriptView: body.allowSchoolTranscriptView !== undefined ? Boolean(body.allowSchoolTranscriptView) : undefined,
        newPassword: body.newPassword ? String(body.newPassword) : undefined
    });
    if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
    }
    res.json({ message: '用户已更新', user: result.user });
});
exports.patchAdminUser = patchAdminUser;
