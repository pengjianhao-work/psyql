import axios from 'axios';
import { GroupedHistoryItem, QuestionResponse, UserProgress } from '../types';

const API_BASE_URL = '/api/questions';
const API_TIMEOUT = 30000;
const ASK_TIMEOUT = 120000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  withCredentials: true
});

const AUTH_STORAGE_KEY = 'psyqa_auth_token';

let cachedAuthToken: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_STORAGE_KEY) : null;

export function getAuthToken(): string | null {
  return cachedAuthToken;
}

export function setAuthToken(token: string | null): void {
  cachedAuthToken = token;
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  else window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

api.interceptors.request.use((config) => {
  const t = getAuthToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});
attachBackendFallback(api, '/api/questions');

export type GenerationHint = 'llm_ok' | 'retrieval_miss' | 'kb_empty' | 'llm_fallback' | 'rule_only' | 'fast_kb';

export interface RuntimeHealth {
  status: string;
  llmMode: 'zhipu' | 'ollama' | 'fallback' | 'fast';
  llmProvider?: 'zhipu' | 'ollama' | null;
  zhipuConfigured?: boolean;
  ollamaAvailable: boolean;
  llmAvailable?: boolean;
  model?: string;
  fastAnswer?: boolean;
  reactDemo?: boolean;
  knowledge?: {
    knowledgeCount: number;
    datasetUpdatedAt?: string;
    chromaConnected: boolean;
    chromaCount?: number;
    embedReady: boolean;
  };
  build?: {
    version: string;
    startedAt: string;
    nodeVersion: string;
  };
  load?: {
    activeAskRequests: number;
    maxAskRequests: number;
  };
  reportQueue?: {
    pending: number;
    inFlight: number;
  };
}

const BACKEND_ORIGIN =
  (typeof process !== 'undefined' && process.env.REACT_APP_BACKEND_ORIGIN) || '';

function resolveBackendOrigin(): string {
  return (BACKEND_ORIGIN || 'http://localhost:3001').replace(/\/$/, '');
}

/** SSE 走同源路径（开发走 CRA proxy，生产走 Express 同域），避免直连 3001 的 CORS/credentials 问题 */
function resolveStreamUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api/questions/ask/stream';
  }
  return `${resolveBackendOrigin()}/api/questions/ask/stream`;
}

function shouldTryDirectBackend(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.response) {
    const status = error.response.status;
    // CRA 代理在后端不可达时返回 502，仍应尝试直连 3001
    if (status === 502 || status === 504) {
      return process.env.NODE_ENV === 'development' || Boolean(BACKEND_ORIGIN);
    }
    return false;
  }
  return process.env.NODE_ENV === 'development' || Boolean(BACKEND_ORIGIN);
}

