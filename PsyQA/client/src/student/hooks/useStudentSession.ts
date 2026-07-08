import { useCallback, useState } from 'react';
import { GroupedHistoryItem, Message, UserProgress } from '../../types';
import {
  getGroupedHistory,
  getInsightsStatus,
  getUserProgress,
  pollInsightsUntilReady
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

        const restoredMessages = progressHistoryToMessages(progress.history);
        setMessages(restoredMessages.length ? restoredMessages : [createWelcomeMessage()]);

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
    [pushToast]
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
    refreshProgressAndHistory
  };
}
