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
  postKnowledgeUpdate,
  getKnowledgeItems,
  postKnowledgeItem
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
  exportUserAgentProfileHandler,
  listUserAgentMemoriesHandler,
  deleteUserAgentMemoryHandler
} from '../controllers/agentController';
import {
  getStudentTranscriptRequests,
  postResolveTranscriptRequest
} from '../controllers/transcriptController';
import {
  getEmotionRhythm,
  getCbtModule,
  postCbtComplete,
  getMemoryTags,
  patchMemoryTag,
  postMemoryBatchArchive,
  getSeasonalRag,
  getImplicitNeeds,
  postBatchResolveTranscript
} from '../controllers/innovationController';
import {
  attachAuth,
  requireAuth,
  requireRole,
  requireStudentAccess,
  assertSelfUserId
} from '../middleware/authMiddleware';

const questionRouter = Router();

questionRouter.use(attachAuth);

questionRouter.get('/', getQuestions);
questionRouter.get('/categories', getAllCategories);

const studentApi = [requireStudentAccess, assertSelfUserId] as const;

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
questionRouter.get('/agent-memories', ...studentApi, listUserAgentMemoriesHandler);
questionRouter.delete('/agent-memory', ...studentApi, deleteUserAgentMemoryHandler);
questionRouter.get('/transcript-requests', ...studentApi, getStudentTranscriptRequests);
questionRouter.post('/transcript-requests/resolve', ...studentApi, postResolveTranscriptRequest);
questionRouter.post('/transcript-requests/batch-resolve', ...studentApi, postBatchResolveTranscript);
questionRouter.get('/emotion-rhythm', ...studentApi, getEmotionRhythm);
questionRouter.get('/cbt-module', ...studentApi, getCbtModule);
questionRouter.post('/cbt-complete', ...studentApi, postCbtComplete);
questionRouter.get('/memory-tags', ...studentApi, getMemoryTags);
questionRouter.patch('/memory-tag', ...studentApi, patchMemoryTag);
questionRouter.post('/memory-batch-archive', ...studentApi, postMemoryBatchArchive);
questionRouter.get('/implicit-needs', ...studentApi, getImplicitNeeds);
questionRouter.get('/seasonal-rag', getSeasonalRag);

questionRouter.get('/stats', requireAuth, requireRole('admin'), getSystemStats);
questionRouter.get('/admin/agent-profile', requireAuth, requireRole('admin'), getUserAgentProfileAdmin);
questionRouter.get('/admin/knowledge-status', requireAuth, requireRole('admin'), getKnowledgeUpdateStatus);
questionRouter.get('/admin/knowledge-items', requireAuth, requireRole('admin'), getKnowledgeItems);
questionRouter.post('/admin/knowledge-items', requireAuth, requireRole('admin'), postKnowledgeItem);
questionRouter.post('/admin/knowledge-update', requireAuth, requireRole('admin'), postKnowledgeUpdate);
questionRouter.get('/:id', getQuestionById);

export { questionRouter };
