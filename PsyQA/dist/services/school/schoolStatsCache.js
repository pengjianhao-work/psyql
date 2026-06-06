"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordConsultationForSchool = recordConsultationForSchool;
exports.getOrgStatsSlice = getOrgStatsSlice;
exports.invalidateSchoolStatsCache = invalidateSchoolStatsCache;
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const emotionService_1 = require("../psych/emotionService");
const paths_1 = require("../../config/paths");
const CACHE_PATH = (0, paths_1.resolveDataFile)('school_stats_cache.json');
const emptySlice = () => ({
    totalConsultations: 0,
    activeStudentIds: [],
    highRiskDialogCount: 0,
    highRiskStudentIds: [],
    problemCounts: {},
    emotionCounts: {},
    stressSum: 0,
    stressN: 0,
    updatedAt: new Date().toISOString()
});
function loadCache() {
    return (0, jsonFileStore_1.readJsonFileSync)(CACHE_PATH, { byOrg: {}, global: emptySlice() });
}
function saveCache(data) {
    (0, jsonFileStore_1.writeJsonFileSync)(CACHE_PATH, data);
}
function ensureStudent(slice, studentId) {
    if (!slice.activeStudentIds.includes(studentId)) {
        slice.activeStudentIds.push(studentId);
    }
}
function recordConsultationForSchool(params) {
    const cache = loadCache();
    const orgKey = params.orgId || 'default';
    if (!cache.byOrg[orgKey])
        cache.byOrg[orgKey] = emptySlice();
    const slices = [cache.global, cache.byOrg[orgKey]];
    for (const slice of slices) {
        slice.totalConsultations += 1;
        ensureStudent(slice, params.studentId);
        if (params.psych) {
            const prob = (0, emotionService_1.getCategoryName)(params.psych.problem);
            slice.problemCounts[prob] = (slice.problemCounts[prob] || 0) + 1;
            slice.emotionCounts[params.psych.emotion] = (slice.emotionCounts[params.psych.emotion] || 0) + 1;
            slice.stressSum += params.psych.stressLevel;
            slice.stressN += 1;
            if (params.psych.risk === 'high' || params.psych.risk === 'critical') {
                slice.highRiskDialogCount += 1;
                if (!slice.highRiskStudentIds.includes(params.studentId)) {
                    slice.highRiskStudentIds.push(params.studentId);
                }
            }
        }
        slice.updatedAt = new Date().toISOString();
    }
    saveCache(cache);
}
function getOrgStatsSlice(orgIds) {
    const cache = loadCache();
    if (!(orgIds === null || orgIds === void 0 ? void 0 : orgIds.length))
        return cache.global;
    const merged = emptySlice();
    for (const id of orgIds) {
        const slice = cache.byOrg[id] || cache.byOrg.default;
        if (!slice)
            continue;
        merged.totalConsultations += slice.totalConsultations;
        merged.highRiskDialogCount += slice.highRiskDialogCount;
        merged.stressSum += slice.stressSum;
        merged.stressN += slice.stressN;
        for (const sid of slice.activeStudentIds) {
            if (!merged.activeStudentIds.includes(sid))
                merged.activeStudentIds.push(sid);
        }
        for (const sid of slice.highRiskStudentIds) {
            if (!merged.highRiskStudentIds.includes(sid))
                merged.highRiskStudentIds.push(sid);
        }
        for (const [k, v] of Object.entries(slice.problemCounts)) {
            merged.problemCounts[k] = (merged.problemCounts[k] || 0) + v;
        }
        for (const [k, v] of Object.entries(slice.emotionCounts)) {
            merged.emotionCounts[k] = (merged.emotionCounts[k] || 0) + v;
        }
    }
    return merged;
}
function invalidateSchoolStatsCache() {
    saveCache({ byOrg: {}, global: emptySlice() });
}