/** 开发环境：代理失败时自动直连 3001（与 /health 回退一致） */
function attachBackendFallback(client: ReturnType<typeof axios.create>, apiPrefix: string): void {
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const cfg = error.config as (typeof error.config & { __directRetry?: boolean }) | undefined;
      if (!cfg || cfg.__directRetry || !shouldTryDirectBackend(error)) {
        return Promise.reject(error);
      }
      cfg.__directRetry = true;
      const path = String(cfg.url || '').replace(/^\//, '');
      const directUrl = `${resolveBackendOrigin()}${apiPrefix}/${path}`;
      const token = getAuthToken();
      return axios.request({
        method: cfg.method,
        url: directUrl,
        data: cfg.data,
        params: cfg.params,
        timeout: cfg.timeout,
        withCredentials: true,
        headers: {
          ...(cfg.headers as Record<string, string>),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
    }
  );
}

async function fetchHealthFrom(url: string): Promise<RuntimeHealth> {
  const { data } = await axios.get<RuntimeHealth>(url, { timeout: 5000 });
  return data;
}

/** 优先走 CRA 代理 /health；失败时在开发环境直连 3001 */
export async function fetchRuntimeHealth(): Promise<RuntimeHealth> {
  try {
    return await fetchHealthFrom('/health');
  } catch (first) {
    const origin = resolveBackendOrigin();
    if (process.env.NODE_ENV === 'development' || BACKEND_ORIGIN) {
      try {
        return await fetchHealthFrom(`${origin}/health`);
      } catch {
        throw first;
      }
    }
    throw first;
  }
}

export type UserRole = 'student' | 'counselor' | 'admin';

export type StudentGender = 'male' | 'female' | 'other' | 'prefer_not_say';

export const GENDER_OPTIONS: Array<{ value: StudentGender | ''; label: string }> = [
  { value: '', label: '请选择' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'prefer_not_say', label: '不愿透露' }
];

export const GENDER_LABELS: Record<StudentGender, string> = {
  male: '男',
  female: '女',
  other: '其他',
  prefer_not_say: '不愿透露'
};

export function formatGender(g?: StudentGender | string): string {
  if (!g) return '未填写';
  return GENDER_LABELS[g as StudentGender] ?? '未填写';
}

export interface AuthUserPublic {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  orgId?: string;
  orgName?: string;
  schoolName?: string;
  className?: string;
  studentNo?: string;
  realName?: string;
  gender?: StudentGender;
  allowSchoolTranscriptView?: boolean;
  managedOrgIds?: string[];
  permissions?: string[];
  createdAt: string;
}

export function isAskInFlightError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

export function isBackendNetworkError(error: unknown): boolean {
  if (axios.isAxiosError(error) && !error.response) return true;
  if (error instanceof TypeError) return true;
  if (error instanceof Error && /failed to fetch|network error|load failed/i.test(error.message)) {
    return true;
  }
  return false;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const serverMessage = error.response?.data?.error;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      return serverMessage;
    }
    if (error.code === 'ECONNABORTED') {
      return '请求超时，请稍后重试。';
    }
    if (!error.response) {
      return '无法连接后端。请确认已运行「一键启动.bat」或 npm run dev，并访问 http://localhost:3000/login 后刷新重试。';
    }
    if (error.response.status === 502 || error.response.status === 504) {
      return '后端未启动或正在重启。请关闭旧窗口后重新运行「一键启动.bat」，或在 PsyQA 目录执行 npm run dev。';
    }
    if (error.response.status === 503) {
      return '服务繁忙，请等待几秒后重试（上一条咨询可能仍在处理中）。';
    }
    if (error.response.status === 429) {
      return '上一条消息还在处理中，请稍候再发。';
    }
    if (error.response.status === 500) {
      return '生成回复失败，请重试；若仍失败请重启后端（端口 3001 是否被占用）。';
    }
    return '服务暂时不可用，请稍后重试。';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '发生未知错误，请稍后重试。';
}

const AUTH_API_BASE = '/api/auth';
const authApi = axios.create({
  baseURL: AUTH_API_BASE,
  timeout: 20000,
  withCredentials: true
});

authApi.interceptors.request.use((config) => {
  const t = getAuthToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});
attachBackendFallback(authApi, '/api/auth');

export async function logoutRequest(): Promise<void> {
  try {
    await authApi.post('/logout');
  } catch {
    /* cookie clear best-effort */
  }
  setAuthToken(null);
}

export async function loginRequest(username: string, password: string): Promise<{ token: string; user: AuthUserPublic }> {
  try {
    const { data } = await authApi.post('/login', { username, password });
    setAuthToken(data.token);
    return data;
  } catch (error) {
    if (shouldTryDirectBackend(error)) {
      const { data } = await axios.post(`${resolveBackendOrigin()}/api/auth/login`, { username, password }, {
        timeout: 20000,
        withCredentials: true
      });
      setAuthToken(data.token);
      return data;
    }
    throw error;
  }
}

export async function registerRequest(
  username: string,
  password: string,
  displayName?: string
): Promise<{ token: string; user: AuthUserPublic }> {
  const payload = { username, password, displayName };
  try {
    const { data } = await authApi.post('/register', payload);
    setAuthToken(data.token);
    return data;
  } catch (error) {
    if (shouldTryDirectBackend(error)) {
      const { data } = await axios.post(`${resolveBackendOrigin()}/api/auth/register`, payload, {
        timeout: 20000,
        withCredentials: true
      });
      setAuthToken(data.token);
      return data;
    }
    throw error;
  }
}

export async function fetchCurrentUser(): Promise<{ user: AuthUserPublic }> {
  const { data } = await authApi.get('/me');
  return data;
}

export async function updateStudentProfileRequest(payload: {
  className?: string;
  orgId?: string;
  displayName?: string;
  avatar?: string;
  studentNo?: string;
  realName?: string;
  gender?: string;
  allowSchoolTranscriptView?: boolean;
}): Promise<{ user: AuthUserPublic }> {
  const { data } = await authApi.patch('/profile', payload);
  return data;
}

export const AVATAR_PRESETS = ['👦', '👧', '👨', '👩', '🧑', '🙋', '😊', '🌟', '🎓', '💚', '🌈', '🐱', '🐶', '🦊', '🐼'];

export interface CollegeOption {
  id: string;
  name: string;
  schoolName: string;
}

export async function fetchCollegeOptions(): Promise<{ colleges: CollegeOption[] }> {
  const { data } = await authApi.get('/colleges');
  return data;
}

export const askQuestion = async (
  question: string,
  description?: string,
  userId?: string
): Promise<QuestionResponse & { portraitPending?: boolean }> => {
  const body: { question: string; description?: string; userId?: string } = { question, description };
  if (userId) body.userId = userId;
  const response = await api.post('/ask', body, { timeout: ASK_TIMEOUT });
  return response.data;
};

/** SSE 流式咨询（智谱/Ollama 逐字输出 + ReAct 步骤） */
export async function askQuestionStream(
  question: string,
  description: string | undefined,
  userId: string | undefined,
  handlers: {
    onToken: (text: string) => void;
    onReactStep?: (step: import('../types').ReActStep) => void;
    onDone: (payload: QuestionResponse & { portraitPending?: boolean }) => void;
    onError: (message: string, code?: string) => void;
  },
  options?: { signal?: AbortSignal }
): Promise<{ aborted: boolean }> {
  const token = getAuthToken();
  let res: Response;
  try {
    res = await fetch(resolveStreamUrl(), {
      method: 'POST',
      credentials: 'include',
      signal: options?.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        question,
        description,
        ...(userId ? { userId } : {})
      })
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { aborted: true };
    }
    handlers.onError(
      err instanceof Error && err.message ? err.message : '无法连接后端，请确认 npm run dev 已启动'
    );
    return { aborted: false };
  }

  if (!res.ok || !res.body) {
    let msg = `请求失败 (${res.status})`;
    try {
      const errJson = (await res.json()) as { error?: string };
      if (errJson.error) msg = errJson.error;
    } catch {
      /* ignore */
    }
    handlers.onError(msg);
    return { aborted: false };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (options?.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        return { aborted: true };
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim()) as {
            type?: string;
            text?: string;
            error?: string;
            code?: string;
            step?: import('../types').ReActStep;
          } & QuestionResponse;
          if (payload.type === 'token' && payload.text) {
            handlers.onToken(payload.text);
          } else if (payload.type === 'react_step' && payload.step) {
            handlers.onReactStep?.(payload.step);
          } else if (payload.type === 'error') {
            handlers.onError(payload.error || '生成失败', payload.code);
          } else if (payload.type === 'done') {
            handlers.onDone(payload as QuestionResponse & { portraitPending?: boolean });
          }
        } catch {
          /* skip malformed sse */
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { aborted: true };
    }
    throw err;
  }
  return { aborted: false };
}

