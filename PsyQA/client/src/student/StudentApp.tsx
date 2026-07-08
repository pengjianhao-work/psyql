import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Message, QuestionResponse } from '../types';
import {
  askQuestion,
  askQuestionStream,
  getCategories,
  getUserProgress,
  clearUserHistory,
  CategoryInfo,
  getErrorMessage,
  isAskInFlightError,
  isBackendNetworkError,
  getGroupedHistory,
  getInsightsStatus,
  pollInsightsUntilReady,
  getUserProfile,
  UserProfilePayload,
  AuthUserPublic,
  fetchStudentTranscriptRequests,
  batchResolveTranscript,
  fetchCbtModule,
  CbtMicroModule,
  TranscriptViewRequest
} from '../api';
import { Sidebar } from '../components/Sidebar';
import { ChatContainer } from '../components/ChatContainer';
import { recordResponseTimeMs, computeDynamicWaitSec } from '../utils/responseTimeEstimate';
import { checkSensitiveInput, shouldConfirmSensitiveSend } from '../utils/sensitiveInputCheck';
import { shouldShowTrendCareAlert } from '../utils/trendCareAlert';
import { TrendCareAlertModal } from '../components/TrendCareAlertModal';
import { InsightsPanelShell } from '../components/InsightsPanelShell';
import { EmotionRhythmCalendar } from '../components/EmotionRhythmCalendar';
import { CbtMicroModuleModal } from '../components/CbtMicroModuleModal';
import { TrendChart } from '../components/TrendChart';
import { ReportPanel } from '../components/ReportPanel';
import { PortraitHistoryList, ConversationPortraitPanel } from '../components/ConversationPortraitPanel';
import { UserProfile, UserSelector } from '../components/UserSelector';
import { SelfRatingPanel } from '../components/SelfRatingPanel';
import { SessionFeedbackPanel } from '../components/SessionFeedbackPanel';
import { UserProfileCard } from '../components/UserProfileCard';
import { AgentProfileCard } from '../components/AgentProfileCard';
import { StudentProfileCard } from '../components/StudentProfileCard';
import { PrivacyEthicsModal, ethicsStorageKey, reportEthicsSessionKey } from '../components/PrivacyEthicsModal';
import {
  formatStudentIdentityLine,
  getStudentProfileCompleteness
} from '../utils/profileCompleteness';
import { StudentStatusBar } from '../components/StudentStatusBar';
import { GuestModeBanner } from '../components/GuestModeBanner';
import { CrisisSupportBanner } from '../components/CrisisSupportBanner';
import { ExportMenu, ExportFormat } from '../components/ExportMenu';
import { ToastStack } from '../components/Toast';
import { RuntimeStatusBar } from '../components/RuntimeStatusBar';
import { BackendOfflineBanner } from '../components/BackendOfflineBanner';
import { BrandSchoolChip } from '../components/BrandSchoolChip';
import { profilesStorageKey } from '../userStorage';
import { restoreSessionSummary } from '../utils/chatHistory';
import { MicroTrainingPanel } from '../components/MicroTrainingPanel';
import { CATEGORY_PROMPT_MAP, DEFAULT_GUEST_USERS, DEMO_QUESTIONS } from './constants';
import { createWelcomeMessage, profilesToRecord, progressToTrendData } from './studentHelpers';
import { useToast } from './hooks/useToast';
import { useBackendHealth } from './hooks/useBackendHealth';
import { useStudentSession } from './hooks/useStudentSession';
import '../App.css';

export interface StudentAppProps {
  sessionUser: AuthUserPublic | null;
  guestMode: boolean;
  onLogout: () => void;
  onSessionUserUpdate?: (user: AuthUserPublic) => void;
}

