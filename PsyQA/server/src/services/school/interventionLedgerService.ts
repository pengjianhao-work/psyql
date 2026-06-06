import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';

export interface InterventionRecord {
  id: string;
  alertId: string;
  studentId: string;
  studentMask: string;
  orgId: string;
  tier: 1 | 2 | 3;
  slaDueAt: string;
  status: 'open' | 'in_progress' | 'closed';
  meetingNotes: string[];
  measures: string[];
  nextFollowUpAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface LedgerFile {
  records: InterventionRecord[];
}

const dataPath = resolveDataFile('intervention_ledgers.json');

function readAll(): LedgerFile {
  return readJsonFileSync<LedgerFile>(dataPath, { records: [] });
}

function writeAll(data: LedgerFile): void {
  writeJsonFileSync(dataPath, data);
}

export function ensureInterventionLedger(input: {
  alertId: string;
  studentId: string;
  studentMask: string;
  orgId: string;
  tier: 1 | 2 | 3;
  slaDueAt: string;
}): InterventionRecord {
  const data = readAll();
  const existing = data.records.find((r) => r.alertId === input.alertId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const record: InterventionRecord = {
    id: `il_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    alertId: input.alertId,
    studentId: input.studentId,
    studentMask: input.studentMask,
    orgId: input.orgId,
    tier: input.tier,
    slaDueAt: input.slaDueAt,
    status: 'open',
    meetingNotes: [],
    measures: [],
    createdAt: now,
    updatedAt: now
  };
  data.records.unshift(record);
  if (data.records.length > 300) data.records = data.records.slice(0, 300);
  writeAll(data);
  return record;
}

export function listInterventionLedgers(orgIds?: string[]): InterventionRecord[] {
  let items = readAll().records;
  if (orgIds?.length) items = items.filter((r) => orgIds.includes(r.orgId));
  return items.sort((a, b) => a.slaDueAt.localeCompare(b.slaDueAt));
}

export function updateInterventionLedger(
  id: string,
  patch: Partial<Pick<InterventionRecord, 'status' | 'meetingNotes' | 'measures' | 'nextFollowUpAt' | 'closedAt'>>
): InterventionRecord | null {
  const data = readAll();
  const idx = data.records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const row = data.records[idx];
  if (patch.meetingNotes) row.meetingNotes = patch.meetingNotes;
  if (patch.measures) row.measures = patch.measures;
  if (patch.status) row.status = patch.status;
  if (patch.nextFollowUpAt !== undefined) row.nextFollowUpAt = patch.nextFollowUpAt;
  if (patch.closedAt !== undefined) row.closedAt = patch.closedAt;
  row.updatedAt = new Date().toISOString();
  data.records[idx] = row;
  writeAll(data);
  return row;
}

export function getOverdueFollowUps(orgIds?: string[]): InterventionRecord[] {
  const now = Date.now();
  return listInterventionLedgers(orgIds).filter((r) => {
    if (r.status === 'closed') return false;
    if (r.slaDueAt && new Date(r.slaDueAt).getTime() < now) return true;
    if (r.nextFollowUpAt && new Date(r.nextFollowUpAt).getTime() < now) return true;
    return false;
  });
}