export interface InsightsStatus {
  ready: boolean;
  reportPending: boolean;
  portraitPending: boolean;
  dialogTime?: string;
}

export const getInsightsStatus = async (userId: string): Promise<InsightsStatus> => {
  const response = await api.get('/insights/status', { params: { userId } });
  return response.data;
};

function isInsightsNotReady(status: InsightsStatus): boolean {
  return status.reportPending || status.portraitPending;
}

/** 画像异步生成完成后轮询进度 */
export async function pollPortraitUntilReady(
  userId: string,
  maxAttempts = 12,
  intervalMs = 2500
): Promise<UserProgress | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const status = await getInsightsStatus(userId);
      if (!status.portraitPending) {
        return getUserProgress(userId);
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** 报告与画像均就绪后返回进度（用于异步报告 + 画像） */
export async function pollInsightsUntilReady(
  userId: string,
  maxAttempts = 16,
  intervalMs = 2500
): Promise<UserProgress | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const status = await getInsightsStatus(userId);
      if (status.ready || !isInsightsNotReady(status)) {
        return getUserProgress(userId);
      }
    } catch {
      return null;
    }
  }
  return null;
}

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  count: number;
}

export const getCategories = async (): Promise<CategoryInfo[]> => {
  const response = await api.get('/categories');
  return response.data;
};

