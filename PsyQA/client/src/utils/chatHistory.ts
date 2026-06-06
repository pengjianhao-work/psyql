import {

  ConversationPortrait,

  EmotionStyle,

  EmotionType,

  GroupedHistoryItem,

  Message,

  ProblemCategory,

  PsychStatModel,

  RiskLevel,

  UserProgress

} from '../types';



const DEFAULT_EMOTION_STYLE: EmotionStyle = {

  greeting: '你好',

  tone: '温暖支持',

  color: '#607D8B',

  emoji: '😌'

};



const DEFAULT_HOTLINE = '全国心理援助热线：400-161-9995';



export function progressHistoryToMessages(

  history: UserProgress['history']

): Message[] {

  if (!history.length) return [];



  const messages: Message[] = [];

  history.forEach((item, index) => {

    messages.push({

      id: `hist-${index}-user`,

      type: 'user',

      content: item.user,

      timestamp: item.time

    });

    messages.push({

      id: `hist-${index}-bot`,

      type: 'bot',

      content: item.bot,

      timestamp: item.time,

      report: item.report || item.summary

    });

  });

  return messages;

}



function flattenGroupedHistory(groups: Record<string, GroupedHistoryItem[]>): GroupedHistoryItem[] {

  return Object.values(groups)

    .flat()

    .sort((a, b) => a.time.localeCompare(b.time));

}



export interface RestoredSessionSummary {

  latestReport: {

    emotion: { emotion: EmotionType; confidence: number; keywords: string[]; secondaryEmotions: EmotionType[] };

    risk: { level: RiskLevel; keywords: string[]; warningMessage: string; hotline: string };

    problem?: { category: ProblemCategory; confidence: number; keywords: string[]; subcategories: string[] };

    emotionStyle: EmotionStyle;

    report: string;

    statModel?: PsychStatModel;

    portrait?: ConversationPortrait;

  } | null;

  lastDialogTime?: string;

}



export function restoreSessionSummary(

  progress: UserProgress,

  groups: Record<string, GroupedHistoryItem[]>

): RestoredSessionSummary {

  if (!progress.history.length && !progress.latestAssessment) {

    return { latestReport: null };

  }



  const groupedItems = flattenGroupedHistory(groups);

  const lastGrouped = groupedItems[groupedItems.length - 1];

  const portrait = lastGrouped?.portrait;



  if (progress.latestAssessment) {

    const la = progress.latestAssessment;

    const lastProgress = progress.history[progress.history.length - 1];

    return {

      lastDialogTime: lastProgress?.time,

      latestReport: {

        emotion: la.emotion,

        risk: la.risk,

        problem: la.problem,

        emotionStyle: la.emotionStyle,

        report: la.report,

        statModel: la.statModel,

        portrait

      }

    };

  }



  const lastProgress = progress.history[progress.history.length - 1];



  if (!lastProgress.emotion && !lastProgress.risk && !portrait) {

    return {

      latestReport: null,

      lastDialogTime: lastProgress.time

    };

  }



  const emotion = (lastProgress.emotion || 'neutral') as EmotionType;

  const riskLevel = (lastProgress.risk || 'low') as RiskLevel;

  const problem = lastProgress.problem as ProblemCategory | undefined;



  return {

    lastDialogTime: lastProgress.time,

    latestReport: {

      emotion: {

        emotion,

        confidence: 0.75,

        keywords: [],

        secondaryEmotions: []

      },

      risk: {

        level: riskLevel,

        keywords: [],

        warningMessage: riskLevel === 'high' || riskLevel === 'critical' ? '请关注当前风险等级' : '',

        hotline: DEFAULT_HOTLINE

      },

      problem: problem

        ? {

            category: problem,

            confidence: 0.75,

            keywords: [],

            subcategories: []

          }

        : undefined,

      emotionStyle: DEFAULT_EMOTION_STYLE,

      report: lastProgress.report || lastProgress.summary || lastProgress.bot.slice(0, 200),

      portrait

    }

  };

}

