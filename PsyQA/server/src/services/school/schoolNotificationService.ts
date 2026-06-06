import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';
import { SchoolAlert } from './schoolAlertService';

export interface SchoolNotification {
  id: string;
  type: 'tier1_alert';
  alertId: string;
  studentMask: string;
  summary: string;
  orgId: string;
  tier: 1;
  createdAt: string;
  readBy: string[];
}

interface NotificationFile {
  items: SchoolNotification[];
}

const dataPath = resolveDataFile('school_notifications.json');
const MAX_ITEMS = 200;

function readAll(): NotificationFile {
  return readJsonFileSync<NotificationFile>(dataPath, { items: [] });
}

function writeAll(data: NotificationFile): void {
  writeJsonFileSync(dataPath, data);
}

export function notifyTier1Alert(alert: SchoolAlert): void {
  if ((alert.tier ?? 2) !== 1) return;
  const data = readAll();
  if (data.items.some((n) => n.alertId === alert.id)) return;
  const item: SchoolNotification = {
    id: `sn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'tier1_alert',
    alertId: alert.id,
    studentMask: alert.studentMask,
    summary: alert.summary,
    orgId: alert.orgId,
    tier: 1,
    createdAt: new Date().toISOString(),
    readBy: []
  };
  data.items.unshift(item);
  if (data.items.length > MAX_ITEMS) {
    data.items = data.items.slice(0, MAX_ITEMS);
  }
  writeAll(data);
}

export function listNotificationsForUser(
  userId: string,
  orgIds?: string[]
): SchoolNotification[] {
  const items = readAll().items;
  return items.filter((n) => {
    if (orgIds && orgIds.length > 0 && !orgIds.includes(n.orgId)) return false;
    return !n.readBy.includes(userId);
  });
}

export function markNotificationsRead(userId: string, ids: string[]): void {
  if (!ids.length) return;
  const data = readAll();
  let changed = false;
  for (const item of data.items) {
    if (ids.includes(item.id) && !item.readBy.includes(userId)) {
      item.readBy.push(userId);
      changed = true;
    }
  }
  if (changed) writeAll(data);
}