export const getUserProgress = async (userId: string = 'default_user'): Promise<UserProgress> => {
  const response = await api.get('/progress', {
    params: { userId }
  });
  return response.data;
};

export const getUserProgressText = async (userId: string = 'default_user'): Promise<{ progress: string }> => {
  const response = await api.get('/progress/text', {
    params: { userId }
  });
  return response.data;
};

export const clearUserHistory = async (userId: string = 'default_user'): Promise<{ message: string }> => {
  const response = await api.post('/history/clear', { userId });
  return response.data;
};

export const getGroupedHistory = async (userId: string): Promise<{ userId: string; groups: Record<string, GroupedHistoryItem[]> }> => {
  const response = await api.get('/history/grouped', { params: { userId } });
  return response.data;
};

export interface CarePlanSuggestion {
  categoryName: string;
  suggestion: string;
}

export interface PsychAnalyzeResponse {
  emotion: QuestionResponse['emotion'];
  risk: QuestionResponse['risk'];
  problem: QuestionResponse['problem'];
  sources: { emotion: string; risk: string; problem: string };
  llmUsed: boolean;
  llmRationale?: string;
  carePlan: CarePlanSuggestion & { category: string };
  intervention: { frameworkId: string; frameworkName: string };
  report: string;
}

export const analyzePsychText = async (
  text: string,
  tryLlm = true
): Promise<PsychAnalyzeResponse> => {
  const response = await api.post('/analyze', { text, tryLlm });
  return response.data;
};

export const submitSelfRating = async (payload: {
  userId: string;
  dialogTime?: string;
  moodRating?: number;
  stressRating?: number;
  anxietyRating?: number;
}): Promise<{
  message: string;
  statModel?: import('../types').PsychStatModel;
  report?: string;
  emotion?: import('../types').EmotionAnalysis;
  risk?: import('../types').RiskAssessment;
  problem?: import('../types').ProblemAnalysis;
}> => {
  const response = await api.post('/self-rating', payload);
  return response.data;
};

export interface UserProfilePayload {
  userId: string;
  sessionCount: number;
  feedbackCount: number;
  avgRating: number | null;
  helpfulRate: number | null;
  topConcerns: Array<{ category: string; label: string; count: number }>;
  dominantEmotion: string | null;
  dominantEmotionLabel: string | null;
  avgStressLevel: number | null;
  avgAnxietyLevel: number | null;
  recentThemes: string[];
  summary: string;
  updatedAt: string;
}

export const submitSessionFeedback = async (payload: {
  userId: string;
  dialogTime: string;
  rating?: number;
  helpful?: boolean;
  comment?: string;
}): Promise<{ message: string; profile: UserProfilePayload }> => {
  const response = await api.post('/session-feedback', payload);
  return response.data;
};

export const getUserProfile = async (
  userId: string,
  refresh = false
): Promise<UserProfilePayload> => {
  const response = await api.get('/profile', {
    params: { userId, refresh: refresh ? '1' : undefined }
  });
  return response.data;
};

