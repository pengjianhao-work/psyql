"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyTier1Alert = notifyTier1Alert;
exports.listNotificationsForUser = listNotificationsForUser;
exports.markNotificationsRead = markNotificationsRead;
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const paths_1 = require("../../config/paths");
const dataPath = (0, paths_1.resolveDataFile)('school_notifications.json');
const MAX_ITEMS = 200;
function readAll() {
    return (0, jsonFileStore_1.readJsonFileSync)(dataPath, { items: [] });
}
function writeAll(data) {
    (0, jsonFileStore_1.writeJsonFileSync)(dataPath, data);
}
function notifyTier1Alert(alert) {
    var _a;
    if (((_a = alert.tier) !== null && _a !== void 0 ? _a : 2) !== 1)
        return;
    const data = readAll();
    if (data.items.some((n) => n.alertId === alert.id))
        return;
    const item = {
        id: `sn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'tier1_alert',
        alertId: alert.id,
        studentMask: alert.studentMask,
        summary: alert.summary,
        orgId: alert.orgId,
        tier: 1,
        createdAt: new Date().toISOString(),
        readBy: []
    };
    data.items.unshift(item);
    if (data.items.length > MAX_ITEMS) {
        data.items = data.items.slice(0, MAX_ITEMS);
    }
    writeAll(data);
}
function listNotificationsForUser(userId, orgIds) {
    const items = readAll().items;
    return items.filter((n) => {
        if (orgIds && orgIds.length > 0 && !orgIds.includes(n.orgId))
            return false;
        return !n.readBy.includes(userId);
    });
}
function markNotificationsRead(userId, ids) {
    if (!ids.length)
        return;
    const data = readAll();
    let changed = false;
    for (const item of data.items) {
        if (ids.includes(item.id) && !item.readBy.includes(userId)) {
            item.readBy.push(userId);
            changed = true;
        }
    }
    if (changed)
        writeAll(data);
}
