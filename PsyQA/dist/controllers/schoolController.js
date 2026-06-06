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
exports.getSchoolAlerts = exports.getSchoolStudents = exports.getSchoolDashboard = void 0;
const schoolService_1 = require("../services/schoolService");
const schoolAlertService_1 = require("../services/schoolAlertService");
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
const getSchoolAlerts = (req, res) => {
    var _a;
    const status = req.query.status ? String(req.query.status) : undefined;
    const level = req.query.level ? String(req.query.level) : undefined;
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
    const alerts = (0, schoolAlertService_1.listAlerts)({ status: status, level, orgIds, from, to });
    res.json({ count: alerts.length, alerts });
};
exports.getSchoolAlerts = getSchoolAlerts;
