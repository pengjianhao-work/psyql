import { HistoryDataPoint, Message, UserProgress } from '../types';
import { UserProfile } from '../components/UserSelector';

export const createWelcomeMessage = (): Message => ({
  id: '1',
  type: 'bot',
  content:
    '你好，欢迎来到心理港湾 🌿\n\n这里是安全、私密的倾诉空间。你可以描述最近的心情、人际或学业压力，我会认真倾听并给出参考建议。',
  timestamp: new Date().toLocaleString('zh-CN')
});

export const progressToTrendData = (progress: UserProgress): HistoryDataPoint[] =>
  progress.history.map((h, index) => ({
    date: `第${index + 1}次`,
    stressLevel: h.stressLevel ?? 45,
    anxietyLevel: h.anxietyLevel ?? 40,
    moodStability: h.moodStability ?? 65
  }));

export const profilesToRecord = (list: UserProfile[]): Record<string, UserProfile> =>
  list.reduce<Record<string, UserProfile>>((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});
