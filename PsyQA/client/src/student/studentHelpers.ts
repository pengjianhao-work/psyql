import { HistoryDataPoint, Message, QuestionResponse, UserProgress } from '../types';
import { UserProfile } from '../components/UserSelector';
import { stripReActLeakFromDisplay } from '../utils/formatMessage';

export function createTurnIds(): { turnId: string; userMsgId: string; botMsgId: string } {
  const turnId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { turnId, userMsgId: `user-${turnId}`, botMsgId: `bot-${turnId}` };
}

export function buildBotMessageFromResponse(
  botMsgId: string,
  response: QuestionResponse,
  timestamp: string,
  extra?: Partial<Message>
): Message {
  return {
    id: botMsgId,
    type: 'bot',
    content: stripReActLeakFromDisplay(response.answer),
    knowledgeSources: response.knowledgeSources,
    similarQuestions: response.similarQuestions,
    emotion: response.emotion,
    risk: response.risk,
    problem: response.problem,
    emotionStyle: response.emotionStyle,
    report: response.report,
    llmUsed: response.llmUsed,
    reactUsed: response.reactUsed,
    reactMode: response.reactMode,
    reactTrace: response.reactTrace ?? [],
    generationHint: response.generationHint,
    briefReport: response.briefReport,
    timestamp,
    streaming: false,
    ...extra
  };
}

export function upsertBotMessage(prev: Message[], botMsg: Message): Message[] {
  const idx = prev.findIndex((m) => m.id === botMsg.id);
  if (idx < 0) return [...prev, botMsg];
  return prev.map((m) => (m.id === botMsg.id ? { ...botMsg, type: 'bot' as const } : m));
}

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
