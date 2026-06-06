import { featuresToNeuralInput, PsychFeatureVector } from './psychFeatureEngine';

export interface NeuralLayerOutput {
  distress: number;
  wellbeing: number;
  functionalCapacity: number;
  predictedNextStress: number;
  predictedNextAnxiety: number;
  hiddenRiskScore: number;
  hiddenRiskFlag: boolean;
  primaryConcern: string;
  featureAttention: Record<string, number>;
}

const INPUT_DIM = 19;
const HIDDEN_DIM = 16;

const W1: number[][] = Array.from({ length: HIDDEN_DIM }, (_, i) =>
  Array.from({ length: INPUT_DIM }, (_, j) => {
    const seed = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    return (seed - Math.floor(seed) - 0.5) * 0.35;
  })
);
const B1: number[] = Array.from({ length: HIDDEN_DIM }, () => 0.05);

const ATTENTION_IMPORTANCE = [
  1.2, 1.15, 1.0, 1.25, 0.9, 0.7, 0.85, 1.3, 1.0, 1.1, 1.1, 1.0, 1.05, 1.05, 0.95, 0.9, 0.9, 0.5, 0.6
];

const OUTPUT_WEIGHTS = {
  distress: [0.22, 0.2, -0.15, 0.18, -0.12, 0.08, 0.1, 0.25, 0.12, 0.15, 0.14, -0.1, 0.16, 0.14, 0.1, 0.12, 0.08, 0.05, -0.08],
  wellbeing: [-0.18, -0.16, 0.2, -0.2, 0.22, 0.1, 0.08, -0.15, -0.08, -0.1, -0.1, 0.15, -0.12, -0.1, -0.06, -0.08, -0.05, 0.04, 0.12],
  functional: [-0.2, -0.18, 0.12, -0.22, 0.15, 0.06, 0.12, -0.28, -0.1, -0.12, -0.11, 0.1, -0.14, -0.12, -0.08, -0.1, -0.06, 0.03, 0.08],
  nextStress: [0.15, 0.12, -0.05, 0.14, -0.06, 0.05, 0.06, 0.18, 0.08, 0.1, 0.09, -0.06, 0.22, 0.18, 0.12, 0.14, 0.1, 0.08, -0.04],
  nextAnxiety: [0.12, 0.18, -0.04, 0.12, -0.05, 0.06, 0.08, 0.16, 0.07, 0.09, 0.11, -0.05, 0.18, 0.2, 0.1, 0.12, 0.08, 0.06, -0.03],
  hiddenRisk: [0.08, 0.1, -0.06, 0.12, -0.04, -0.05, 0.06, 0.32, 0.14, 0.08, 0.08, -0.08, 0.2, 0.18, 0.15, 0.16, 0.12, 0.1, -0.06]
};

const FEATURE_NAMES = [
  '压力', '焦虑', '平稳度', '困扰度', '幸福感', '情绪置信', '问题置信', '风险等级',
  '关键词强度', '自评压力', '自评焦虑', '自评心情', '压力斜率', '焦虑斜率', '压力波动',
  '基线偏差(压力)', '基线偏差(焦虑)', '会话深度', '正向情绪'
];

function relu(x: number): number {
  return x > 0 ? x : 0;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

function softmaxAttention(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function inferPrimaryConcern(f: PsychFeatureVector, attention: Record<string, number>): string {
  const sorted = Object.entries(attention).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0];
  if (top === '风险等级' || top === '压力斜率' || f.riskNumeric > 0.6) {
    return `${f.problemCategory}相关压力持续累积，建议优先关注触发情境与安全支持。`;
  }
  if (top === '焦虑' || top === '自评焦虑') {
    return '焦虑与担忧是本轮主要困扰，可尝试呼吸放松与分步问题解决。';
  }
  if (top === '平稳度' || top === '自评心情') {
    return '情绪波动与调节能力是核心议题，建议记录情绪日记并规律作息。';
  }
  return `${f.problemCategory}是当前主要心理议题，建议结合自助策略与必要时的专业支持。`;
}

export function runNeuralLayer(input: number[], features: PsychFeatureVector): NeuralLayerOutput {
  const attentionScores = input.map((v, i) => v * ATTENTION_IMPORTANCE[i]);
  const attentionWeights = softmaxAttention(attentionScores);
  const attended = input.map((v, i) => v * attentionWeights[i]);

  const hidden = W1.map((row, i) => relu(dot(attended, row) + B1[i]));

  const toScore = (weights: number[]) => clamp100(sigmoid(dot(hidden, weights)) * 100);

  const distress = toScore(OUTPUT_WEIGHTS.distress);
  const wellbeing = toScore(OUTPUT_WEIGHTS.wellbeing);
  const functionalCapacity = toScore(OUTPUT_WEIGHTS.functional);
  const predictedNextStress = toScore(OUTPUT_WEIGHTS.nextStress);
  const predictedNextAnxiety = toScore(OUTPUT_WEIGHTS.nextAnxiety);
  const hiddenRiskScore = clamp100(sigmoid(dot(hidden, OUTPUT_WEIGHTS.hiddenRisk)) * 100);

  const featureAttention: Record<string, number> = {};
  FEATURE_NAMES.forEach((name, i) => {
    featureAttention[name] = Number((attentionWeights[i] * 100).toFixed(1));
  });

  const hiddenRiskFlag =
    hiddenRiskScore >= 62 ||
    (features.slopeStress > 0.08 && features.riskNumeric > 0.35) ||
    (features.volatilityStress > 0.15 && features.distress > 0.55);

  return {
    distress,
    wellbeing,
    functionalCapacity,
    predictedNextStress,
    predictedNextAnxiety,
    hiddenRiskScore,
    hiddenRiskFlag,
    primaryConcern: inferPrimaryConcern(features, featureAttention),
    featureAttention
  };
}

export function runNeuralFromFeatures(features: PsychFeatureVector): NeuralLayerOutput {
  return runNeuralLayer(featuresToNeuralInput(features), features);
}
