"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTranscriptRequest = createTranscriptRequest;
exports.listTranscriptRequestsForStudent = listTranscriptRequestsForStudent;
exports.listTranscriptRequestsForCounselor = listTranscriptRequestsForCounselor;
exports.resolveTranscriptRequest = resolveTranscriptRequest;
exports.hasApprovedTranscriptAccess = hasApprovedTranscriptAccess;
exports.batchCreateTranscriptRequests = batchCreateTranscriptRequests;
exports.batchResolveTranscriptRequests = batchResolveTranscriptRequests;
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const paths_1 = require("../../config/paths");
const dataPath = (0, paths_1.resolveDataFile)('transcript_requests.json');
function readAll() {
    return (0, jsonFileStore_1.readJsonFileSync)(dataPath, { requests: [] });
}
function writeAll(data) {
    (0, jsonFileStore_1.writeJsonFileSync)(dataPath, data);
}
function createTranscriptRequest(input) {
    const req = Object.assign(Object.assign({ id: `tvr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }, input), { status: 'pending', createdAt: new Date().toISOString() });
    const data = readAll();
    data.requests.unshift(req);
    writeAll(data);
    return req;
}
function listTranscriptRequestsForStudent(studentId) {
    return readAll().requests.filter((r) => r.studentId === studentId);
}
function listTranscriptRequestsForCounselor(counselorId) {
    return readAll().requests.filter((r) => r.counselorId === counselorId);
}
function resolveTranscriptRequest(requestId, studentId, approve) {
    const data = readAll();
    const idx = data.requests.findIndex((r) => r.id === requestId && r.studentId === studentId);
    if (idx < 0)
        return null;
    const now = new Date().toISOString();
    data.requests[idx] = Object.assign(Object.assign({}, data.requests[idx]), { status: approve ? 'approved' : 'rejected', resolvedAt: now });
    writeAll(data);
    return data.requests[idx];
}
function hasApprovedTranscriptAccess(studentId, counselorId) {
    return readAll().requests.some((r) => r.studentId === studentId && r.counselorId === counselorId && r.status === 'approved');
}
function batchCreateTranscriptRequests(input) {
    const created = [];
    for (const studentId of input.studentIds) {
        const existing = readAll().requests.find((r) => r.studentId === studentId && r.counselorId === input.counselorId && r.status === 'pending');
        if (existing)
            continue;
        created.push(createTranscriptRequest({
            studentId,
            counselorId: input.counselorId,
            counselorName: input.counselorName,
            orgId: input.orgId,
            reason: input.reason
        }));
    }
    return created;
}
function batchResolveTranscriptRequests(studentId, requestIds, approve) {
    let n = 0;
    for (const id of requestIds) {
        if (resolveTranscriptRequest(id, studentId, approve))
            n += 1;
    }
    return n;
}
