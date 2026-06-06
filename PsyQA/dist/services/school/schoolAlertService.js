"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskStudentId = maskStudentId;
exports.recordRiskAlert = recordRiskAlert;
exports.listAlerts = listAlerts;
exports.getAlertById = getAlertById;
exports.updateAlert = updateAlert;
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const paths_1 = require("../../config/paths");
const alertStore_1 = require("../../db/alertStore");
const dataPath = (0, paths_1.resolveDataFile)('school_alerts.json');
const USE_SQLITE = process.env.PSYQA_USE_JSON_STORAGE !== '1';
function readAlerts() {
    if (USE_SQLITE) {
        return { alerts: (0, alertStore_1.readAllAlertsFromDb)() };
    }
    return (0, jsonFileStore_1.readJsonFileSync)(dataPath, { alerts: [] });
}
function writeAlerts(data) {
    if (USE_SQLITE) {
        (0, alertStore_1.writeAllAlertsToDb)(data.alerts);
        return;
    }
    (0, jsonFileStore_1.writeJsonFileSync)(dataPath, data);
}
function maskStudentId(userId, displayName) {
    if (displayName && displayName.length >= 2) {
        return `${displayName[0]}**`;
    }
    if (userId.length <= 4)
        return '**';
    return `${userId.slice(0, 4)}****`;
}
function recordRiskAlert(params) {
    if (params.riskLevel !== 'high' && params.riskLevel !== 'critical') {
        return null;
    }
    const level = params.riskLevel === 'critical' ? 'critical' : 'high';
    const now = new Date().toISOString();
    const alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        studentId: params.studentId,
        studentMask: maskStudentId(params.studentId, params.displayName),
        orgId: params.orgId || 'default',
        level,
        source: 'risk',
        summary: params.summary,
        riskKeywords: params.riskKeywords,
        dialogId: params.dialogId,
        dialogTime: params.dialogTime,
        status: 'pending',
        isFalsePositive: false,
        createdAt: now,
        updatedAt: now
    };
    if (USE_SQLITE) {
        (0, alertStore_1.insertAlertInDb)(alert);
        const data = readAlerts();
        if (data.alerts.length > 500) {
            writeAlerts({ alerts: data.alerts.slice(0, 500) });
        }
        return alert;
    }
    const data = readAlerts();
    data.alerts.unshift(alert);
    if (data.alerts.length > 500) {
        data.alerts = data.alerts.slice(0, 500);
    }
    writeAlerts(data);
    return alert;
}
function listAlerts(filters) {
    let items = readAlerts().alerts;
    if (filters === null || filters === void 0 ? void 0 : filters.status) {
        items = items.filter((a) => a.status === filters.status);
    }
    if (filters === null || filters === void 0 ? void 0 : filters.level) {
        items = items.filter((a) => a.level === filters.level);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.orgIds) && filters.orgIds.length > 0) {
        items = items.filter((a) => filters.orgIds.includes(a.orgId));
    }
    if (filters === null || filters === void 0 ? void 0 : filters.from) {
        items = items.filter((a) => a.dialogTime >= filters.from);
    }
    if (filters === null || filters === void 0 ? void 0 : filters.to) {
        items = items.filter((a) => a.dialogTime <= filters.to);
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function getAlertById(alertId) {
    var _a;
    return (_a = readAlerts().alerts.find((a) => a.id === alertId)) !== null && _a !== void 0 ? _a : null;
}
function updateAlert(alertId, patch) {
    var _a;
    const data = readAlerts();
    const idx = data.alerts.findIndex((a) => a.id === alertId);
    if (idx < 0)
        return null;
    const current = data.alerts[idx];
    const now = new Date().toISOString();
    const nextStatus = (_a = patch.status) !== null && _a !== void 0 ? _a : current.status;
    const isFalsePositive = patch.isFalsePositive !== undefined
        ? patch.isFalsePositive
        : nextStatus === 'false_positive' || current.isFalsePositive;
    const updated = Object.assign(Object.assign({}, current), { status: nextStatus, isFalsePositive, assignee: patch.assignee !== undefined ? patch.assignee : current.assignee, notes: patch.notes !== undefined ? patch.notes : current.notes, updatedAt: now });
    if (USE_SQLITE) {
        (0, alertStore_1.updateAlertInDb)(updated);
    }
    else {
        data.alerts[idx] = updated;
        writeAlerts(data);
    }
    return updated;
}
