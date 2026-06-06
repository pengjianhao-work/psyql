import { Router } from 'express';
import { attachAuth, requireAuth, requireRole, requirePermission } from '../middleware/authMiddleware';
import {
  getSchoolAlerts,
  getSchoolDashboard,
  getSchoolStudentDetail,
  getSchoolStudents,
  patchSchoolAlert
} from '../controllers/schoolController';
import { schoolAdminRouter } from './schoolAdmin';

const schoolRouter = Router();

schoolRouter.use(attachAuth);
schoolRouter.use(requireAuth);
schoolRouter.use(requireRole('counselor', 'admin'));

schoolRouter.get('/dashboard', getSchoolDashboard);
schoolRouter.get('/students', getSchoolStudents);
schoolRouter.get('/students/:studentId', getSchoolStudentDetail);
schoolRouter.get('/alerts', getSchoolAlerts);
schoolRouter.patch('/alerts/:alertId', patchSchoolAlert);
schoolRouter.use('/admin', requireRole('admin'), requirePermission('school:manage'), schoolAdminRouter);

export { schoolRouter };
