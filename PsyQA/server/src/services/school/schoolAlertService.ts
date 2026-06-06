import { RiskLevel } from '../psych/emotionService';
import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';
import {
  readAllAlertsFromDb,
  writeAllAlertsToDb,
  insertAlertInDb,
  updateAlertInDb
} from '../../db/alertStore';
import { notifyTier1Alert } from './schoolNotificationService';
import { ensureInterventionLedger } from './interventionLedgerService';

export type AlertStatus = 'pending' | 'contacted' | 'referred' | 'closed' | 'false_positive';

export type AlertTier = 1 | 2 | 3;

export interface SchoolAlert {
  id: string;
  studentId: string;
  studentMask: string;
  orgId: string;
  level: 'critical' | 'high' | 'medium';
  /** 1=危机(自杀自伤) 2=重度情绪 3=一般困扰 */
  tier: AlertTier;
  slaHours: number;
  slaDueAt: string;
  source: 'risk' | 'trend' | 'manual';
  summary: string;
  riskKeywords: string[];
  dialogId: string;
  dialogTime: string;
  status: AlertStatus;
  isFalsePositive: boolean;
  assignee?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface AlertFile {
  alerts: SchoolAlert[];
}

const dataPath = resolveDataFile('school_alerts.json');
const USE_SQLITE = process.env.PSYQA_USE_JSON_STORAGE !== '1';

function readAlerts(): AlertFile {
  if (USE_SQLITE) {
    return { alerts: readAllAlertsFromDb() };
  }
  return readJsonFileSync<AlertFile>(dataPath, { alerts: [] });
}

function writeAlerts(data: AlertFile): void {
  if (USE_SQLITE) {
    writeAllAlertsToDb(data.alerts);
    return;
  }
  writeJsonFileSync(dataPath, data);
}

export function maskStudentId(userId: string, displayName?: string): string {
  if (displayName && displayName.length >= 2) {
    return `${displayName[0]}**`;
  }
  if (userId.length <= 4) return '**';
  return `${userId.slice(0, 4)}****`;
}

function resolveAlertTier(riskLevel: RiskLevel, keywords: string[]): {
  tier: AlertTier;
  level: 'critical' | 'high' | 'medium';
  slaHours: number;
} {
  const kw = keywords.join(' ');
  const crisis = /自杀|自伤|自残|不想活|跳楼|割腕|杀人|伤害他人/.test(kw);
  if (riskLevel === 'critical' || crisis) {
    return { tier: 1, level: 'critical', slaHours: 2 };
  }
  if (riskLevel === 'high' || /抑郁|绝望|崩溃|焦虑严重/.test(kw)) {
    return { tier: 2, level: 'high', slaHours: 24 };
  }
  return { tier: 3, level: 'medium', slaHours: 72 };
}

export function recordRiskAlert(params: {
  studentId: string;
  displayName?: string;
  orgId?: string;
  riskLevel: RiskLevel;
  summary: string;
  riskKeywords: string[];
  dialogId: string;
  dialogTime: string;
}): SchoolAlert | null {
  const tierInfo = resolveAlertTier(params.riskLevel, params.riskKeywords);
  if (params.riskLevel === 'low' && tierInfo.tier === 3) {
    return null;
  }
  if (params.riskLevel !== 'high' && params.riskLevel !== 'critical' && tierInfo.tier === 3) {
    return null;
  }

  const level = tierInfo.level;
  const now = new Date().toISOString();
  const slaDueAt = new Date(Date.now() + tierInfo.slaHours * 3600_000).toISOString();
  const alert: SchoolAlert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    studentId: params.studentId,
    studentMask: maskStudentId(params.studentId, params.displayName),
    orgId: params.orgId || 'default',
    level,
    tier: tierInfo.tier,
    slaHours: tierInfo.slaHours,
    slaDueAt,
    source: 'risk',
    summary: params.summary,
    riskKeywords: params.riskKeywords,
    dialogId: params.dialogId,
    dialogTime: params.dialogTime,
    status: 'pending',
    isFalsePositive: false,
    createdAt: now,
    updatedAt: now
  };

  if (USE_SQLITE) {
    insertAlertInDb(alert);
    const data = readAlerts();
    if (data.alerts.length > 500) {
      writeAlerts({ alerts: data.alerts.slice(0, 500) });
    }
    if (alert.tier === 1) notifyTier1Alert(alert);
    if (alert.tier <= 2) {
      ensureInterventionLedger({
        alertId: alert.id,
        studentId: alert.studentId,
        studentMask: alert.studentMask,
        orgId: alert.orgId,
        tier: alert.tier,
        slaDueAt: alert.slaDueAt
      });
    }
    return alert;
  }

  const data = readAlerts();
  data.alerts.unshift(alert);
  if (data.alerts.length > 500) {
    data.alerts = data.alerts.slice(0, 500);
  }
  writeAlerts(data);
  if (alert.tier === 1) notifyTier1Alert(alert);
  if (alert.tier <= 2) {
    ensureInterventionLedger({
      alertId: alert.id,
      studentId: alert.studentId,
      studentMask: alert.studentMask,
      orgId: alert.orgId,
      tier: alert.tier,
      slaDueAt: alert.slaDueAt
    });
  }
  return alert;
}

export function listAlerts(filters?: {
  status?: AlertStatus;
  level?: string;
  tier?: string;
  orgIds?: string[];
  from?: string;
  to?: string;
}): SchoolAlert[] {
  let items = readAlerts().alerts;
  if (filters?.status) {
    items = items.filter((a) => a.status === filters.status);
  }
  if (filters?.level) {
    items = items.filter((a) => a.level === filters.level);
  }
  if (filters?.tier) {
    const t = Number(filters.tier) as AlertTier;
    items = items.filter((a) => (a.tier ?? 2) === t);
  }
  if (filters?.orgIds && filters.orgIds.length > 0) {
    items = items.filter((a) => filters.orgIds!.includes(a.orgId));
  }
  if (filters?.from) {
    items = items.filter((a) => a.dialogTime >= filters.from!);
  }
  if (filters?.to) {
    items = items.filter((a) => a.dialogTime <= filters.to!);
  }
  return items
    .map((a) => ({
      ...a,
      tier: a.tier ?? (a.level === 'critical' ? 1 : a.level === 'high' ? 2 : 3),
      slaHours: a.slaHours ?? (a.level === 'critical' ? 2 : 24),
      slaDueAt: a.slaDueAt ?? a.createdAt
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAlertById(alertId: string): SchoolAlert | null {
  return readAlerts().alerts.find((a) => a.id === alertId) ?? null;
}

export function updateAlert(
  alertId: string,
  patch: {
    status?: AlertStatus;
    assignee?: string;
    notes?: string;
    isFalsePositive?: boolean;
  }
): SchoolAlert | null {
  const data = readAlerts();
  const idx = data.alerts.findIndex((a) => a.id === alertId);
  if (idx < 0) return null;

  const current = data.alerts[idx];
  const now = new Date().toISOString();
  const nextStatus = patch.status ?? current.status;
  const isFalsePositive =
    patch.isFalsePositive !== undefined
      ? patch.isFalsePositive
      : nextStatus === 'false_positive' || current.isFalsePositive;

  const updated: SchoolAlert = {
    ...current,
    status: nextStatus,
    isFalsePositive,
    assignee: patch.assignee !== undefined ? patch.assignee : current.assignee,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    updatedAt: now
  };

  if (USE_SQLITE) {
    updateAlertInDb(updated);
  } else {
    data.alerts[idx] = updated;
    writeAlerts(data);
  }
  return updated;
}
