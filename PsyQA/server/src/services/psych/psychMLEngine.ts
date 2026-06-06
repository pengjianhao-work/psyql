import * as fs from 'fs';
import { resolveDataFile } from '../../config/paths';
import { ChartMetrics } from './psychMetrics';
import { EmotionType } from './emotionService';
import { PsychFeatureVector } from './psychFeatureEngine';

export type PsychStateCluster = 'stable' | 'mild_fluctuation' | 'moderate_stress' | 'high_risk';

export const CLUSTER_LABELS: Record<PsychStateCluster, string> = {
  stable: '平稳正常',
  mild_fluctuation: '轻度波动',
  moderate_stress: '中度压力',
  high_risk: '高危预警'
};

export interface ModelWeightsConfig {
  version: string;
  distressWeights: { stress: number; anxiety: number; moodInstability: number };
  wellbeingBias: number;
  functionalDistressFactor: number;
  populationPrior: { stress: number; anxiety: number; mood: number };
  bayesianPriorStrength: number;
  fusionWeights: { statistical: number; machineLearning: number; neuralNetwork: number };
}

export interface MLLayerOutput {
  metrics: ChartMetrics;
  distress: number;
  wellbeing: number;
  functionalCapacity: number;
  cluster: PsychStateCluster;
  clusterLabel: string;
  dynamicWeights: ModelWeightsConfig['distressWeights'];
  bayesianApplied: boolean;
  smoothedMetrics: ChartMetrics;
}

const CLUSTER_CENTROIDS: Array<{ id: PsychStateCluster; center: [number, number, number] }> = [
  { id: 'stable', center: [35, 30, 75] },
  { id: 'mild_fluctuation', center: [55, 50, 55] },
  { id: 'moderate_stress', center: [72, 68, 42] },
  { id: 'high_risk', center: [85, 82, 28] }
];

let cachedWeights: ModelWeightsConfig | null = null;

export function loadModelWeights(): ModelWeightsConfig {
  if (cachedWeights) return cachedWeights;
  const filePath = resolveDataFile('psych_model_weights.json');
  try {
    cachedWeights = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ModelWeightsConfig;
  } catch {
    cachedWeights = {
      version: '1.0',
      distressWeights: { stress: 0.36, anxiety: 0.38, moodInstability: 0.26 },
      wellbeingBias: 8,
      functionalDistressFactor: 0.55,
      populationPrior: { stress: 48, anxiety: 44, mood: 58 },
      bayesianPriorStrength: 3,
      fusionWeights: { statistical: 0.3, machineLearning: 0.4, neuralNetwork: 0.3 }
    };
  }
  return cachedWeights!;
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function ewma(values: number[], alpha = 0.4): number {
  if (values.length === 0) return 0;
  let smoothed = values[0];
  for (let i = 1; i < values.length; i++) {
    smoothed = alpha * values[i] + (1 - alpha) * smoothed;
  }
  return smoothed;
}

export function bayesianShrinkMetrics(
  metrics: ChartMetrics,
  sessionCount: number,
  config: ModelWeightsConfig
): { metrics: ChartMetrics; applied: boolean } {
  const n = sessionCount;
  const k = config.bayesianPriorStrength;
  if (n >= 5) {
    return { metrics, applied: false };
  }
  const w = n / (n + k);
  const prior = config.populationPrior;
  return {
    metrics: {
      stressLevel: clamp100(metrics.stressLevel * w + prior.stress * (1 - w)),
      anxietyLevel: clamp100(metrics.anxietyLevel * w + prior.anxiety * (1 - w)),
      moodStability: clamp100(metrics.moodStability * w + prior.mood * (1 - w))
    },
    applied: true
  };
}

function kMeansAssign(stress: number, anxiety: number, mood: number): PsychStateCluster {
  let best: PsychStateCluster = 'stable';
  let bestDist = Infinity;
  for (const c of CLUSTER_CENTROIDS) {
    const [cs, ca, cm] = c.center;
    const d = (stress - cs) ** 2 + (anxiety - ca) ** 2 + (mood - cm) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c.id;
    }
  }
  return best;
}

function mlComputeDistress(metrics: ChartMetrics, weights: ModelWeightsConfig['distressWeights']): number {
  const moodInstability = 100 - metrics.moodStability;
  return clamp100(
    metrics.stressLevel * weights.stress +
      metrics.anxietyLevel * weights.anxiety +
      moodInstability * weights.moodInstability
  );
}

function mlComputeWellbeing(distress: number, emotion: EmotionType, bias: number): number {
  const positive: EmotionType[] = ['happy', 'hopeful', 'proud', 'neutral'];
  const boost = positive.includes(emotion) ? bias : 0;
  return clamp100(100 - distress + boost);
}

function mlComputeFunctional(distress: number, riskLevel: string, factor: number): number {
  const riskPenalty: Record<string, number> = { low: 0, medium: 8, high: 18, critical: 32 };
  return clamp100(100 - distress * factor - (riskPenalty[riskLevel] ?? 0));
}

export function runMLLayer(
  rawMetrics: ChartMetrics,
  features: PsychFeatureVector,
  emotion: EmotionType,
  riskLevel: string,
  historyStress: number[],
  historyAnxiety: number[],
  historyMood: number[]
): MLLayerOutput {
  const config = loadModelWeights();
  const { metrics: shrunk, applied } = bayesianShrinkMetrics(rawMetrics, features.sessionIndex - 1, config);

  const smoothedMetrics: ChartMetrics = {
    stressLevel: clamp100(
      historyStress.length > 0 ? ewma([...historyStress, shrunk.stressLevel]) : shrunk.stressLevel
    ),
    anxietyLevel: clamp100(
      historyAnxiety.length > 0 ? ewma([...historyAnxiety, shrunk.anxietyLevel]) : shrunk.anxietyLevel
    ),
    moodStability: clamp100(
      historyMood.length > 0 ? ewma([...historyMood, shrunk.moodStability]) : shrunk.moodStability
    )
  };

  const distress = mlComputeDistress(smoothedMetrics, config.distressWeights);
  const wellbeing = mlComputeWellbeing(distress, emotion, config.wellbeingBias);
  const functionalCapacity = mlComputeFunctional(distress, riskLevel, config.functionalDistressFactor);
  const cluster = kMeansAssign(
    smoothedMetrics.stressLevel,
    smoothedMetrics.anxietyLevel,
    smoothedMetrics.moodStability
  );

  return {
    metrics: smoothedMetrics,
    distress,
    wellbeing,
    functionalCapacity,
    cluster,
    clusterLabel: CLUSTER_LABELS[cluster],
    dynamicWeights: config.distressWeights,
    bayesianApplied: applied,
    smoothedMetrics
  };
}
