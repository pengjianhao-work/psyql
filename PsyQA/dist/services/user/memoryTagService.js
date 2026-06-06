"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoTagMemoryContent = autoTagMemoryContent;
exports.upsertMemoryMeta = upsertMemoryMeta;
exports.listMemoryMeta = listMemoryMeta;
exports.batchArchiveMemories = batchArchiveMemories;
exports.getLockedMemoryBoost = getLockedMemoryBoost;
exports.isMemoryArchived = isMemoryArchived;
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const paths_1 = require("../../config/paths");
const dataPath = (0, paths_1.resolveDataFile)('memory_meta.json');
const TAG_KEYWORDS = {
    academic: ['考试', '学业', '成绩', '挂科', '论文', '考研', '作业', '复习'],
    relationship: ['同学', '朋友', '人际', '室友', '孤立', '被排挤', '社交'],
    family: ['父母', '家里', '家庭', '爸妈', '父亲', '母亲', '亲子'],
    romance: ['恋爱', '分手', '男朋友', '女朋友', '暗恋', '表白', '复合'],
    crisis: ['自杀', '自伤', '不想活', '跳楼', '割腕', '伤害自己'],
    emotion: ['焦虑', '抑郁', '失眠', '崩溃', '压力', '低落', '情绪'],
    other: []
};
function readAll() {
    return (0, jsonFileStore_1.readJsonFileSync)(dataPath, { byUser: {} });
}
function writeAll(data) {
    (0, jsonFileStore_1.writeJsonFileSync)(dataPath, data);
}
function autoTagMemoryContent(text, problem) {
    const normalized = text.replace(/\s+/g, '');
    const tags = new Set();
    for (const [tag, kws] of Object.entries(TAG_KEYWORDS)) {
        if (tag === 'other')
            continue;
        if (kws.some((kw) => normalized.includes(kw)))
            tags.add(tag);
    }
    if (problem === 'academic_stress')
        tags.add('academic');
    if (problem === 'interpersonal')
        tags.add('relationship');
    if (problem === 'family_relationship')
        tags.add('family');
    if (problem === 'romantic_relationship')
        tags.add('romance');
    if (problem === 'emotion_regulation')
        tags.add('emotion');
    if (!tags.size)
        tags.add('other');
    return [...tags];
}
function upsertMemoryMeta(userId, dialogTime, patch) {
    var _a, _b, _c, _d;
    const data = readAll();
    if (!data.byUser[userId])
        data.byUser[userId] = {};
    const existing = data.byUser[userId][dialogTime];
    const tags = patch.tags ||
        (existing === null || existing === void 0 ? void 0 : existing.tags) ||
        autoTagMemoryContent(patch.content || '', patch.problem);
    const entry = {
        dialogTime,
        tags,
        locked: (_b = (_a = patch.locked) !== null && _a !== void 0 ? _a : existing === null || existing === void 0 ? void 0 : existing.locked) !== null && _b !== void 0 ? _b : false,
        archived: (_d = (_c = patch.archived) !== null && _c !== void 0 ? _c : existing === null || existing === void 0 ? void 0 : existing.archived) !== null && _d !== void 0 ? _d : false,
        autoTagged: !patch.tags && !existing,
        updatedAt: new Date().toISOString()
    };
    data.byUser[userId][dialogTime] = entry;
    writeAll(data);
    return entry;
}
function listMemoryMeta(userId, filterTag) {
    const data = readAll();
    const userMap = data.byUser[userId] || {};
    let items = Object.values(userMap);
    if (filterTag)
        items = items.filter((m) => m.tags.includes(filterTag));
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function batchArchiveMemories(userId, dialogTimes, archived = true) {
    const data = readAll();
    if (!data.byUser[userId])
        return 0;
    let n = 0;
    for (const dt of dialogTimes) {
        const row = data.byUser[userId][dt];
        if (row) {
            row.archived = archived;
            row.updatedAt = new Date().toISOString();
            n += 1;
        }
    }
    writeAll(data);
    return n;
}
function getLockedMemoryBoost(userId, dialogTime) {
    var _a;
    const data = readAll();
    const entry = (_a = data.byUser[userId]) === null || _a === void 0 ? void 0 : _a[dialogTime];
    return (entry === null || entry === void 0 ? void 0 : entry.locked) ? 1.35 : 1;
}
function isMemoryArchived(userId, dialogTime) {
    var _a, _b;
    const data = readAll();
    return Boolean((_b = (_a = data.byUser[userId]) === null || _a === void 0 ? void 0 : _a[dialogTime]) === null || _b === void 0 ? void 0 : _b.archived);
}
