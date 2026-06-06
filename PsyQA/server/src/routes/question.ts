import { Router } from 'express';
import {
  getQuestions,
  getQuestionById,
  askQuestion,
  askQuestionStream,
  getAllCategories,
  getUserProgress,
  getUserProgressText,
  clearUserHistoryData,
  getSystemStats,
  getGroupedHistory,
  getInsightsStatus
} from '../controllers/questionController';
import { postAnalyzePsych } from '../controllers/analyzeController';
import { postSelfRating } from '../controllers/ratingController';
import {
  getKnowledgeUpdateStatus,
  postKnowledgeUpdate
} from '../controllers/knowledgeAdminController';
import {
  getSessionFeedbackForDialog,
  getUserProfileHandler,
  postSessionFeedback
} from '../controllers/feedbackController';
import {
  getUserAgentProfileAdmin,
  getUserAgentProfileHandler,
  patchUserAgentProfileHandler,
  exportUserAgentProfileHandler
} from '../controllers/agentController';
import { attachAuth, requireAuth, requireRole } from '../middleware/authMiddleware';

const questionRouter = Router();

questionRouter.use(attachAuth);

questionRouter.get('/', getQuestions);
questionRouter.get('/categories', getAllCategories);

const studentApi = [requireAuth, requireRole('student')] as const;

questionRouter.post('/analyze', ...studentApi, postAnalyzePsych);
questionRouter.post('/self-rating', ...studentApi, postSelfRating);
questionRouter.post('/ask', ...studentApi, askQuestion);
questionRouter.post('/ask/stream', ...studentApi, askQuestionStream);
questionRouter.get('/insights/status', ...studentApi, getInsightsStatus);
questionRouter.get('/progress', ...studentApi, getUserProgress);
questionRouter.get('/progress/text', ...studentApi, getUserProgressText);
questionRouter.get('/history/grouped', ...studentApi, getGroupedHistory);
questionRouter.post('/history/clear', ...studentApi, clearUserHistoryData);
questionRouter.post('/session-feedback', ...studentApi, postSessionFeedback);
questionRouter.get('/session-feedback', ...studentApi, getSessionFeedbackForDialog);
questionRouter.get('/profile', ...studentApi, getUserProfileHandler);
questionRouter.get('/agent-profile', ...studentApi, getUserAgentProfileHandler);
questionRouter.get('/agent-profile/export', ...studentApi, exportUserAgentProfileHandler);
questionRouter.patch('/agent-profile', ...studentApi, patchUserAgentProfileHandler);

questionRouter.get('/stats', requireAuth, requireRole('admin'), getSystemStats);
questionRouter.get('/admin/agent-profile', requireAuth, requireRole('admin'), getUserAgentProfileAdmin);
questionRouter.get('/admin/knowledge-status', requireAuth, requireRole('admin'), getKnowledgeUpdateStatus);
questionRouter.post('/admin/knowledge-update', requireAuth, requireRole('admin'), postKnowledgeUpdate);
questionRouter.get('/:id', getQuestionById);

export { questionRouter };
