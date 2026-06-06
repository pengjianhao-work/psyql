"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dialogExists = dialogExists;
exports.saveSessionFeedback = saveSessionFeedback;
exports.getSessionFeedback = getSessionFeedback;
exports.listSessionFeedback = listSessionFeedback;
exports.clearUserFeedback = clearUserFeedback;
exports.clearUserProfileRow = clearUserProfileRow;
const database_1 = require("./database");
function dialogExists(userId, dialogTime) {
    const row = (0, database_1.getDb)()
        .prepare('SELECT 1 FROM dialogs WHERE user_id = ? AND dialog_time = ?')
        .get(userId, dialogTime);
    return Boolean(row);
}
function saveSessionFeedback(userId, dialogTime, input) {
    var _a;
    const now = new Date().toISOString();
    const rating = input.rating !== undefined && input.rating !== null
        ? Math.min(5, Math.max(1, Math.round(Number(input.rating))))
        : null;
    const helpful = input.helpful === undefined || input.helpful === null ? null : input.helpful ? 1 : 0;
    const comment = ((_a = input.comment) === null || _a === void 0 ? void 0 : _a.trim()) ? input.comment.trim().slice(0, 500) : null;
    (0, database_1.getDb)()
        .prepare(`INSERT INTO session_feedback(user_id, dialog_time, rating, helpful, comment, created_at)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, dialog_time) DO UPDATE SET
         rating = COALESCE(excluded.rating, session_feedback.rating),
         helpful = COALESCE(excluded.helpful, session_feedback.helpful),
         comment = COALESCE(excluded.comment, session_feedback.comment),
         created_at = excluded.created_at`)
        .run(userId, dialogTime, rating, helpful, comment, now);
    return getSessionFeedback(userId, dialogTime);
}
function getSessionFeedback(userId, dialogTime) {
    const row = (0, database_1.getDb)()
        .prepare(`SELECT user_id, dialog_time, rating, helpful, comment, created_at
       FROM session_feedback WHERE user_id = ? AND dialog_time = ?`)
        .get(userId, dialogTime);
    if (!row)
        return null;
    return {
        userId: row.user_id,
        dialogTime: row.dialog_time,
        rating: row.rating,
        helpful: row.helpful === null ? null : row.helpful === 1,
        comment: row.comment,
        createdAt: row.created_at
    };
}
function listSessionFeedback(userId) {
    const rows = (0, database_1.getDb)()
        .prepare(`SELECT user_id, dialog_time, rating, helpful, comment, created_at
       FROM session_feedback WHERE user_id = ? ORDER BY created_at DESC`)
        .all(userId);
    return rows.map((row) => ({
        userId: row.user_id,
        dialogTime: row.dialog_time,
        rating: row.rating,
        helpful: row.helpful === null ? null : row.helpful === 1,
        comment: row.comment,
        createdAt: row.created_at
    }));
}
function clearUserFeedback(userId) {
    (0, database_1.getDb)().prepare('DELETE FROM session_feedback WHERE user_id = ?').run(userId);
}
function clearUserProfileRow(userId) {
    (0, database_1.getDb)().prepare('DELETE FROM user_profile WHERE user_id = ?').run(userId);
}
