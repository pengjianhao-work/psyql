import { useCallback, useState } from 'react';
import { GroupedHistoryItem, Message, UserProgress } from '../../types';
import {
  archiveConversation,
  createConversation,
  getConversationMessages,
  getGroupedHistory,
  getInsightsStatus,
  getUserProgress,
  listConversations,
  pollInsightsUntilReady,
  type ConversationItem
} from '../../api';
import { progressHistoryToMessages, restoreSessionSummary } from '../../utils/chatHistory';
import { createWelcomeMessage, progressToTrendData } from '../studentHelpers';

export type LatestReportState = {
  emotion: import('../../types').QuestionResponse['emotion'];
  risk: import('../../types').QuestionResponse['risk'];
  problem?: import('../../types').QuestionResponse['problem'];
  intervention?: import('../../types').QuestionResponse['intervention'];
  carePlan?: import('../../types').QuestionResponse['carePlan'];
  analysisSources?: import('../../types').QuestionResponse['analysisSources'];
  intent?: import('../../types').QuestionResponse['intent'];
  llmUsed?: boolean;
  emotionStyle: import('../../types').QuestionResponse['emotionStyle'];
  report: string;
  statModel?: import('../../types').QuestionResponse['statModel'];
  portrait?: import('../../types').QuestionResponse['portrait'];
  implicitNeeds?: import('../../types').QuestionResponse['implicitNeeds'];
} | null;

export function useStudentSession(pushToast: (text: string, tone?: 'info' | 'success' | 'warning') => void) {
  const [messages, setMessages] = useState<Message[]>([createWelcomeMessage()]);
  const [trendData, setTrendData] = useState<import('../../types').HistoryDataPoint[]>([]);
  const [groupedHistory, setGroupedHistory] = useState<Record<string, GroupedHistoryItem[]>>({});
  const [latestReport, setLatestReport] = useState<LatestReportState>(null);
  const [lastDialogTime, setLastDialogTime] = useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [portraitPending, setPortraitPending] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();

  const applyConversation = useCallback(async (userId: string, item: ConversationItem) => {
    localStorage.setItem(`psyqa.conversation.${userId}`, item.id);
    setConversationId(item.id);
    const history = await getConversationMessages(userId, item.id);
    const restoredMessages = progressHistoryToMessages(history);
    setMessages(restoredMessages.length ? restoredMessages : [createWelcomeMessage()]);
  }, []);

  const loadSessionFromServer = useCallback(
    async (userId: string) => {
      if (!userId) return;
      setHistoryLoading(true);
      try {
        const [progress, grouped] = await Promise.all([
          getUserProgress(userId),
          getGroupedHistory(userId)
        ]);
        const groups = grouped.groups || {};
        setTrendData(progressToTrendData(progress));
        setGroupedHistory(groups);

        const listed = await listConversations(userId);
        const stored = localStorage.getItem(`psyqa.conversation.${userId}`);
        let current =
          listed.find((item) => item.id === stored && item.status === 'active') ||
          listed.find((item) => item.status === 'active');
        if (!current) {
          current = await createConversation(userId);
          setConversations([current, ...listed]);
        } else {
          setConversations(listed);
        }
        await applyConversation(userId, current);

        const restored = restoreSessionSummary(progress, groups);
        setLatestReport(restored.latestReport);
        setLastDialogTime(restored.lastDialogTime);
        try {
          const status = await getInsightsStatus(userId);
          setPortraitPending(status.portraitPending);
          setReportPending(status.reportPending);
          if (!status.ready && (status.reportPending || status.portraitPending)) {
            void pollInsightsUntilReady(userId).then((polled) => {
              if (!polled) return;
              setPortraitPending(false);
              setReportPending(false);
              const again = restoreSessionSummary(polled, groups);
              if (again.latestReport) setLatestReport(again.latestReport);
              pushToast('历史会话的报告与画像已同步', 'success');
            });
          }
        } catch {
          setPortraitPending(Boolean(restored.latestReport?.portrait?.summary?.includes('生成中')));
          setReportPending(Boolean(restored.latestReport?.report?.includes('详细心理评估报告生成中')));
        }
      } catch (error) {
        console.error('Failed to load session history:', error);
        setMessages([createWelcomeMessage()]);
        setTrendData([]);
        setGroupedHistory({});
        setLatestReport(null);
      } finally {
        setHistoryLoading(false);
      }
    },
    [applyConversation, pushToast]
  );

  const refreshProgressAndHistory = useCallback(async (userId: string): Promise<UserProgress | null> => {
    try {
      const [progress, grouped] = await Promise.all([
        getUserProgress(userId),
        getGroupedHistory(userId)
      ]);
      setTrendData(progressToTrendData(progress));
      setGroupedHistory(grouped.groups || {});
      return progress;
    } catch {
      return null;
    }
  }, []);

  const startConversation = useCallback(async (userId: string) => {
    const created = await createConversation(userId);
    setConversations(await listConversations(userId));
    await applyConversation(userId, created);
  }, [applyConversation]);

  const endConversation = useCallback(async (userId: string, id: string) => {
    await archiveConversation(userId, id);
    await startConversation(userId);
  }, [startConversation]);

  const openConversation = useCallback(async (userId: string, id: string) => {
    const item = conversations.find((row) => row.id === id);
    if (!item) return;
    await applyConversation(userId, item);
  }, [applyConversation, conversations]);

  const refreshConversations = useCallback(async (userId: string) => {
    setConversations(await listConversations(userId));
  }, []);

  return {
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
    refreshProgressAndHistory,
    conversations,
    conversationId,
    setConversationId,
    startConversation,
    endConversation,
    openConversation,
    refreshConversations
  };
}
