import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';

export type TranscriptRequestStatus = 'pending' | 'approved' | 'rejected';

export interface TranscriptViewRequest {
  id: string;
  studentId: string;
  counselorId: string;
  counselorName: string;
  orgId: string;
  reason: string;
  status: TranscriptRequestStatus;
  createdAt: string;
  resolvedAt?: string;
}

interface RequestFile {
  requests: TranscriptViewRequest[];
}

const dataPath = resolveDataFile('transcript_requests.json');

function readAll(): RequestFile {
  return readJsonFileSync<RequestFile>(dataPath, { requests: [] });
}

function writeAll(data: RequestFile): void {
  writeJsonFileSync(dataPath, data);
}

export function createTranscriptRequest(input: {
  studentId: string;
  counselorId: string;
  counselorName: string;
  orgId: string;
  reason: string;
}): TranscriptViewRequest {
  const req: TranscriptViewRequest = {
    id: `tvr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  const data = readAll();
  data.requests.unshift(req);
  writeAll(data);
  return req;
}

export function listTranscriptRequestsForStudent(studentId: string): TranscriptViewRequest[] {
  return readAll().requests.filter((r) => r.studentId === studentId);
}

export function listTranscriptRequestsForCounselor(counselorId: string): TranscriptViewRequest[] {
  return readAll().requests.filter((r) => r.counselorId === counselorId);
}

export function resolveTranscriptRequest(
  requestId: string,
  studentId: string,
  approve: boolean
): TranscriptViewRequest | null {
  const data = readAll();
  const idx = data.requests.findIndex((r) => r.id === requestId && r.studentId === studentId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  data.requests[idx] = {
    ...data.requests[idx],
    status: approve ? 'approved' : 'rejected',
    resolvedAt: now
  };
  writeAll(data);
  return data.requests[idx];
}

export function hasApprovedTranscriptAccess(studentId: string, counselorId: string): boolean {
  return readAll().requests.some(
    (r) => r.studentId === studentId && r.counselorId === counselorId && r.status === 'approved'
  );
}

export function batchCreateTranscriptRequests(input: {
  studentIds: string[];
  counselorId: string;
  counselorName: string;
  orgId: string;
  reason: string;
}): TranscriptViewRequest[] {
  const created: TranscriptViewRequest[] = [];
  for (const studentId of input.studentIds) {
    const existing = readAll().requests.find(
      (r) => r.studentId === studentId && r.counselorId === input.counselorId && r.status === 'pending'
    );
    if (existing) continue;
    created.push(
      createTranscriptRequest({
        studentId,
        counselorId: input.counselorId,
        counselorName: input.counselorName,
        orgId: input.orgId,
        reason: input.reason
      })
    );
  }
  return created;
}

export function batchResolveTranscriptRequests(
  studentId: string,
  requestIds: string[],
  approve: boolean
): number {
  let n = 0;
  for (const id of requestIds) {
    if (resolveTranscriptRequest(id, studentId, approve)) n += 1;
  }
  return n;
}
