import { ChartMetrics } from './psychMetrics';
import { EmotionAnalysis, RiskAssessment, ProblemAnalysis } from './emotionService';
import { PsychSnapshot } from '../common/historyManager';
import { extractPsychFeatures } from './psychFeatureEngine';
import { runMLLayer, loadModelWeights, MLLayerOutput } from './psychMLEngine';
import { runNeuralFromFeatures, NeuralLayerOutput } from './psychNeuralEngine';

export interface StatisticalLayerScores {
  stress: number;
  anxiety: number;
  mood: number;
  distress: number;
  wellbeing: number;
  functionalCapacity: number;
}

export interface FusionResult {
  fused: StatisticalLayerScores;
  statistical: StatisticalLayerScores;
  ml: MLLayerOutput;
  neural: NeuralLayerOutput;
  fusionWeights: { statistical: number; machineLearning: number; neuralNetwork: number };
  architectureVersion: string;
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fuse3(a: number, b: number, c: number, w: { s: number; m: number; n: number }): number {
  return clamp100(a * w.s + b * w.m + c * w.n);
}

export function runThreeLayerFusion(
  emotion: EmotionAnalysis,
  risk: RiskAssessment,
  problem: ProblemAnalysis,
  metrics: ChartMetrics,
  historySnapshots: PsychSnapshot[],
  statScores: StatisticalLayerScores
): FusionResult {
  const config = loadModelWeights();
  const fw = config.fusionWeights;
  const wSum = fw.statistical + fw.machineLearning + fw.neuralNetwork;
  const w = {
    s: fw.statistical / wSum,
    m: fw.machineLearning / wSum,
    n: fw.neuralNetwork / wSum
  };

  const features = extractPsychFeatures(
    emotion,
    risk,
    problem,
    metrics,
    historySnapshots,
    statScores.distress,
    statScores.wellbeing
  );

  const histStress = historySnapshots.map((s) => s.stressLevel);
  const histAnxiety = historySnapshots.map((s) => s.anxietyLevel);
  const histMood = historySnapshots.map((s) => s.moodStability);

  const ml = runMLLayer(metrics, features, emotion.emotion, risk.level, histStress, histAnxiety, histMood);
  const neural = runNeuralFromFeatures(features);

  const fused: StatisticalLayerScores = {
    stress: fuse3(metrics.stressLevel, ml.metrics.stressLevel, metrics.stressLevel * 0.55 + neural.predictedNextStress * 0.45, w),
    anxiety: fuse3(metrics.anxietyLevel, ml.metrics.anxietyLevel, metrics.anxietyLevel * 0.7 + neural.predictedNextAnxiety * 0.3, w),
    mood: fuse3(metrics.moodStability, ml.metrics.moodStability, metrics.moodStability * 0.75 + neural.wellbeing * 0.25, w),
    distress: fuse3(statScores.distress, ml.distress, neural.distress, w),
    wellbeing: fuse3(statScores.wellbeing, ml.wellbeing, neural.wellbeing, w),
    functionalCapacity: fuse3(statScores.functionalCapacity, ml.functionalCapacity, neural.functionalCapacity, w)
  };

  return {
    fused,
    statistical: statScores,
    ml,
    neural,
    fusionWeights: fw,
    architectureVersion: '3.0-stat-ml-nn'
  };
}
