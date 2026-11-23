import { Router } from 'express';
import { attachAuth, requireAuth, requireRole, requirePermission } from '../middleware/authMiddleware';
import {
  getSchoolAlerts,
  getSchoolDashboard,
  getSchoolNotifications,
  getSchoolStudentDetail,
  getSchoolStudents,
  getSchoolWeather,
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
// 顶层放行教师角色；个体级数据由各路由 staffOnly 再拦截
schoolRouter.use(requireRole('teacher', 'counselor', 'admin'));

const staffOnly = requireRole('counselor', 'admin');

// 教师可见：聚合视图（看板 / 情绪气象 / 热力图）
schoolRouter.get('/dashboard', getSchoolDashboard);
schoolRouter.get('/weather', getSchoolWeather);
schoolRouter.get('/heatmap', getSchoolHeatmap);

// 仅辅导员与管理员：学生个体数据、告警、通知、原文申请、台账与知识审核
schoolRouter.get('/students', staffOnly, getSchoolStudents);
schoolRouter.get('/students/:studentId', staffOnly, getSchoolStudentDetail);
schoolRouter.get('/alerts', staffOnly, getSchoolAlerts);
schoolRouter.patch('/alerts/:alertId', staffOnly, patchSchoolAlert);
schoolRouter.get('/notifications', staffOnly, getSchoolNotifications);
schoolRouter.post('/notifications/read', staffOnly, postMarkSchoolNotificationsRead);
schoolRouter.post('/transcript-requests', staffOnly, postCounselorTranscriptRequest);
schoolRouter.post('/transcript-requests/batch', staffOnly, postBatchTranscriptRequest);
schoolRouter.get('/transcript-requests', staffOnly, getCounselorTranscriptRequests);
schoolRouter.get('/intervention-ledgers', staffOnly, getInterventionLedgers);
schoolRouter.patch('/intervention-ledgers/:id', staffOnly, patchInterventionLedger);
schoolRouter.post('/knowledge-reviews', staffOnly, postKnowledgeReview);
schoolRouter.get('/knowledge-reviews', staffOnly, getKnowledgeReviews);
schoolRouter.use('/admin', requireRole('admin'), requirePermission('school:manage'), schoolAdminRouter);

export { schoolRouter };
