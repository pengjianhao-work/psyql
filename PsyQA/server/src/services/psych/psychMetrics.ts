import { EmotionType } from './emotionService';

export interface ChartMetrics {
  stressLevel: number;
  anxietyLevel: number;
  moodStability: number;
}

const EMOTION_METRICS: Record<EmotionType, ChartMetrics> = {
  happy: { stressLevel: 28, anxietyLevel: 25, moodStability: 86 },
  sad: { stressLevel: 65, anxietyLevel: 58, moodStability: 45 },
  anxious: { stressLevel: 78, anxietyLevel: 80, moodStability: 38 },
  angry: { stressLevel: 72, anxietyLevel: 56, moodStability: 42 },
  lonely: { stressLevel: 60, anxietyLevel: 53, moodStability: 48 },
  neutral: { stressLevel: 45, anxietyLevel: 40, moodStability: 65 },
  hopeful: { stressLevel: 32, anxietyLevel: 30, moodStability: 82 },
  confused: { stressLevel: 58, anxietyLevel: 55, moodStability: 50 },
  frustrated: { stressLevel: 68, anxietyLevel: 60, moodStability: 44 },
  guilty: { stressLevel: 57, anxietyLevel: 54, moodStability: 47 },
  shameful: { stressLevel: 62, anxietyLevel: 58, moodStability: 43 },
  proud: { stressLevel: 30, anxietyLevel: 28, moodStability: 84 }
};

export function emotionToChartMetrics(emotion: EmotionType): ChartMetrics {
  return EMOTION_METRICS[emotion] ?? EMOTION_METRICS.neutral;
}

const RISK_STRESS_BUMP: Record<string, number> = {
  low: 0,
  medium: 8,
  high: 18,
  critical: 28
};

export function applyRiskToMetrics(metrics: ChartMetrics, riskLevel: string): ChartMetrics {
  const bump = RISK_STRESS_BUMP[riskLevel] ?? 0;
  return {
    stressLevel: Math.min(98, metrics.stressLevel + bump),
    anxietyLevel: Math.min(98, metrics.anxietyLevel + Math.round(bump * 0.7)),
    moodStability: Math.max(15, metrics.moodStability - Math.round(bump * 0.5))
  };
}
