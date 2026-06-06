import { Router } from 'express';
import { attachAuth, requireAuth, requireRole, requirePermission } from '../middleware/authMiddleware';
import {
  getSchoolAlerts,
  getSchoolDashboard,
  getSchoolNotifications,
  getSchoolStudentDetail,
  getSchoolStudents,
  patchSchoolAlert,
  postMarkSchoolNotificationsRead
} from '../controllers/schoolController';
import {
  getCounselorTranscriptRequests,
  postCounselorTranscriptRequest
} from '../controllers/transcriptController';
import {
  getSchoolHeatmap,
  getInterventionLedgers,
  patchInterventionLedger,
  postKnowledgeReview,
  getKnowledgeReviews,
  postBatchTranscriptRequest
} from '../controllers/innovationController';
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
schoolRouter.get('/notifications', getSchoolNotifications);
schoolRouter.post('/notifications/read', postMarkSchoolNotificationsRead);
schoolRouter.post('/transcript-requests', postCounselorTranscriptRequest);
schoolRouter.post('/transcript-requests/batch', postBatchTranscriptRequest);
schoolRouter.get('/transcript-requests', getCounselorTranscriptRequests);
schoolRouter.get('/heatmap', getSchoolHeatmap);
schoolRouter.get('/intervention-ledgers', getInterventionLedgers);
schoolRouter.patch('/intervention-ledgers/:id', patchInterventionLedger);
schoolRouter.post('/knowledge-reviews', postKnowledgeReview);
schoolRouter.get('/knowledge-reviews', getKnowledgeReviews);
schoolRouter.use('/admin', requireRole('admin'), requirePermission('school:manage'), schoolAdminRouter);

export { schoolRouter };
