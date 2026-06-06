"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAllAlertsFromDb = readAllAlertsFromDb;
exports.writeAllAlertsToDb = writeAllAlertsToDb;
exports.insertAlertInDb = insertAlertInDb;
exports.updateAlertInDb = updateAlertInDb;
const database_1 = require("./database");
function readAllAlertsFromDb() {
    const rows = (0, database_1.getDb)()
        .prepare('SELECT data_json FROM school_alerts ORDER BY created_at DESC')
        .all();
    return rows.map((r) => JSON.parse(r.data_json));
}
function writeAllAlertsToDb(alerts) {
    const db = (0, database_1.getDb)();
    const tx = db.transaction((list) => {
        db.prepare('DELETE FROM school_alerts').run();
        const insert = db.prepare('INSERT INTO school_alerts(id, data_json, org_id, status, student_id, created_at) VALUES(?, ?, ?, ?, ?, ?)');
        for (const a of list) {
            insert.run(a.id, JSON.stringify(a), a.orgId, a.status, a.studentId, a.createdAt);
        }
    });
    tx(alerts);
}
function insertAlertInDb(alert) {
    (0, database_1.getDb)()
        .prepare('INSERT INTO school_alerts(id, data_json, org_id, status, student_id, created_at) VALUES(?, ?, ?, ?, ?, ?)')
        .run(alert.id, JSON.stringify(alert), alert.orgId, alert.status, alert.studentId, alert.createdAt);
}
function updateAlertInDb(alert) {
    (0, database_1.getDb)()
        .prepare(`UPDATE school_alerts SET data_json = ?, org_id = ?, status = ?, student_id = ?
       WHERE id = ?`)
        .run(JSON.stringify(alert), alert.orgId, alert.status, alert.studentId, alert.id);
}
