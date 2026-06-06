import { generateConversationPortrait } from './portraitService';
import {
  getStructuredPsychTimeline,
  updateDialogPortrait,
  PsychSnapshot
} from '../common/historyManager';
import { PsychStatModel } from '../psych/psychStatsService';
import { ConversationPortrait } from '../common/historyManager';

const inFlight = new Set<string>();

export function schedulePortraitGeneration(params: {
  userId: string;
  dialogTime: string;
  question: string;
  answer: string;
  psychSnapshot: PsychSnapshot;
  statModel: PsychStatModel;
  tryLlm: boolean;
}): void {
  const key = `${params.userId}:${params.dialogTime}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  void (async () => {
    try {
      const priorContext = getStructuredPsychTimeline(params.userId, 4);
      const portrait = await generateConversationPortrait({
        userQuery: params.question,
        botReply: params.answer,
        psych: params.psychSnapshot,
        userId: params.userId,
        priorContext,
        statModel: params.statModel,
        tryLlm: params.tryLlm
      });
      updateDialogPortrait(params.userId, params.dialogTime, portrait);
    } catch (err) {
      console.warn('Async portrait generation failed:', err);
    } finally {
      inFlight.delete(key);
    }
  })();
}

export function buildPlaceholderPortrait(): ConversationPortrait {
  return {
    summary: '咨询画像生成中…',
    emotionalPresentation: '系统正在根据本轮对话整理情绪呈现，请稍后刷新查看。',
    coreConcerns: [],
    observedPatterns: [],
    strengths: [],
    supportNeeds: [],
    recommendedFocus: '稍后查看完整画像',
    confidence: 'low',
    llmUsed: false,
    generatedAt: new Date().toISOString()
  };
}
