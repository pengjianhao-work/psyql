"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runJsonMigrationIfNeeded = runJsonMigrationIfNeeded;
const fs_1 = __importDefault(require("fs"));
const database_1 = require("./database");
const paths_1 = require("../config/paths");
function runJsonMigrationIfNeeded() {
    if ((0, database_1.getMeta)('json_migrated_v1') === '1')
        return;
    const db = (0, database_1.getDb)();
    const migrate = db.transaction(() => {
        migrateAccounts(db);
        migrateHistory(db);
        migrateAlerts(db);
        (0, database_1.setMeta)('json_migrated_v1', '1');
    });
    migrate();
    console.log('SQLite: JSON 数据已迁移至', process.env.PSYQA_DB_PATH || 'server/data/psyqa.db');
}
function migrateAccounts(db) {
    const file = (0, paths_1.resolveDataFile)('accounts.json');
    if (!fs_1.default.existsSync(file))
        return;
    const data = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
    const insert = db.prepare(`
    INSERT OR IGNORE INTO accounts(id, username, password_hash, data_json, created_at)
    VALUES(?, ?, ?, ?, ?)
  `);
    for (const u of data.users || []) {
        const { passwordHash } = u, rest = __rest(u, ["passwordHash"]);
        insert.run(u.id, u.username, passwordHash, JSON.stringify(rest), u.createdAt);
    }
}
function migrateHistory(db) {
    var _a;
    const file = (0, paths_1.userHistoryJsonPath)();
    if (!fs_1.default.existsSync(file))
        return;
    const data = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
    const insertDialog = db.prepare(`
    INSERT OR IGNORE INTO dialogs(user_id, dialog_time, user_text, bot_text, summary, report, psych_json, portrait_json)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const insertSummary = db.prepare(`
    INSERT INTO dialog_summaries(user_id, summary_time, summary) VALUES(?, ?, ?)
  `);
    for (const [userId, userData] of Object.entries(data.users || {})) {
        for (const d of userData.dialogs || []) {
            insertDialog.run(userId, d.time, d.user, d.bot, d.summary, (_a = d.report) !== null && _a !== void 0 ? _a : null, d.psych ? JSON.stringify(d.psych) : null, d.portrait ? JSON.stringify(d.portrait) : null);
        }
        for (const s of userData.summaries || []) {
            insertSummary.run(userId, s.time, s.summary);
        }
    }
}
function migrateAlerts(db) {
    const file = (0, paths_1.resolveDataFile)('school_alerts.json');
    if (!fs_1.default.existsSync(file))
        return;
    const data = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
    const insert = db.prepare(`
    INSERT OR IGNORE INTO school_alerts(id, data_json, org_id, status, student_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `);
    for (const a of data.alerts || []) {
        insert.run(a.id, JSON.stringify(a), a.orgId, a.status, a.studentId, a.createdAt);
    }
}