function StudentApp({ sessionUser, guestMode, onLogout, onSessionUserUpdate }: StudentAppProps) {
  const { toasts, pushToast, dismissToast } = useToast();
  const {
    backendOnline,
    runtimeHealth,
    estimatedWaitSec,
    setEstimatedWaitSec,
    checkBackendOnline
  } = useBackendHealth();
  const {
    messages,
    setMessages,
    trendData,
    setTrendData,
    groupedHistory,
    setGroupedHistory,
    latestReport,
    setLatestReport,
    lastDialogTime,
    setLastDialogTime,
    historyLoading,
    portraitPending,
    setPortraitPending,
    reportPending,
    setReportPending,
    loadSessionFromServer,
    refreshProgressAndHistory
  } = useStudentSession(pushToast);

  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [currentUserId, setCurrentUserId] = useState('');
  const [cbtModule, setCbtModule] = useState<CbtMicroModule | null>(null);
  const [showSelfRating, setShowSelfRating] = useState(false);
  const [showSessionFeedback, setShowSessionFeedback] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfilePayload | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [ethicsLoginOpen, setEthicsLoginOpen] = useState(false);
  const [reportEthicsOpen, setReportEthicsOpen] = useState(false);
  const [reportEthicsOk, setReportEthicsOk] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [insightsRefreshing, setInsightsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [trendCareOpen, setTrendCareOpen] = useState(false);
  const [trendCareReason, setTrendCareReason] = useState('');
  const sendLockRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamPausedRef = useRef(false);
  const streamTokenBufferRef = useRef('');
  const [streamPaused, setStreamPaused] = useState(false);
  const [pendingTranscriptRequests, setPendingTranscriptRequests] = useState<TranscriptViewRequest[]>([]);
  const refreshInsightsRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const filteredQuickPrompts = useMemo(() => {
    if (!activeCategory) return DEMO_QUESTIONS;
    const list = CATEGORY_PROMPT_MAP[activeCategory];
    return list?.length ? list : DEMO_QUESTIONS;
  }, [activeCategory]);

  const portraitHistoryItems = useMemo(() => {
    const rows: Array<{ time: string; summary: string; llmUsed?: boolean; group?: string }> = [];
    Object.entries(groupedHistory).forEach(([group, items]) => {
      items.forEach((item) => {
        if (item.portrait?.summary) {
          rows.push({
            time: item.time,
            summary: item.portrait.summary,
            llmUsed: item.portrait.llmUsed,
            group
          });
        }
      });
    });
    return rows.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6);
  }, [groupedHistory]);

  const storageNamespace = guestMode ? 'guest' : sessionUser?.id ?? '';
  const guestFallback = useMemo(() => DEFAULT_GUEST_USERS, []);
  const accountFallback = useMemo(
    () =>
      sessionUser
        ? [{ id: sessionUser.id, name: sessionUser.displayName, avatar: sessionUser.avatar }]
        : [],
    [sessionUser]
  );
  const rosterFallbackDefaults = guestMode ? guestFallback : accountFallback;
  const isAccountStudent = !guestMode && !!sessionUser;

  const handleSessionUserUpdate = useCallback(
    (user: AuthUserPublic) => {
      onSessionUserUpdate?.(user);
      setUserProfiles((prev) => ({
        ...prev,
        [user.id]: { id: user.id, name: user.displayName, avatar: user.avatar }
      }));
    },
    [onSessionUserUpdate]
  );

  const syncRoster = useCallback((list: UserProfile[]) => {
    if (!list.length || isAccountStudent) return;
    setUserProfiles(profilesToRecord(list));
    setCurrentUserId((prev) => (prev && list.some((u) => u.id === prev) ? prev : list[0].id));
  }, [isAccountStudent]);

  useEffect(() => {
    if (guestMode) {
      const key = profilesStorageKey('guest');
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(DEFAULT_GUEST_USERS));
      }
      setUserProfiles(profilesToRecord(DEFAULT_GUEST_USERS));
      setCurrentUserId('user1');
      setLatestReport(null);
      return;
    }
    if (sessionUser) {
      const roster = [{ id: sessionUser.id, name: sessionUser.displayName, avatar: sessionUser.avatar }];
      setUserProfiles(profilesToRecord(roster));
      setCurrentUserId(sessionUser.id);
    }
  }, [guestMode, sessionUser, setLatestReport]);

  useEffect(() => {
    if (!storageNamespace) return;
    const accepted = localStorage.getItem(ethicsStorageKey(storageNamespace)) === '1';
    setEthicsLoginOpen(!accepted);
  }, [storageNamespace]);

  useEffect(() => {
    if (!latestReport) {
      setReportEthicsOk(false);
      return;
    }
    const ok = sessionStorage.getItem(reportEthicsSessionKey) === '1';
    setReportEthicsOk(ok);
    setReportEthicsOpen(!ok);
  }, [latestReport]);

  const handleLogoutAccount = useCallback(() => {
    onLogout();
  }, [onLogout]);

  useEffect(() => {
    if (!currentUserId || guestMode) {
      setPendingTranscriptRequests([]);
      return;
    }
    void fetchStudentTranscriptRequests(currentUserId)
      .then((r) => setPendingTranscriptRequests(r.requests.filter((x) => x.status === 'pending')))
      .catch(() => setPendingTranscriptRequests([]));
  }, [currentUserId, guestMode]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }
    const fetchCategories = async () => {
      const maxAttempts = 5;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const cats = await getCategories();
          setCategories(cats);
          return;
        } catch (error) {
          if (attempt === maxAttempts) {
            console.error('Failed to fetch categories:', error);
            setMessages((prev) => [
              ...prev,
              {
                id: `sys-${Date.now()}`,
                type: 'bot',
                content: `分类加载失败：${getErrorMessage(error)}`,
                timestamp: new Date().toLocaleString('zh-CN')
              }
            ]);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, attempt * 600));
        }
      }
    };
    fetchCategories();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }
    loadSessionFromServer(currentUserId);
    setShowSelfRating(false);
  }, [currentUserId, loadSessionFromServer]);

  const loadUserProfileFromServer = useCallback(async (userId: string, refresh = false) => {
    setProfileLoading(true);
    try {
      const profile = await getUserProfile(userId, refresh);
      setUserProfile(profile);
    } catch {
      /* keep previous profile on failure */
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setUserProfile(null);
      return;
    }
    void loadUserProfileFromServer(currentUserId);
  }, [currentUserId, loadUserProfileFromServer]);

  const handleValidateBeforeSend = useCallback(
    (question: string) => {
      const check = checkSensitiveInput(question);
      if (check.level === 'medium') {
        pushToast(check.message, 'info');
        return true;
      }
      if (shouldConfirmSensitiveSend(check)) {
        return window.confirm(`${check.message}\n\n匹配词：${check.keywords.join('、')}`);
      }
      return true;
    },
    [pushToast]
  );

  const handleStopGenerate = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    streamPausedRef.current = false;
    streamTokenBufferRef.current = '';
    setStreamPaused(false);
    setIsGenerating(false);
    setIsLoading(false);
    sendLockRef.current = false;
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming
          ? {
              ...m,
              streaming: false,
              aborted: true,
              content: m.content.trim() || '（已停止生成，可修改问题后重新发送）'
            }
          : m
      )
    );
    pushToast('已停止生成', 'info');
  }, [pushToast]);

  const handlePauseGenerate = useCallback(() => {
    streamPausedRef.current = true;
    setStreamPaused(true);
  }, []);

  const handleResumeGenerate = useCallback(() => {
    streamPausedRef.current = false;
    setStreamPaused(false);
    const buffered = streamTokenBufferRef.current;
    if (!buffered) return;
    streamTokenBufferRef.current = '';
    setMessages((prev) => {
      const bot = [...prev].reverse().find((m) => m.streaming);
      if (!bot) return prev;
      return prev.map((m) =>
        m.id === bot.id ? { ...m, content: `${m.content}${buffered}` } : m
      );
    });
  }, []);

  const handleSend = useCallback(async (question: string, description: string) => {
    if (sendLockRef.current || historyLoading) {
      pushToast('正在回复上一条消息，请稍候', 'info');
      return;
    }
    if (backendOnline === false) {
      pushToast('后端未连接，请先启动系统', 'warning', {
        label: '检测',
        onClick: () => void checkBackendOnline()
      });
      return;
    }
    sendLockRef.current = true;
    setIsLoading(true);
    setIsGenerating(true);
    streamPausedRef.current = false;
    streamTokenBufferRef.current = '';
    setStreamPaused(false);
    const requestStart = Date.now();
    streamAbortRef.current = new AbortController();

    setEstimatedWaitSec(
      computeDynamicWaitSec({
        fastAnswer: runtimeHealth?.fastAnswer,
        llmAvailable: runtimeHealth?.llmAvailable,
        llmMode: runtimeHealth?.llmMode,
        knowledgeCount: runtimeHealth?.knowledge?.knowledgeCount,
        activeAskRequests: runtimeHealth?.load?.activeAskRequests,
        maxAskRequests: runtimeHealth?.load?.maxAskRequests
      })
    );

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), type: 'user', content: question, timestamp: new Date().toLocaleString('zh-CN') }
    ]);

    try {
      const botId = (Date.now() + 1).toString();
      const botTime = new Date().toLocaleString('zh-CN');
      let response: QuestionResponse | null = null;
      let streamOk = false;

      const { aborted } = await askQuestionStream(question, description, currentUserId, {
        onToken: (text) => {
          if (streamPausedRef.current) {
            streamTokenBufferRef.current += text;
            return;
          }
          streamOk = true;
          setIsLoading(false);
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === botId);
            if (!existing) {
              return [
                ...prev,
                {
                  id: botId,
                  type: 'bot',
                  content: text,
                  timestamp: botTime,
                  streaming: true,
                  reactTrace: []
                }
              ];
            }
            return prev.map((m) =>
              m.id === botId ? { ...m, content: `${m.content}${text}`, streaming: true } : m
            );
          });
        },
        onReactStep: (step) => {
          setIsLoading(false);
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === botId);
            const trace = existing?.reactTrace ?? [];
            const nextTrace = [...trace.filter((s) => s.step !== step.step), step].sort(
              (a, b) => a.step - b.step
            );
            if (!existing) {
              return [
                ...prev,
                {
                  id: botId,
                  type: 'bot',
                  content: '',
                  timestamp: botTime,
                  streaming: true,
                  reactTrace: nextTrace
                }
              ];
            }
            return prev.map((m) =>
              m.id === botId ? { ...m, reactTrace: nextTrace, streaming: true } : m
            );
          });
        },
        onDone: (payload) => {
          response = payload;
        },
        onError: (msg, code) => {
          const labels: Record<string, string> = {
            llm_error: 'LLM 推理异常',
            kb_empty: '知识库无匹配',
            retrieval_miss: '检索未命中'
          };
          const label = code ? labels[code] || code : '';
          pushToast(label ? `${label}：${msg}` : msg, 'warning');
        }
      }, { signal: streamAbortRef.current.signal });

      if (aborted) {
        return;
      }

      if (!response) {
        setMessages((prev) => prev.filter((m) => m.id !== botId));
        response = await askQuestion(question, description, currentUserId);
      } else if (!streamOk) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  content: response!.answer,
                  knowledgeSources: response!.knowledgeSources,
                  similarQuestions: response!.similarQuestions,
                  emotion: response!.emotion,
                  risk: response!.risk,
                  problem: response!.problem,
                  emotionStyle: response!.emotionStyle,
                  report: response!.report,
                  llmUsed: response!.llmUsed,
                  reactUsed: response!.reactUsed,
                  reactMode: response!.reactMode,
                  reactTrace: response!.reactTrace ?? [],
                  generationHint: response!.generationHint,
                  briefReport: response!.briefReport,
                  streaming: false
                }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  content: response!.answer,
                  knowledgeSources: response!.knowledgeSources,
                  similarQuestions: response!.similarQuestions,
                  emotion: response!.emotion,
                  risk: response!.risk,
                  problem: response!.problem,
                  emotionStyle: response!.emotionStyle,
                  report: response!.report,
                  llmUsed: response!.llmUsed,
                  reactUsed: response!.reactUsed,
                  reactMode: response!.reactMode,
                  reactTrace: response!.reactTrace ?? [],
                  generationHint: response!.generationHint,
                  briefReport: response!.briefReport,
                  streaming: false
                }
              : m
          )
        );
      }

      const finalResponse = response!;

      if (finalResponse.briefReport) {
        setLatestReport((prev) =>
          prev
            ? { ...prev, report: finalResponse.briefReport || prev.report }
            : {
                emotion: finalResponse.emotion,
                risk: finalResponse.risk,
                problem: finalResponse.problem,
                emotionStyle: finalResponse.emotionStyle,
                intervention: finalResponse.intervention,
                carePlan: finalResponse.carePlan,
                analysisSources: finalResponse.analysisSources,
                llmUsed: finalResponse.llmUsed,
                report: finalResponse.briefReport || finalResponse.report,
                statModel: finalResponse.statModel,
                portrait: finalResponse.portrait
              }
        );
      }

      try {
        const progress = await refreshProgressAndHistory(currentUserId);
        if (progress) {
          const trend = shouldShowTrendCareAlert(progress);
          if (trend.show) {
            setTrendCareReason(trend.reason);
            setTrendCareOpen(true);
          }
        }
      } catch {
        /* ignore */
      }

      recordResponseTimeMs(Date.now() - requestStart);
      setLatestReport({
        emotion: finalResponse.emotion,
        risk: finalResponse.risk,
        problem: finalResponse.problem,
        emotionStyle: finalResponse.emotionStyle,
        intervention: finalResponse.intervention,
        carePlan: finalResponse.carePlan,
        analysisSources: finalResponse.analysisSources,
        llmUsed: finalResponse.llmUsed,
        report: finalResponse.report,
        statModel: finalResponse.statModel,
        portrait: finalResponse.portrait,
        implicitNeeds: finalResponse.implicitNeeds
      });
      setLastDialogTime(finalResponse.dialogId || botTime);
      setShowSelfRating(true);
      setShowSessionFeedback(true);
      setInsightsOpen(false);
      setPortraitPending(Boolean(finalResponse.portraitPending));
      setReportPending(Boolean(finalResponse.reportPending));
      if (finalResponse.reportPending || finalResponse.portraitPending) {
        pushToast('回复已生成；详细报告与画像正在后台生成', 'info', {
          label: '查看报告',
          onClick: () => {
            if (!reportEthicsOk) {
              setReportEthicsOpen(true);
            } else {
              setInsightsOpen(true);
            }
          }
        });
      }

      if (!streamOk) {
        setMessages((prev) => [
          ...prev,
          {
            id: botId,
            type: 'bot',
            content: finalResponse.answer,
            knowledgeSources: finalResponse.knowledgeSources,
            similarQuestions: finalResponse.similarQuestions,
            emotion: finalResponse.emotion,
            risk: finalResponse.risk,
            problem: finalResponse.problem,
            emotionStyle: finalResponse.emotionStyle,
            report: finalResponse.report,
            llmUsed: finalResponse.llmUsed,
            timestamp: botTime
          }
        ]);
      }

      void loadUserProfileFromServer(currentUserId, true);

      if ((finalResponse.reportPending || finalResponse.portraitPending) && currentUserId) {
        void pollInsightsUntilReady(currentUserId).then((progress) => {
          if (!progress) {
            pushToast('报告生成超时，可点击状态栏「刷新报告与趋势」重试', 'warning', {
              label: '刷新',
              onClick: () => void refreshInsightsRef.current?.()
            });
            return;
          }
          setPortraitPending(false);
          setReportPending(false);
          pushToast('报告与画像已更新', 'success', {
            label: '展开查看',
            onClick: () => {
              if (!reportEthicsOk) setReportEthicsOpen(true);
              else setInsightsOpen(true);
            }
          });
          void getGroupedHistory(currentUserId).then((g) => {
            const groups = g.groups || {};
            setGroupedHistory(groups);
            const restored = restoreSessionSummary(progress, groups);
            if (restored.latestReport) {
              setLatestReport(restored.latestReport);
            }
          });
        });
      }

      if (finalResponse.risk.level === 'high' || finalResponse.risk.level === 'critical') {
        setMessages((prev) => [
          ...prev,
          {
            id: `followup-${Date.now()}`,
            type: 'bot',
            content: '我想继续确认你的状态：你现在身边有可以立即联系的人吗？如果愿意，我可以帮你做一份 3 步安全行动清单。',
            timestamp: new Date().toLocaleString('zh-CN')
          }
        ]);
      }
    } catch (error) {
      console.error('Error sending question:', error);
      if (isAskInFlightError(error)) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.type === 'user' && last.content === question) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        pushToast('上一条消息还在处理中，请稍候再试', 'info');
      } else if (isBackendNetworkError(error)) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.type === 'user' && last.content === question) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        pushToast(
          '无法连接后端。请确认已运行「一键启动.bat」，或重启 npm run dev 后重试',
          'warning',
          { label: '重试', onClick: () => void handleSend(question, description) }
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            type: 'bot',
            content: `抱歉，我暂时无法回答您的问题：${getErrorMessage(error)}`,
            timestamp: new Date().toLocaleString('zh-CN')
          }
        ]);
      }
    } finally {
      sendLockRef.current = false;
      streamAbortRef.current = null;
      setIsLoading(false);
      setIsGenerating(false);
    }
  }, [
    historyLoading,
    backendOnline,
    currentUserId,
    pushToast,
    checkBackendOnline,
    reportEthicsOk,
    loadUserProfileFromServer,
    runtimeHealth,
    refreshProgressAndHistory
  ]);

  const handleSimilarQuestionClick = (question: string) => {
    handleSend(question, '');
  };

  const handleUserChange = (userId: string) => {
    setCurrentUserId(userId);
  };

  const handleNewUser = (user: UserProfile) => {
    setUserProfiles((prev) => ({
      ...prev,
      [user.id]: user
    }));
    setCurrentUserId(user.id);
  };

  const handleClearHistory = async () => {
    if (
      !window.confirm(
        '将清空本账号全部对话、报告与趋势记录，且不可恢复。建议先使用「导出」备份。确定继续？'
      )
    ) {
      return;
    }
    try {
      await clearUserHistory(currentUserId);
      setMessages([createWelcomeMessage()]);
      setTrendData([]);
      setGroupedHistory({});
      setLatestReport(null);
      setLastDialogTime(undefined);
      setUserProfile(null);
      setShowSelfRating(false);
      setShowSessionFeedback(false);
    } catch (error) {
      console.error('Failed to clear history:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `clear-${Date.now()}`,
          type: 'bot',
          content: `清空历史失败：${getErrorMessage(error)}`,
          timestamp: new Date().toLocaleString('zh-CN')
        }
      ]);
    }
  };

  const refreshInsights = useCallback(async () => {
    if (!currentUserId) return;
    setInsightsRefreshing(true);
    try {
      let status = await getInsightsStatus(currentUserId);
      if (!status.ready && (status.reportPending || status.portraitPending)) {
        const polled = await pollInsightsUntilReady(currentUserId, 10, 2000);
        if (polled) status = await getInsightsStatus(currentUserId);
      }
      const [progress, grouped] = await Promise.all([
        getUserProgress(currentUserId),
        getGroupedHistory(currentUserId)
      ]);
      setTrendData(progressToTrendData(progress));
      setGroupedHistory(grouped.groups || {});
      const restored = restoreSessionSummary(progress, grouped.groups || {});
      if (restored.latestReport) setLatestReport(restored.latestReport);
      setPortraitPending(status.portraitPending);
      setReportPending(status.reportPending);
      if (status.ready) {
        pushToast('报告与趋势已更新', 'success');
      } else if (status.reportPending || status.portraitPending) {
        pushToast('仍在生成中，请稍后再点刷新', 'warning');
      }
    } catch (error) {
      pushToast(`刷新失败：${getErrorMessage(error)}`, 'warning');
    } finally {
      setInsightsRefreshing(false);
    }
  }, [currentUserId, pushToast]);

  refreshInsightsRef.current = refreshInsights;

  const handleExportHistory = (mode: ExportFormat) => {
    const historyText = messages.map((m) => {
      return `${m.type === 'user' ? '用户' : '助手'} [${m.timestamp}]:\n${m.content}\n`;
    }).join('\n---\n\n');
    const groupedDigest = Object.entries(groupedHistory)
      .map(([group, items]) => `${group}：${items.length}条`)
      .join('\n');
    const reportText = [
      `用户：${currentUserLabel}`,
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      `会话分组：\n${groupedDigest || '暂无'}`,
      latestReport?.report ? `\n【最新心理咨询报告】\n${latestReport.report}\n` : '',
      `\n对话记录：\n${historyText}`
    ]
      .filter(Boolean)
      .join('\n\n');

    let content = historyText;
    let fileType = 'text/plain;charset=utf-8';
    let ext = 'txt';
    if (mode === 'json') {
      content = JSON.stringify({ userId: currentUserId, groupedHistory, messages }, null, 2);
      fileType = 'application/json;charset=utf-8';
      ext = 'json';
    } else if (mode === 'report') {
      content = reportText;
    }

    const blob = new Blob([content], { type: fileType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `对话记录_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (mode === 'print') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`<pre>${reportText.replace(/</g, '&lt;')}</pre>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
    }
  };

  const refreshTrendFromServer = useCallback(async () => {
    await refreshInsights();
  }, [refreshInsights]);

  const consultCount = trendData.length;
  const crisisLevel =
    latestReport?.risk?.level === 'critical' || latestReport?.risk?.level === 'high'
      ? latestReport.risk.level
      : null;

  const currentUser =
    userProfiles[currentUserId] ??
    (sessionUser && currentUserId === sessionUser.id
      ? { id: sessionUser.id, name: sessionUser.displayName, avatar: sessionUser.avatar }
      : undefined);

  const sessionBadge = guestMode
    ? '游客 · 仅本地'
    : sessionUser
      ? `已登录 · @${sessionUser.username}`
      : '';

  const studentIdentityLine =
    isAccountStudent && sessionUser ? formatStudentIdentityLine(sessionUser) : '';

  const profileIncomplete =
    isAccountStudent && sessionUser
      ? !getStudentProfileCompleteness(sessionUser).complete
      : false;

  const currentUserLabel = currentUser
    ? `${guestMode ? '游客 · ' : ''}${currentUser.name} ${currentUser.avatar}`
    : currentUserId || '请选择用户';

  return (
    <div className="app-container">
      <PrivacyEthicsModal
        open={ethicsLoginOpen}
        onAccept={() => {
          if (storageNamespace) {
            localStorage.setItem(ethicsStorageKey(storageNamespace), '1');
          }
          setEthicsLoginOpen(false);
        }}
      />
      {isAccountStudent && sessionUser && onSessionUserUpdate && (
        <StudentProfileCard
          modal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          user={sessionUser}
          onUserUpdate={(user) => {
            handleSessionUserUpdate(user);
            setProfileModalOpen(false);
          }}
        />
      )}
      <PrivacyEthicsModal
        open={reportEthicsOpen}
        title="查看心理分析报告 · 伦理提示"
        onAccept={() => {
          sessionStorage.setItem(reportEthicsSessionKey, '1');
          setReportEthicsOpen(false);
          setReportEthicsOk(true);
        }}
      />
      <header className="header header-campus">
        <div className="header-left">
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? '关闭侧边栏' : '打开侧边栏'}
          >
            ☰
          </button>
          <div className="brand-mark" aria-hidden="true">
            🏠
          </div>
          <div>
            <BrandSchoolChip schoolName={sessionUser?.schoolName} />
            <h1>心理港湾 · 学生端</h1>
            <p>
              {studentIdentityLine || '温暖的心灵栖息地 · 大学生心理健康陪伴与咨询'}
            </p>
          </div>
        </div>
        <div className="header-right">
          {sessionBadge && <div className="session-badge">{sessionBadge}</div>}
          {isAccountStudent && sessionUser && onSessionUserUpdate && (
            <button
              type="button"
              className="header-profile-btn"
              onClick={() => setProfileModalOpen(true)}
              title="点击编辑个人信息"
            >
              <span className="header-profile-avatar">{sessionUser.avatar}</span>
              <span className="header-profile-name">
                {sessionUser.realName || sessionUser.displayName}
              </span>
              {profileIncomplete && (
                <span className="header-profile-incomplete" title="点击完善个人资料">
                  待完善
                </span>
              )}
            </button>
          )}
          <div className="current-user">
            {isAccountStudent
              ? sessionUser?.schoolName
                ? `${sessionUser.schoolName} · 已登录`
                : '已登录'
              : `当前用户: ${currentUserLabel}`}
          </div>
          <button type="button" className="account-switch-btn" onClick={handleLogoutAccount}>
            {guestMode ? '改用账号登录' : sessionUser ? '退出登录' : '返回登录'}
          </button>
        </div>
      </header>

      <RuntimeStatusBar />
      {backendOnline === false && (
        <BackendOfflineBanner onRetry={() => void checkBackendOnline()} />
      )}
      {guestMode && <GuestModeBanner onLogin={handleLogoutAccount} />}
      {pendingTranscriptRequests.length > 0 && (
        <div className="transcript-approval-banner">
          <p>
            辅导员 <strong>{pendingTranscriptRequests[0].counselorName}</strong> 等申请查看您的对话原文
            {pendingTranscriptRequests.length > 1 ? `（共 ${pendingTranscriptRequests.length} 条）` : ''}：
            {pendingTranscriptRequests[0].reason}
          </p>
          <div className="transcript-approval-actions">
            <button
              type="button"
              className="save-care-btn small"
              onClick={() => {
                const ids = pendingTranscriptRequests.map((r) => r.id);
                void batchResolveTranscript(currentUserId, ids, true)
                  .then((r) => {
                    pushToast(r.message, 'success');
                    setPendingTranscriptRequests([]);
                  })
                  .catch((e) => pushToast(getErrorMessage(e), 'warning'));
              }}
            >
              {pendingTranscriptRequests.length > 1 ? '全部同意' : '同意授权'}
            </button>
            <button
              type="button"
              className="school-btn-secondary small"
              onClick={() => {
                const ids = pendingTranscriptRequests.map((r) => r.id);
                void batchResolveTranscript(currentUserId, ids, false)
                  .then((r) => {
                    pushToast(r.message, 'info');
                    setPendingTranscriptRequests([]);
                  })
                  .catch((e) => pushToast(getErrorMessage(e), 'warning'));
              }}
            >
              {pendingTranscriptRequests.length > 1 ? '全部拒绝' : '拒绝'}
            </button>
          </div>
        </div>
      )}
      {crisisLevel && (
        <CrisisSupportBanner
          level={crisisLevel as 'high' | 'critical'}
          hotline={latestReport?.risk?.hotline}
        />
      )}

      <main className="main-content">
        {sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="关闭侧边栏"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={`sidebar-panel ${sidebarOpen ? 'open' : ''}`}>
          {storageNamespace && guestMode ? (
          <UserSelector
            storageNamespace={storageNamespace}
            fallbackDefaults={rosterFallbackDefaults.length ? rosterFallbackDefaults : guestFallback}
            currentUserId={currentUserId}
            onUserChange={handleUserChange}
            onNewUser={handleNewUser}
            onRosterChange={syncRoster}
          />
          ) : null}
          {isAccountStudent && sessionUser && onSessionUserUpdate && (
            <StudentProfileCard user={sessionUser} onUserUpdate={handleSessionUserUpdate} />
          )}
          <Sidebar
            categories={categories}
            activeCategory={activeCategory}
            onCategorySelect={setActiveCategory}
          />
          {currentUserId && consultCount > 0 && (
            <UserProfileCard profile={userProfile} loading={profileLoading} />
          )}
          {currentUserId && (isAccountStudent || consultCount > 0) && (
            <AgentProfileCard userId={currentUserId} />
          )}
          {showSelfRating && currentUserId && (
            <SelfRatingPanel
              userId={currentUserId}
              dialogTime={lastDialogTime}
              onSaved={(payload) => {
                setShowSelfRating(false);
                if (payload.statModel || payload.report) {
                  setLatestReport((prev) =>
                    prev
                      ? {
                          ...prev,
                          ...(payload.statModel && { statModel: payload.statModel }),
                          ...(payload.report && { report: payload.report }),
                          ...(payload.emotion && { emotion: payload.emotion }),
                          ...(payload.risk && { risk: payload.risk }),
                          ...(payload.problem && { problem: payload.problem })
                        }
                      : prev
                  );
                }
                refreshTrendFromServer();
              }}
            />
          )}
          {showSessionFeedback && currentUserId && (
            <SessionFeedbackPanel
              userId={currentUserId}
              dialogTime={lastDialogTime}
              onSaved={(profile) => {
                setShowSessionFeedback(false);
                setUserProfile(profile);
              }}
              onSkip={() => setShowSessionFeedback(false)}
            />
          )}
        </aside>

        <div className="main-panel main-panel-chat-first">
          {(consultCount > 0 || latestReport) && (
            <div className="student-status-bar-wrap">
              <StudentStatusBar
                consultCount={consultCount}
                latestReport={latestReport}
                portraitPending={portraitPending}
                reportPending={reportPending}
                onRefreshInsights={currentUserId ? refreshInsights : undefined}
                refreshing={insightsRefreshing}
              />
            </div>
          )}

          <MicroTrainingPanel userId={currentUserId} />

          <div className="chat-section">
            <ChatContainer
              messages={messages}
              isLoading={isLoading}
              isGenerating={isGenerating}
              initializing={historyLoading}
              estimatedWaitSec={estimatedWaitSec}
              fastAnswerMode={runtimeHealth?.fastAnswer === true || runtimeHealth?.llmMode === 'fast'}
              onSend={handleSend}
              onStopGenerate={handleStopGenerate}
              onPauseGenerate={handlePauseGenerate}
              onResumeGenerate={handleResumeGenerate}
              streamPaused={streamPaused}
              onValidateBeforeSend={handleValidateBeforeSend}
              onSimilarQuestionClick={handleSimilarQuestionClick}
              onClearHistory={handleClearHistory}
              inputLocked={isLoading || historyLoading || backendOnline === false}
              exportMenu={
                <ExportMenu
                  onExport={handleExportHistory}
                  disabled={messages.length <= 1 || historyLoading}
                />
              }
              quickPrompts={filteredQuickPrompts}
            />
          </div>
          <div className="insights-toolbar">
            <button
              type="button"
              className="insights-toggle-btn"
              onClick={() => {
                if (!insightsOpen && !reportEthicsOk && latestReport) {
                  setReportEthicsOpen(true);
                  return;
                }
                setInsightsOpen((v) => !v);
              }}
            >
              {insightsOpen ? '收起趋势与报告 ▲' : '展开趋势与报告 ▼'}
              {(portraitPending || reportPending) && ' · 生成中'}
            </button>
          </div>
          {insightsOpen && reportEthicsOk && (
          <div className="insights-grid">
            <div className="insights-col insights-col-rhythm">
              <InsightsPanelShell title="智能情绪节律日历" className="insights-col-rhythm">
                <EmotionRhythmCalendar userId={currentUserId} />
              </InsightsPanelShell>
            </div>
            <div className="insights-col insights-col-chart">
              <InsightsPanelShell title="心理变化趋势" className="insights-col-chart">
                <TrendChart data={trendData} />
              </InsightsPanelShell>
            </div>
            {latestReport?.portrait && (
              <div className="insights-col insights-col-portrait">
                <InsightsPanelShell title="本次咨询画像" className="insights-col-portrait">
                  <ConversationPortraitPanel
                    portrait={latestReport.portrait}
                    sessionCount={(latestReport.statModel?.totalSessions ?? consultCount) || 1}
                    pending={portraitPending}
                  />
                </InsightsPanelShell>
              </div>
            )}
            {latestReport && (
              <div className="insights-col insights-col-report">
                <InsightsPanelShell title="心理咨询报告" className="insights-col-report">
                  <ReportPanel
                    emotion={latestReport.emotion}
                    risk={latestReport.risk}
                    problem={latestReport.problem}
                    intervention={latestReport.intervention}
                    carePlan={latestReport.carePlan}
                    analysisSources={latestReport.analysisSources}
                    llmUsed={latestReport.llmUsed}
                    reportPending={reportPending}
                    implicitNeeds={latestReport.implicitNeeds}
                    onOpenCbt={() => {
                      void fetchCbtModule(latestReport.problem?.category, latestReport.emotion?.emotion).then(
                        (d) => setCbtModule(d.module)
                      );
                    }}
                    emotionStyle={latestReport.emotionStyle}
                    report={latestReport.report}
                    statModel={latestReport.statModel}
                    shareContext={
                      sessionUser
                        ? {
                            studentLabel: sessionUser.realName || sessionUser.displayName,
                            orgName: sessionUser.orgName,
                            className: sessionUser.className,
                            studentNo: sessionUser.studentNo,
                            allowSchoolTranscriptView: sessionUser.allowSchoolTranscriptView !== false
                          }
                        : undefined
                    }
                  />
                </InsightsPanelShell>
              </div>
            )}
            {portraitHistoryItems.length > 0 && (
              <div className="insights-col insights-col-history">
                <InsightsPanelShell title="历次咨询画像" className="insights-col-history">
                  <PortraitHistoryList items={portraitHistoryItems} />
                </InsightsPanelShell>
              </div>
            )}
          </div>
          )}
        </div>
      </main>
      <TrendCareAlertModal
        open={trendCareOpen}
        reason={trendCareReason}
        onClose={() => setTrendCareOpen(false)}
        onContactCounselor={() => {
          setTrendCareOpen(false);
          pushToast('可在「个人资料」中查看辅导员联系方式，或前往学校心理中心预约', 'info');
        }}
      />
      {cbtModule && (
        <CbtMicroModuleModal
          module={cbtModule}
          problem={latestReport?.problem?.category}
          emotion={latestReport?.emotion?.emotion}
          onClose={() => setCbtModule(null)}
        />
      )}
      <ToastStack messages={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default StudentApp;
