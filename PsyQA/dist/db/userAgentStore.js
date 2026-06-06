"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserAgentProfile = getUserAgentProfile;
exports.ensureUserAgentProfile = ensureUserAgentProfile;
exports.updateUserAgentProfile = updateUserAgentProfile;
exports.recordDialogVectorMeta = recordDialogVectorMeta;
exports.getFirstDialogTime = getFirstDialogTime;
exports.listUserIdsWithDialogs = listUserIdsWithDialogs;
exports.getDialogsForMonth = getDialogsForMonth;
exports.getDialogsForYear = getDialogsForYear;
exports.clearUserAgentData = clearUserAgentData;
const database_1 = require("./database");
function parseJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch (_a) {
        return fallback;
    }
}
function getUserAgentProfile(userId) {
    const row = (0, database_1.getDb)()
        .prepare(`SELECT user_id, basic_json, emotion_timeline_json, intervention_json,
              agent_system_prompt, agent_phase, first_dialog_at,
              monthly_summaries_json, annual_reports_json, updated_at
       FROM user_agent_profile WHERE user_id = ?`)
        .get(userId);
    if (!row)
        return null;
    return {
        userId: row.user_id,
        basicJson: parseJson(row.basic_json, null),
        emotionTimelineJson: parseJson(row.emotion_timeline_json, []),
        interventionJson: parseJson(row.intervention_json, null),
        agentSystemPrompt: row.agent_system_prompt,
        agentPhase: row.agent_phase || 'collect',
        firstDialogAt: row.first_dialog_at,
        monthlySummariesJson: parseJson(row.monthly_summaries_json, []),
        annualReportsJson: parseJson(row.annual_reports_json, []),
        updatedAt: row.updated_at
    };
}
function ensureUserAgentProfile(userId) {
    const existing = getUserAgentProfile(userId);
    if (existing)
        return existing;
    const now = new Date().toISOString();
    (0, database_1.getDb)()
        .prepare(`INSERT INTO user_agent_profile(user_id, emotion_timeline_json, monthly_summaries_json,
       annual_reports_json, agent_phase, updated_at)
       VALUES(?, '[]', '[]', '[]', 'collect', ?)`)
        .run(userId, now);
    return getUserAgentProfile(userId);
}
function updateUserAgentProfile(userId, patch) {
    var _a, _b, _c, _d;
    ensureUserAgentProfile(userId);
    const current = getUserAgentProfile(userId);
    const now = new Date().toISOString();
    (0, database_1.getDb)()
        .prepare(`UPDATE user_agent_profile SET
         basic_json = ?,
         emotion_timeline_json = ?,
         intervention_json = ?,
         agent_system_prompt = ?,
         agent_phase = ?,
         first_dialog_at = ?,
         monthly_summaries_json = ?,
         annual_reports_json = ?,
         updated_at = ?
       WHERE user_id = ?`)
        .run(patch.basicJson !== undefined
        ? JSON.stringify(patch.basicJson)
        : current.basicJson
            ? JSON.stringify(current.basicJson)
            : null, JSON.stringify((_a = patch.emotionTimelineJson) !== null && _a !== void 0 ? _a : current.emotionTimelineJson), patch.interventionJson !== undefined
        ? patch.interventionJson
            ? JSON.stringify(patch.interventionJson)
            : null
        : current.interventionJson
            ? JSON.stringify(current.interventionJson)
            : null, patch.agentSystemPrompt !== undefined ? patch.agentSystemPrompt : current.agentSystemPrompt, (_b = patch.agentPhase) !== null && _b !== void 0 ? _b : current.agentPhase, patch.firstDialogAt !== undefined ? patch.firstDialogAt : current.firstDialogAt, JSON.stringify((_c = patch.monthlySummariesJson) !== null && _c !== void 0 ? _c : current.monthlySummariesJson), JSON.stringify((_d = patch.annualReportsJson) !== null && _d !== void 0 ? _d : current.annualReportsJson), now, userId);
    return getUserAgentProfile(userId);
}
function recordDialogVectorMeta(input) {
    var _a, _b, _c, _d;
    const now = new Date().toISOString();
    (0, database_1.getDb)()
        .prepare(`INSERT INTO user_dialog_vectors(
         user_id, dialog_time, chroma_id, collection_name, month,
         emotion, trigger_tag, content_preview, created_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, dialog_time) DO UPDATE SET
         chroma_id = excluded.chroma_id,
         collection_name = excluded.collection_name,
         month = excluded.month,
         emotion = excluded.emotion,
         trigger_tag = excluded.trigger_tag,
         content_preview = excluded.content_preview,
         created_at = excluded.created_at`)
        .run(input.userId, input.dialogTime, input.chromaId, input.collectionName, input.month, (_a = input.emotion) !== null && _a !== void 0 ? _a : null, (_b = input.triggerTag) !== null && _b !== void 0 ? _b : null, (_d = (_c = input.contentPreview) === null || _c === void 0 ? void 0 : _c.slice(0, 200)) !== null && _d !== void 0 ? _d : null, now);
}
function getFirstDialogTime(userId) {
    var _a;
    const row = (0, database_1.getDb)()
        .prepare('SELECT MIN(dialog_time) as t FROM dialogs WHERE user_id = ?')
        .get(userId);
    return (_a = row === null || row === void 0 ? void 0 : row.t) !== null && _a !== void 0 ? _a : null;
}
function listUserIdsWithDialogs() {
    const rows = (0, database_1.getDb)()
        .prepare('SELECT DISTINCT user_id FROM dialogs WHERE user_id IS NOT NULL AND user_id != ?')
        .all('default_user');
    return rows.map((r) => r.user_id);
}
function monthLikePattern(ym) {
    return `${ym.replace('-', '/').slice(0, 7)}/%`;
}
function getDialogsForMonth(userId, month) {
    return (0, database_1.getDb)()
        .prepare(`SELECT user_text as userText, bot_text as botText, summary, psych_json as psychJson
       FROM dialogs WHERE user_id = ? AND dialog_time LIKE ? ORDER BY id ASC`)
        .all(userId, monthLikePattern(month));
}
function getDialogsForYear(userId, year) {
    return (0, database_1.getDb)()
        .prepare(`SELECT user_text as userText, bot_text as botText, summary, psych_json as psychJson
       FROM dialogs WHERE user_id = ? AND dialog_time LIKE ? ORDER BY id ASC`)
        .all(userId, `${year}/%`);
}
function clearUserAgentData(userId) {
    (0, database_1.getDb)().prepare('DELETE FROM user_agent_profile WHERE user_id = ?').run(userId);
    (0, database_1.getDb)().prepare('DELETE FROM user_dialog_vectors WHERE user_id = ?').run(userId);
}
