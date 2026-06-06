"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureInterventionLedger = ensureInterventionLedger;
exports.listInterventionLedgers = listInterventionLedgers;
exports.updateInterventionLedger = updateInterventionLedger;
exports.getOverdueFollowUps = getOverdueFollowUps;
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const paths_1 = require("../../config/paths");
const dataPath = (0, paths_1.resolveDataFile)('intervention_ledgers.json');
function readAll() {
    return (0, jsonFileStore_1.readJsonFileSync)(dataPath, { records: [] });
}
function writeAll(data) {
    (0, jsonFileStore_1.writeJsonFileSync)(dataPath, data);
}
function ensureInterventionLedger(input) {
    const data = readAll();
    const existing = data.records.find((r) => r.alertId === input.alertId);
    if (existing)
        return existing;
    const now = new Date().toISOString();
    const record = {
        id: `il_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        alertId: input.alertId,
        studentId: input.studentId,
        studentMask: input.studentMask,
        orgId: input.orgId,
        tier: input.tier,
        slaDueAt: input.slaDueAt,
        status: 'open',
        meetingNotes: [],
        measures: [],
        createdAt: now,
        updatedAt: now
    };
    data.records.unshift(record);
    if (data.records.length > 300)
        data.records = data.records.slice(0, 300);
    writeAll(data);
    return record;
}
function listInterventionLedgers(orgIds) {
    let items = readAll().records;
    if (orgIds === null || orgIds === void 0 ? void 0 : orgIds.length)
        items = items.filter((r) => orgIds.includes(r.orgId));
    return items.sort((a, b) => a.slaDueAt.localeCompare(b.slaDueAt));
}
function updateInterventionLedger(id, patch) {
    const data = readAll();
    const idx = data.records.findIndex((r) => r.id === id);
    if (idx < 0)
        return null;
    const row = data.records[idx];
    if (patch.meetingNotes)
        row.meetingNotes = patch.meetingNotes;
    if (patch.measures)
        row.measures = patch.measures;
    if (patch.status)
        row.status = patch.status;
    if (patch.nextFollowUpAt !== undefined)
        row.nextFollowUpAt = patch.nextFollowUpAt;
    if (patch.closedAt !== undefined)
        row.closedAt = patch.closedAt;
    row.updatedAt = new Date().toISOString();
    data.records[idx] = row;
    writeAll(data);
    return row;
}
function getOverdueFollowUps(orgIds) {
    const now = Date.now();
    return listInterventionLedgers(orgIds).filter((r) => {
        if (r.status === 'closed')
            return false;
        if (r.slaDueAt && new Date(r.slaDueAt).getTime() < now)
            return true;
        if (r.nextFollowUpAt && new Date(r.nextFollowUpAt).getTime() < now)
            return true;
        return false;
    });
}