export type AgentPhase = 'collect' | 'shape' | 'mature';

export interface UserStaticProfile {
  age?: number | string;
  occupation?: string;
  familyBackground?: string;
  majorLifeEvents?: string[];
  notes?: string;
}

export interface InterventionProfile {
  effectiveApproaches: string[];
  avoidPhrases: string[];
  sensitiveTopics: string[];
  preferredTone?: string;
}

export interface AgentProfilePayload {
  userId: string;
  basicJson: UserStaticProfile | null;
  emotionTimelineJson: Array<{
    month: string;
    dominantEmotions: string[];
    triggers: string[];
    notes?: string;
  }>;
  interventionJson: InterventionProfile | null;
  agentSystemPrompt: string | null;
  agentPhase: AgentPhase;
  firstDialogAt: string | null;
  monthlySummariesJson: Array<{ month: string; summary: string; createdAt: string }>;
  annualReportsJson: Array<{ year: string; report: string; createdAt: string }>;
  updatedAt: string;
  phase: AgentPhase;
  ragWeights: {
    user: number;
    public: number;
    phase: AgentPhase;
    label: string;
    monthsElapsed: number;
    memoryCount: number;
    timelineUser: number;
    memoryBoost: number;
  };
}

export const getAgentProfile = async (userId: string): Promise<AgentProfilePayload> => {
  const response = await api.get('/agent-profile', { params: { userId } });
  return response.data;
};

export const patchAgentProfile = async (payload: {
  userId: string;
  basic?: UserStaticProfile;
  intervention?: Partial<InterventionProfile>;
  agentSystemPrompt?: string;
}): Promise<{ message: string; profile: AgentProfilePayload; phase: AgentPhase; ragWeights: AgentProfilePayload['ragWeights'] }> => {
  const response = await api.patch('/agent-profile', payload);
  return response.data;
};

export interface AgentMemoryRow {
  dialogTime: string;
  chromaId: string;
  month: string;
  emotion: string | null;
  contentPreview: string | null;
  createdAt: string;
  tags?: string[];
  locked?: boolean;
  archived?: boolean;
}

export const listAgentMemories = async (userId: string): Promise<AgentMemoryRow[]> => {
  const response = await api.get('/agent-memories', { params: { userId } });
  return response.data.memories;
};

export const deleteAgentMemory = async (userId: string, dialogTime: string): Promise<void> => {
  await api.delete('/agent-memory', { data: { userId, dialogTime } });
};

export async function batchArchiveMemories(
  userId: string,
  dialogTimes: string[],
  archived = true
): Promise<void> {
  await api.post('/memory-batch-archive', { userId, dialogTimes, archived });
}

export type KnowledgeCategoryFilter =
  | 'all'
  | 'academic_stress'
  | 'interpersonal'
  | 'crisis'
  | 'emotion_regulation'
  | 'family_relationship';

export interface KnowledgeCatalogItem {
  index: number;
  question: string;
  answer: string;
  categoryLabels: string[];
  tags?: { problems: string[]; emotions: string[] };
}

export async function fetchKnowledgeItems(params: {
  category?: KnowledgeCategoryFilter;
  q?: string;
  page?: number;
}): Promise<{ total: number; page: number; pageSize: number; items: KnowledgeCatalogItem[] }> {
  const { data } = await api.get('/admin/knowledge-items', { params });
  return data;
}

export async function createKnowledgeItem(body: {
  question: string;
  answer: string;
  category: KnowledgeCategoryFilter;
}): Promise<void> {
  await api.post('/admin/knowledge-items', body);
}

export async function fetchKnowledgeUpdateStatus(): Promise<{
  live: { knowledgeBaseCount: number; vectorDbCount: number };
}> {
  const { data } = await api.get('/admin/knowledge-status');
  return data;
}

