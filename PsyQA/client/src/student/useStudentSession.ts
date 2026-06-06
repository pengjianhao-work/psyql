import { useCallback, useState } from 'react';
import { GroupedHistoryItem, UserProgress } from '../types';
import { getGroupedHistory, getUserProgress } from '../api';
import { progressHistoryToMessages, restoreSessionSummary } from '../utils/chatHistory';
import { HistoryDataPoint } from '../types';

export function progressToTrendData(progress: UserProgress): HistoryDataPoint[] {
  return progress.history.map((h, index) => ({
    date: `第${index + 1}次`,
    stressLevel: h.stressLevel ?? 45,
    anxietyLevel: h.anxietyLevel ?? 40,
    moodStability: h.moodStability ?? 65
  }));
}

export function useStudentSession() {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [groupedHistory, setGroupedHistory] = useState<Record<string, GroupedHistoryItem[]>>({});
  const [trendData, setTrendData] = useState<HistoryDataPoint[]>([]);

  const loadSessionFromServer = useCallback(async (userId: string) => {
    if (!userId) return null;
    setHistoryLoading(true);
    try {
      const [progress, grouped] = await Promise.all([
        getUserProgress(userId),
        getGroupedHistory(userId)
      ]);
      const groups = grouped.groups || {};
      setTrendData(progressToTrendData(progress));
      setGroupedHistory(groups);
      return {
        progress,
        groups,
        messages: progressHistoryToMessages(progress.history),
        restored: restoreSessionSummary(progress, groups)
      };
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  return {
    historyLoading,
    groupedHistory,
    setGroupedHistory,
    trendData,
    setTrendData,
    loadSessionFromServer
  };
}
