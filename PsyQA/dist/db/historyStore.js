"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserHistoryFromDb = getUserHistoryFromDb;
exports.saveDialogToDb = saveDialogToDb;
exports.clearUserHistoryInDb = clearUserHistoryInDb;
exports.updateDialogPsychInDb = updateDialogPsychInDb;
exports.updateDialogPortraitInDb = updateDialogPortraitInDb;
const database_1 = require("./database");
function parseDialog(row) {
    var _a;
    return {
        time: row.dialog_time,
        user: row.user_text,
        bot: row.bot_text,
        summary: row.summary,
        report: (_a = row.report) !== null && _a !== void 0 ? _a : undefined,
        psych: row.psych_json ? JSON.parse(row.psych_json) : undefined,
        portrait: row.portrait_json ? JSON.parse(row.portrait_json) : undefined
    };
}
function getUserHistoryFromDb(user_id) {
    const dialogs = (0, database_1.getDb)()
        .prepare(`SELECT dialog_time, user_text, bot_text, summary, report, psych_json, portrait_json
       FROM dialogs WHERE user_id = ? ORDER BY id ASC`)
        .all(user_id);
    if (!dialogs.length) {
        const summaryOnly = (0, database_1.getDb)()
            .prepare('SELECT summary_time, summary FROM dialog_summaries WHERE user_id = ?')
            .all(user_id);
        if (!summaryOnly.length)
            return null;
        return { dialogs: [], summaries: summaryOnly.map((s) => ({ time: s.summary_time, summary: s.summary })), total_times: 0 };
    }
    const summaries = (0, database_1.getDb)()
        .prepare('SELECT summary_time, summary FROM dialog_summaries WHERE user_id = ? ORDER BY id ASC')
        .all(user_id);
    return {
        dialogs: dialogs.map(parseDialog),
        summaries: summaries.map((s) => ({ time: s.summary_time, summary: s.summary })),
        total_times: dialogs.length
    };
}
function saveDialogToDb(user_id, user_query, assistant_reply, summary, psych, report, dialogTime) {
    const now = dialogTime !== null && dialogTime !== void 0 ? dialogTime : new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const db = (0, database_1.getDb)();
    db.prepare(`INSERT INTO dialogs(user_id, dialog_time, user_text, bot_text, summary, report, psych_json, portrait_json)
     VALUES(?, ?, ?, ?, ?, ?, ?, NULL)`).run(user_id, now, user_query, assistant_reply, summary, report !== null && report !== void 0 ? report : null, psych ? JSON.stringify(psych) : null);
    db.prepare('INSERT INTO dialog_summaries(user_id, summary_time, summary) VALUES(?, ?, ?)').run(user_id, now, summary);
    return now;
}
function clearUserHistoryInDb(user_id) {
    const db = (0, database_1.getDb)();
    db.prepare('DELETE FROM dialogs WHERE user_id = ?').run(user_id);
    db.prepare('DELETE FROM dialog_summaries WHERE user_id = ?').run(user_id);
}
function updateDialogPsychInDb(user_id, dialogTime, psych) {
    const db = (0, database_1.getDb)();
    let row;
    if (dialogTime) {
        row = db
            .prepare('SELECT dialog_time, psych_json FROM dialogs WHERE user_id = ? AND dialog_time = ?')
            .get(user_id, dialogTime);
    }
    else {
        row = db
            .prepare('SELECT dialog_time, psych_json FROM dialogs WHERE user_id = ? ORDER BY id DESC LIMIT 1')
            .get(user_id);
    }
    if (!(row === null || row === void 0 ? void 0 : row.psych_json))
        return false;
    db.prepare('UPDATE dialogs SET psych_json = ? WHERE user_id = ? AND dialog_time = ?').run(JSON.stringify(psych), user_id, row.dialog_time);
    return true;
}
function updateDialogPortraitInDb(user_id, dialogTime, portrait) {
    const result = (0, database_1.getDb)()
        .prepare('UPDATE dialogs SET portrait_json = ? WHERE user_id = ? AND dialog_time = ?')
        .run(JSON.stringify(portrait), user_id, dialogTime);
    if (result.changes > 0)
        return true;
    const last = (0, database_1.getDb)()
        .prepare('SELECT dialog_time FROM dialogs WHERE user_id = ? ORDER BY id DESC LIMIT 1')
        .get(user_id);
    if (!last)
        return false;
    (0, database_1.getDb)()
        .prepare('UPDATE dialogs SET portrait_json = ? WHERE user_id = ? AND dialog_time = ?')
        .run(JSON.stringify(portrait), user_id, last.dialog_time);
    return true;
}
