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
const schoolNotificationService_1 = require("./schoolNotificationService");
const interventionLedgerService_1 = require("./interventionLedgerService");
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
function resolveAlertTier(riskLevel, keywords) {
    const kw = keywords.join(' ');
    const crisis = /自杀|自伤|自残|不想活|跳楼|割腕|杀人|伤害他人/.test(kw);
    if (riskLevel === 'critical' || crisis) {
        return { tier: 1, level: 'critical', slaHours: 2 };
    }
    if (riskLevel === 'high' || /抑郁|绝望|崩溃|焦虑严重/.test(kw)) {
        return { tier: 2, level: 'high', slaHours: 24 };
    }
    return { tier: 3, level: 'medium', slaHours: 72 };
}
function recordRiskAlert(params) {
    const tierInfo = resolveAlertTier(params.riskLevel, params.riskKeywords);
    if (params.riskLevel === 'low' && tierInfo.tier === 3) {
        return null;
    }
    if (params.riskLevel !== 'high' && params.riskLevel !== 'critical' && tierInfo.tier === 3) {
        return null;
    }
    const level = tierInfo.level;
    const now = new Date().toISOString();
    const slaDueAt = new Date(Date.now() + tierInfo.slaHours * 3600000).toISOString();
    const alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        studentId: params.studentId,
        studentMask: maskStudentId(params.studentId, params.displayName),
        orgId: params.orgId || 'default',
        level,
        tier: tierInfo.tier,
        slaHours: tierInfo.slaHours,
        slaDueAt,
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
        if (alert.tier === 1)
            (0, schoolNotificationService_1.notifyTier1Alert)(alert);
        if (alert.tier <= 2) {
            (0, interventionLedgerService_1.ensureInterventionLedger)({
                alertId: alert.id,
                studentId: alert.studentId,
                studentMask: alert.studentMask,
                orgId: alert.orgId,
                tier: alert.tier,
                slaDueAt: alert.slaDueAt
            });
        }
        return alert;
    }
    const data = readAlerts();
    data.alerts.unshift(alert);
    if (data.alerts.length > 500) {
        data.alerts = data.alerts.slice(0, 500);
    }
    writeAlerts(data);
    if (alert.tier === 1)
        (0, schoolNotificationService_1.notifyTier1Alert)(alert);
    if (alert.tier <= 2) {
        (0, interventionLedgerService_1.ensureInterventionLedger)({
            alertId: alert.id,
            studentId: alert.studentId,
            studentMask: alert.studentMask,
            orgId: alert.orgId,
            tier: alert.tier,
            slaDueAt: alert.slaDueAt
        });
    }
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
    if (filters === null || filters === void 0 ? void 0 : filters.tier) {
        const t = Number(filters.tier);
        items = items.filter((a) => { var _a; return ((_a = a.tier) !== null && _a !== void 0 ? _a : 2) === t; });
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
    return items
        .map((a) => {
        var _a, _b, _c;
        return (Object.assign(Object.assign({}, a), { tier: (_a = a.tier) !== null && _a !== void 0 ? _a : (a.level === 'critical' ? 1 : a.level === 'high' ? 2 : 3), slaHours: (_b = a.slaHours) !== null && _b !== void 0 ? _b : (a.level === 'critical' ? 2 : 24), slaDueAt: (_c = a.slaDueAt) !== null && _c !== void 0 ? _c : a.createdAt }));
    })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
