import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  buildSchoolReport,
  schoolReportToCsv,
  schoolMonthlyLedgerCsv,
  schoolMonthlyLedgerExcel,
  SchoolReportPayload
} from '../services/school/schoolReportService';
import {
  createUserByAdmin,
  listUsersForAdmin,
  updateUserByAdmin
} from '../services/user/adminAccountService';
import { UserRole } from '../services/user/accountService';

export const getSchoolReportExport = async (req: AuthRequest, res: Response): Promise<void> => {
  const format = String(req.query.format || 'json').toLowerCase();
  const report = await buildSchoolReport(req.authUser!);

  if (format === 'csv') {
    const csv = schoolReportToCsv(report);
    const filename = `psyqa-school-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csv);
    return;
  }

  res.json(report satisfies SchoolReportPayload);
};

export const getSchoolMonthlyLedgerExport = async (req: AuthRequest, res: Response): Promise<void> => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const report = await buildSchoolReport(req.authUser!);

  if (format === 'csv') {
    const csv = schoolMonthlyLedgerCsv(report, month);
    const filename = `psyqa-monthly-ledger-${month}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csv);
    return;
  }

  const xml = schoolMonthlyLedgerExcel(report, month);
  const filename = `psyqa-monthly-ledger-${month}.xls`;
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + xml);
};

export const getAdminUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  const users = await listUsersForAdmin();
  res.json({ count: users.length, users });
};

export const postAdminUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: UserRole;
    orgId?: string;
    managedOrgIds?: string[];
  };

  if (!body.username || !body.password || !body.role) {
    res.status(400).json({ error: '需提供 username、password、role' });
    return;
  }

  const result = await createUserByAdmin({
    username: String(body.username),
    password: String(body.password),
    displayName: body.displayName ? String(body.displayName) : undefined,
    role: body.role,
    orgId: body.orgId ? String(body.orgId) : undefined,
    managedOrgIds: Array.isArray(body.managedOrgIds) ? body.managedOrgIds.map(String) : undefined
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({ message: '用户已创建', user: result.user });
};

export const patchAdminUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: '缺少用户 ID' });
    return;
  }

  const body = req.body as {
    displayName?: string;
    role?: UserRole;
    orgId?: string;
    className?: string;
    studentNo?: string;
    managedOrgIds?: string[];
    allowSchoolTranscriptView?: boolean;
    newPassword?: string;
  };

  const result = await updateUserByAdmin(req.authUser!.id, userId, {
    displayName: body.displayName !== undefined ? String(body.displayName) : undefined,
    role: body.role,
    orgId: body.orgId !== undefined ? String(body.orgId) : undefined,
    className: body.className !== undefined ? String(body.className) : undefined,
    studentNo: body.studentNo !== undefined ? String(body.studentNo) : undefined,
    managedOrgIds: Array.isArray(body.managedOrgIds) ? body.managedOrgIds.map(String) : undefined,
    allowSchoolTranscriptView:
      body.allowSchoolTranscriptView !== undefined ? Boolean(body.allowSchoolTranscriptView) : undefined,
    newPassword: body.newPassword ? String(body.newPassword) : undefined
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ message: '用户已更新', user: result.user });
};
