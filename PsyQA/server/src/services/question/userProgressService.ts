import {
  getUserHistory,
  getUserPsychSnapshots,
  rebuildReportFromPsych,
  PsychSnapshot
} from '../common/historyManager';
import {
  buildPsychStatModel,
  applyStatisticalFusion,
  rebuildStatModelFromSnapshot,
  PsychStatModel
} from '../psych/psychStatsService';
import {
  getEmotionStyle,
  formatEmotionReport,
  EmotionAnalysis,
  RiskAssessment,
  ProblemAnalysis
} from '../psych/emotionService';
import { getInterventionPlan } from '../psych/interventionService';

export interface UserProgress {
  totalTimes: number;
  history: Array<{
    time: string;
    user: string;
    bot: string;
    summary: string;
    report?: string;
    stressLevel?: number;
    anxietyLevel?: number;
    moodStability?: number;
    emotion?: string;
    risk?: string;
    problem?: string;
    userSelfRating?: number;
    selfRatedStress?: number;
    selfRatedAnxiety?: number;
    portrait?: {
      summary: string;
      emotionalPresentation: string;
      recommendedFocus: string;
      llmUsed: boolean;
    };
  }>;
  latestAssessment?: LatestAssessmentPayload;
}

export interface LatestAssessmentPayload {
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem: ProblemAnalysis;
  report: string;
  statModel: PsychStatModel;
  emotionStyle: ReturnType<typeof getEmotionStyle>;
}

function buildFullReport(
  emotion: EmotionAnalysis,
  risk: RiskAssessment,
  problem: ProblemAnalysis,
  interventionName: string,
  statModel: PsychStatModel
): string {
  const base = formatEmotionReport(emotion, risk, problem, interventionName);
  return base;
}

export function buildLatestAssessment(userId: string): LatestAssessmentPayload | null {
  const snapshots = getUserPsychSnapshots(userId);
  if (!snapshots.length) return null;

  const last = snapshots[snapshots.length - 1];
  const history = snapshots.slice(0, -1);
  const emotion: EmotionAnalysis = {
    emotion: last.emotion,
    confidence: last.confidence,
    keywords: [],
    secondaryEmotions: []
  };
  const risk: RiskAssessment = {
    level: last.risk,
    keywords: [],
    warningMessage:
      last.risk === 'high' || last.risk === 'critical' ? '请关注当前风险等级，必要时寻求专业支持。' : '',
    hotline: '全国心理援助热线：400-161-9995'
  };
  const problem: ProblemAnalysis = {
    category: last.problem,
    confidence: 0.7,
    keywords: [],
    subcategories: []
  };

  const statModel = rebuildStatModelFromSnapshot(last, history);
  const fused = applyStatisticalFusion(emotion, risk, problem, statModel);
  const intervention = getInterventionPlan(fused.emotion.emotion, fused.problem.category, fused.risk.level);

  const userData = getUserHistory(userId);
  const lastDialog = userData?.dialogs[userData.dialogs.length - 1];
  const report =
    lastDialog?.report ||
    buildFullReport(fused.emotion, fused.risk, fused.problem, intervention.frameworkName, statModel);

  return {
    emotion: fused.emotion,
    risk: fused.risk,
    problem: fused.problem,
    report,
    statModel,
    emotionStyle: getEmotionStyle(fused.emotion.emotion)
  };
}

export function getUserProgressData(userId: string): UserProgress {
  const userData = getUserHistory(userId);
  if (!userData) {
    return { totalTimes: 0, history: [] };
  }
  const latestAssessment = buildLatestAssessment(userId) ?? undefined;

  return {
    totalTimes: userData.total_times,
    latestAssessment,
    history: userData.dialogs.map((d) => ({
      time: d.time,
      user: d.user,
      bot: d.bot,
      summary: d.summary,
      report: d.report || (d.psych ? rebuildReportFromPsych(d.psych) : d.summary),
      stressLevel: d.psych?.stressLevel,
      anxietyLevel: d.psych?.anxietyLevel,
      moodStability: d.psych?.moodStability,
      emotion: d.psych?.emotion,
      risk: d.psych?.risk,
      problem: d.psych?.problem,
      userSelfRating: d.psych?.userSelfRating,
      selfRatedStress: d.psych?.selfRatedStress,
      selfRatedAnxiety: d.psych?.selfRatedAnxiety,
      portrait: d.portrait
        ? {
            summary: d.portrait.summary,
            emotionalPresentation: d.portrait.emotionalPresentation,
            recommendedFocus: d.portrait.recommendedFocus,
            llmUsed: d.portrait.llmUsed
          }
        : undefined
    }))
  };
}
