import { Router } from 'express';
import {
  getAdminUsers,
  getSchoolReportExport,
  getSchoolMonthlyLedgerExport,
  patchAdminUser,
  postAdminUser
} from '../controllers/schoolAdminController';

export const schoolAdminRouter = Router();

schoolAdminRouter.get('/report', getSchoolReportExport);
schoolAdminRouter.get('/report/monthly-ledger', getSchoolMonthlyLedgerExport);
schoolAdminRouter.get('/users', getAdminUsers);
schoolAdminRouter.post('/users', postAdminUser);
schoolAdminRouter.patch('/users/:userId', patchAdminUser);
