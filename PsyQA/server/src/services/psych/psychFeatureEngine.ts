import {
  EmotionAnalysis,
  RiskAssessment,
  ProblemAnalysis,
  EmotionType,
  RiskLevel,
  getCategoryName
} from './emotionService';
import { ChartMetrics } from './psychMetrics';
import { PsychSnapshot } from '../common/historyManager';

export interface PsychFeatureVector {
  stress: number;
  anxiety: number;
  mood: number;
  distress: number;
  wellbeing: number;
  emotionConfidence: number;
  problemConfidence: number;
  riskNumeric: number;
  keywordIntensity: number;
  selfRatedStress?: number;
  selfRatedAnxiety?: number;
  selfRatedMood?: number;
  slopeStress: number;
  slopeAnxiety: number;
  volatilityStress: number;
  baselineDeltaStress: number;
  baselineDeltaAnxiety: number;
  sessionIndex: number;
  emotionOneHot: Record<EmotionType, number>;
  problemCategory: string;
}

const RISK_NUM: Record<RiskLevel, number> = {
  low: 0.12,
  medium: 0.38,
  high: 0.68,
  critical: 0.92
};

const ALL_EMOTIONS: EmotionType[] = [
  'happy', 'sad', 'anxious', 'angry', 'lonely', 'neutral',
  'hopeful', 'confused', 'frustrated', 'guilty', 'shameful', 'proud'
];

export function normalize100(v: number): number {
  return Math.max(0, Math.min(1, v / 100));
}

export function extractPsychFeatures(
  emotion: EmotionAnalysis,
  risk: RiskAssessment,
  problem: ProblemAnalysis,
  metrics: ChartMetrics,
  historySnapshots: PsychSnapshot[],
  statDistress: number,
  statWellbeing: number
): PsychFeatureVector {
  const series = [...historySnapshots];
  const stressSeries = series.map((s) => s.stressLevel);
  const anxietySeries = series.map((s) => s.anxietyLevel);

  const slope = (vals: number[]): number => {
    if (vals.length < 2) return 0;
    return (vals[vals.length - 1] - vals[0]) / (vals.length - 1);
  };

  const std = (vals: number[]): number => {
    if (vals.length < 2) return 0;
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length);
  };

  const baselineStress =
    stressSeries.length > 0
      ? stressSeries.slice(0, Math.min(3, stressSeries.length)).reduce((a, b) => a + b, 0) /
        Math.min(3, stressSeries.length)
      : metrics.stressLevel;
  const baselineAnxiety =
    anxietySeries.length > 0
      ? anxietySeries.slice(0, Math.min(3, anxietySeries.length)).reduce((a, b) => a + b, 0) /
        Math.min(3, anxietySeries.length)
      : metrics.anxietyLevel;

  const last = series[series.length - 1];
  const emotionOneHot = ALL_EMOTIONS.reduce(
    (acc, e) => {
      acc[e] = emotion.emotion === e ? 1 : 0;
      return acc;
    },
    {} as Record<EmotionType, number>
  );

  return {
    stress: normalize100(metrics.stressLevel),
    anxiety: normalize100(metrics.anxietyLevel),
    mood: normalize100(metrics.moodStability),
    distress: normalize100(statDistress),
    wellbeing: normalize100(statWellbeing),
    emotionConfidence: emotion.confidence,
    problemConfidence: problem.confidence,
    riskNumeric: RISK_NUM[risk.level],
    keywordIntensity: Math.min(1, (emotion.keywords.length + problem.keywords.length) / 8),
    selfRatedStress: last?.selfRatedStress !== undefined ? last.selfRatedStress / 10 : undefined,
    selfRatedAnxiety: last?.selfRatedAnxiety !== undefined ? last.selfRatedAnxiety / 10 : undefined,
    selfRatedMood: last?.userSelfRating !== undefined ? last.userSelfRating / 10 : undefined,
    slopeStress: slope(stressSeries) / 100,
    slopeAnxiety: slope(anxietySeries) / 100,
    volatilityStress: std(stressSeries) / 100,
    baselineDeltaStress: (metrics.stressLevel - baselineStress) / 100,
    baselineDeltaAnxiety: (metrics.anxietyLevel - baselineAnxiety) / 100,
    sessionIndex: series.length + 1,
    emotionOneHot,
    problemCategory: getCategoryName(problem.category)
  };
}

export function featuresToNeuralInput(f: PsychFeatureVector): number[] {
  const positiveEmotion =
    (f.emotionOneHot.happy ?? 0) + (f.emotionOneHot.hopeful ?? 0) + (f.emotionOneHot.proud ?? 0);
  return [
    f.stress,
    f.anxiety,
    f.mood,
    f.distress,
    f.wellbeing,
    f.emotionConfidence,
    f.problemConfidence,
    f.riskNumeric,
    f.keywordIntensity,
    f.selfRatedStress ?? f.stress,
    f.selfRatedAnxiety ?? f.anxiety,
    f.selfRatedMood ?? f.mood,
    f.slopeStress,
    f.slopeAnxiety,
    f.volatilityStress,
    f.baselineDeltaStress,
    f.baselineDeltaAnxiety,
    Math.min(1, f.sessionIndex / 10),
    positiveEmotion
  ];
}
