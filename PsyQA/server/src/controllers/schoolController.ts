import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  getDashboardForUser,
  getStudentDetailForUser,
  getStudentSummaryForUser,
  listStudentsForUser
} from '../services/school/schoolService';
import { getAlertById, listAlerts, updateAlert, AlertStatus } from '../services/school/schoolAlertService';
import {
  listNotificationsForUser,
  markNotificationsRead
} from '../services/school/schoolNotificationService';
export const getSchoolDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  const stats = await getDashboardForUser(req.authUser!);
  res.json(stats);
};

export const getSchoolStudents = async (req: AuthRequest, res: Response): Promise<void> => {
  const students = await listStudentsForUser(req.authUser!);
  res.json({ students });
};

export const getSchoolStudentDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  const studentId = String(req.params.studentId || '').trim();
  if (!studentId) {
    res.status(400).json({ error: '缺少学生 ID' });
    return;
  }
  const detail = await getStudentDetailForUser(req.authUser!, studentId);
  if (!detail) {
    res.status(404).json({ error: '未找到该学生或无权访问' });
    return;
  }
  res.json(detail);
};

export const getSchoolAlerts = (req: AuthRequest, res: Response): void => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const level = req.query.level ? String(req.query.level) : undefined;
  const tier = req.query.tier ? String(req.query.tier) : undefined;
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const user = req.authUser!;
  const orgIds =
    user.role === 'admin'
      ? undefined
      : user.managedOrgIds?.length
        ? user.managedOrgIds
        : user.orgId
          ? [user.orgId]
          : undefined;
  const alerts = listAlerts({ status: status as never, level, tier, orgIds, from, to });
  res.json({ count: alerts.length, alerts });
};

function userCanAccessAlertOrg(user: NonNullable<AuthRequest['authUser']>, orgId: string): boolean {
  if (user.role === 'admin') return true;
  const allowed =
    user.managedOrgIds?.length ? user.managedOrgIds : user.orgId ? [user.orgId] : [];
  return allowed.includes(orgId);
}

export const patchSchoolAlert = (req: AuthRequest, res: Response): void => {
  const alertId = String(req.params.alertId || '').trim();
  if (!alertId) {
    res.status(400).json({ error: '缺少预警 ID' });
    return;
  }

  const alert = getAlertById(alertId);
  if (!alert) {
    res.status(404).json({ error: '未找到该预警' });
    return;
  }

  const user = req.authUser!;
  if (!userCanAccessAlertOrg(user, alert.orgId)) {
    res.status(403).json({ error: '无权处理该预警' });
    return;
  }

  const body = req.body as {
    status?: string;
    assignee?: string;
    notes?: string;
    isFalsePositive?: boolean;
  };

  const updated = updateAlert(alertId, {
    status: body.status as AlertStatus | undefined,
    assignee: body.assignee !== undefined ? String(body.assignee) : undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
    isFalsePositive: body.isFalsePositive
  });

  if (!updated) {
    res.status(404).json({ error: '未找到该预警' });
    return;
  }

  res.json({ message: '预警已更新', alert: updated });
};

export const getSchoolNotifications = (req: AuthRequest, res: Response): void => {
  const user = req.authUser!;
  const orgIds =
    user.role === 'admin'
      ? undefined
      : user.managedOrgIds?.length
        ? user.managedOrgIds
        : user.orgId
          ? [user.orgId]
          : undefined;
  res.json({ notifications: listNotificationsForUser(user.id, orgIds) });
};

export const postMarkSchoolNotificationsRead = (req: AuthRequest, res: Response): void => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
  markNotificationsRead(req.authUser!.id, ids);
  res.json({ message: '已标记为已读' });
};