export async function submitKnowledgeReview(body: {
  question: string;
  answerPreview: string;
  verdict: 'correct' | 'incorrect' | 'partial';
  comment?: string;
}): Promise<void> {
  await schoolApi.post('/knowledge-reviews', body);
}

export async function downloadAgentProfileExport(userId: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(
    `${typeof window !== 'undefined' ? '' : resolveBackendOrigin()}/api/questions/agent-profile/export?userId=${encodeURIComponent(userId)}`,
    {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  );
  if (!res.ok) throw new Error(`导出失败 (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `psyqa-agent-${userId}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const schoolApi = axios.create({
  baseURL: '/api/school',
  timeout: 20000,
  withCredentials: true
});

schoolApi.interceptors.request.use((config) => {
  const t = getAuthToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});
attachBackendFallback(schoolApi, '/api/school');

export interface SchoolDashboardStats {
  totalConsultations: number;
  activeStudents: number;
  highRiskDialogCount?: number;
  highRiskCount: number;
  highRiskStudentCount?: number;
  pendingAlerts: number;
  problemTop3: Array<{ category: string; count: number; share: number }>;
  emotionTop3: Array<{ emotion: string; count: number; share: number }>;
  avgStress: number;
  recentStudents?: Array<{
    id: string;
    displayName: string;
    lastConsultTime?: string;
    lastRisk?: string;
    pendingAlerts: number;
  }>;
}

export interface SchoolStudentItem {
  id: string;
  displayName: string;
  realName?: string;
  gender?: string;
  genderLabel?: string;
  maskName: string;
  username?: string;
  studentNo?: string;
  avatar?: string;
  orgId: string;
  orgName?: string;
  schoolName?: string;
  className?: string;
  lastConsultTime?: string;
  lastEmotion?: string;
  lastEmotionLabel?: string;
  lastRisk?: string;
  lastRiskLabel?: string;
  lastProblem?: string;
  lastProblemLabel?: string;
  lastStressLevel?: number;
  lastAnxietyLevel?: number;
  lastMoodStability?: number;
  consultCount: number;
  pendingAlerts: number;
  createdAt?: string;
  allowSchoolTranscriptView?: boolean;
  transcriptMasked?: boolean;
}

export interface SchoolStudentDialog {
  time: string;
  user: string;
  bot: string;
  summary: string;
  report?: string;
  psych?: {
    emotion: string;
    emotionLabel: string;
    risk: string;
    riskLabel: string;
    problem: string;
    problemLabel: string;
    confidence: number;
    stressLevel: number;
    anxietyLevel: number;
    moodStability: number;
    frameworkId?: string;
  };
  portrait?: {
    summary: string;
    emotionalPresentation: string;
    coreConcerns: string[];
    observedPatterns: string[];
    strengths: string[];
    supportNeeds: string[];
    recommendedFocus: string;
    llmUsed: boolean;
  };
}

export interface SchoolStudentDetail {
  profile: SchoolStudentItem;
  dialogs: SchoolStudentDialog[];
  alerts: SchoolAlertItem[];
}

export interface SchoolAlertItem {
  id: string;
  studentId: string;
  studentMask: string;
  studentDisplayName?: string;
  studentNo?: string;
  className?: string;
  orgId: string;
  orgName?: string;
  level: 'critical' | 'high' | 'medium';
  tier?: 1 | 2 | 3;
  slaHours?: number;
  slaDueAt?: string;
  source: string;
  summary: string;
  riskKeywords: string[];
  dialogId: string;
  dialogTime: string;
  status: string;
  isFalsePositive?: boolean;
  assignee?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchSchoolDashboard(): Promise<SchoolDashboardStats> {
  const { data } = await schoolApi.get('/dashboard');
  return data;
}

export async function fetchSchoolStudents(): Promise<{ students: SchoolStudentItem[] }> {
  const { data } = await schoolApi.get('/students');
  return data;
}

export async function fetchSchoolStudentDetail(studentId: string): Promise<SchoolStudentDetail> {
  const { data } = await schoolApi.get(`/students/${encodeURIComponent(studentId)}`);
  return data;
}

export async function fetchSchoolAlerts(params?: {
  status?: string;
  level?: string;
  tier?: string;
  from?: string;
  to?: string;
}): Promise<{ count: number; alerts: SchoolAlertItem[] }> {
  const { data } = await schoolApi.get('/alerts', { params: params ?? {} });
  return data;
}

export async function patchSchoolAlert(
  alertId: string,
  payload: {
    status?: string;
    assignee?: string;
    notes?: string;
    isFalsePositive?: boolean;
  }
): Promise<{ message: string; alert: SchoolAlertItem }> {
  const { data } = await schoolApi.patch(`/alerts/${encodeURIComponent(alertId)}`, payload);
  return data;
}

export interface AdminUserItem {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  orgId?: string;
  orgName?: string;
  className?: string;
  studentNo?: string;
  realName?: string;
  gender?: string;
  managedOrgIds?: string[];
  allowSchoolTranscriptView?: boolean;
  createdAt: string;
}

export async function fetchAdminUsers(): Promise<{ count: number; users: AdminUserItem[] }> {
  const { data } = await schoolApi.get('/admin/users');
  return data;
}

export async function createAdminUser(payload: {
  username: string;
  password: string;
  displayName?: string;
  role: UserRole;
  orgId?: string;
  managedOrgIds?: string[];
  className?: string;
  studentNo?: string;
  realName?: string;
  gender?: string;
  allowSchoolTranscriptView?: boolean;
}): Promise<{ message: string; user: AdminUserItem }> {
  const { data } = await schoolApi.post('/admin/users', payload);
  return data;
}

export async function patchAdminUser(
  userId: string,
  payload: {
    displayName?: string;
    role?: UserRole;
    orgId?: string;
    className?: string;
    studentNo?: string;
    managedOrgIds?: string[];
    allowSchoolTranscriptView?: boolean;
    realName?: string;
    gender?: string;
    newPassword?: string;
  }
): Promise<{ message: string; user: AdminUserItem }> {
  const { data } = await schoolApi.patch(`/admin/users/${encodeURIComponent(userId)}`, payload);
  return data;
}

export async function downloadSchoolReport(format: 'json' | 'csv' = 'csv'): Promise<void> {
  const response = await schoolApi.get('/admin/report', {
    params: { format },
    responseType: format === 'csv' ? 'blob' : 'json'
  });
  if (format === 'csv') {
    const blob = response.data as Blob;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `全校心理报表_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }
  const json = JSON.stringify(response.data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `全校心理报表_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadSchoolMonthlyLedger(month?: string): Promise<void> {
  const m = month || new Date().toISOString().slice(0, 7);
  const response = await schoolApi.get('/admin/report/monthly-ledger', {
    params: { month: m, format: 'xlsx' },
    responseType: 'blob'
  });
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `psyqa-monthly-ledger-${m}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface SchoolNotificationItem {
  id: string;
  type: 'tier1_alert';
  alertId: string;
  studentMask: string;
  summary: string;
  orgId: string;
  tier: 1;
  createdAt: string;
}

export async function fetchSchoolNotifications(): Promise<{ notifications: SchoolNotificationItem[] }> {
  const { data } = await schoolApi.get('/notifications');
  return data;
}

export async function markSchoolNotificationsRead(ids: string[]): Promise<void> {
  await schoolApi.post('/notifications/read', { ids });
}

export interface TranscriptViewRequest {
  id: string;
  studentId: string;
  counselorId: string;
  counselorName: string;
  orgId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
}

export async function postCounselorTranscriptRequest(
  studentId: string,
  reason?: string
): Promise<{ message: string; request: TranscriptViewRequest }> {
  const { data } = await schoolApi.post('/transcript-requests', { studentId, reason });
  return data;
}

export async function fetchCounselorTranscriptRequests(): Promise<{ requests: TranscriptViewRequest[] }> {
  const { data } = await schoolApi.get('/transcript-requests');
  return data;
}

export async function fetchStudentTranscriptRequests(
  userId: string
): Promise<{ requests: TranscriptViewRequest[] }> {
  const { data } = await api.get('/transcript-requests', { params: { userId } });
  return data;
}

export async function resolveStudentTranscriptRequest(
  userId: string,
  requestId: string,
  approve: boolean
): Promise<{ message: string; request: TranscriptViewRequest }> {
  const { data } = await api.post('/transcript-requests/resolve', { userId, requestId, approve });
  return data;
}

// —— 创新功能 API ——

export interface EmotionRhythmPayload {
  month: string;
  days: Array<{ date: string; level: string; score: number; ewma: number; sessions: number }>;
  periodicDips: Array<{ label: string; description: string; carePlan: string }>;
  summary: string;
}

export async function fetchEmotionRhythm(userId: string, month?: string): Promise<EmotionRhythmPayload> {
  const { data } = await api.get('/emotion-rhythm', { params: { userId, month } });
  return data;
}

export interface CbtMicroModule {
  id: string;
  title: string;
  topic: string;
  framework: string;
  steps: Array<{
    scenario: string;
    thought: string;
    choices: Array<{ id: string; text: string; isAdaptive: boolean; feedback: string }>;
  }>;
}

export async function fetchCbtModule(problem?: string, emotion?: string): Promise<{ module: CbtMicroModule }> {
  const { data } = await api.get('/cbt-module', { params: { problem, emotion } });
  return data;
}

export async function submitCbtComplete(body: {
  problem?: string;
  emotion?: string;
  selections: Record<number, string>;
}): Promise<{ score: number; message: string }> {
  const { data } = await api.post('/cbt-complete', body);
  return data;
}

export interface MemoryTagEntry {
  dialogTime: string;
  tags: string[];
  locked: boolean;
  archived: boolean;
}

export async function fetchMemoryTags(userId: string, tag?: string): Promise<{ memories: MemoryTagEntry[] }> {
  const { data } = await api.get('/memory-tags', { params: { userId, tag } });
  return data;
}

export async function patchMemoryTag(
  userId: string,
  dialogTime: string,
  patch: { locked?: boolean; archived?: boolean; tags?: string[] }
): Promise<void> {
  await api.patch('/memory-tag', { userId, dialogTime, ...patch });
}

export interface HeatmapCell {
  orgId: string;
  className: string;
  studentCount: number;
  consultCount: number;
  highRiskCount: number;
  pendingAlerts: number;
  avgStress: number;
  heatLevel: 'low' | 'medium' | 'high' | 'critical';
  topIssue?: string;
}

export async function fetchSchoolHeatmap(month?: string): Promise<{
  month: string;
  cells: HeatmapCell[];
  groupInsight: string;
}> {
  const { data } = await schoolApi.get('/heatmap', { params: { month } });
  return data;
}

export interface InterventionRecord {
  id: string;
  alertId: string;
  studentMask: string;
  tier: number;
  slaDueAt: string;
  status: string;
  meetingNotes: string[];
}

export async function fetchInterventionLedgers(): Promise<{
  records: InterventionRecord[];
  overdue: InterventionRecord[];
}> {
  const { data } = await schoolApi.get('/intervention-ledgers');
  return data;
}

export async function patchInterventionLedger(
  id: string,
  patch: Partial<{ status: string; meetingNotes: string[]; measures: string[]; nextFollowUpAt: string }>
): Promise<void> {
  await schoolApi.patch(`/intervention-ledgers/${encodeURIComponent(id)}`, patch);
}

export async function batchTranscriptRequest(studentIds: string[], reason?: string): Promise<{ message: string }> {
  const { data } = await schoolApi.post('/transcript-requests/batch', { studentIds, reason });
  return data;
}

export async function batchResolveTranscript(
  userId: string,
  requestIds: string[],
  approve: boolean
): Promise<{ message: string; count: number }> {
  const { data } = await api.post('/transcript-requests/batch-resolve', { userId, requestIds, approve });
  return data;
}