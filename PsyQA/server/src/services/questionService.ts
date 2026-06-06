export { CombinedAnswer } from './question/answerOrchestrator';
export { generateAIAnswer } from './question/answerOrchestrator';
export {
  loadQuestions,
  findSimilarQuestions,
  getCategories,
  getAllCategories,
  enhanceQueryWithKeywords,
  type CategoryInfo
} from './question/questionCatalog';
export {
  getUserProgressData,
  buildLatestAssessment,
  type UserProgress,
  type LatestAssessmentPayload
} from './question/userProgressService';
export { getUserProgress, clearUserHistory } from './common/historyManager';
