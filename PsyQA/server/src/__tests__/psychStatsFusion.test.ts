import {
  applyStatisticalFusion,
  buildPsychStatModel,
  refineMetricsWithSignals
} from '../services/psych/psychStatsService';
import type { EmotionAnalysis, RiskAssessment, ProblemAnalysis } from '../services/psych/emotionService';

function baseInputs(): {
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem: ProblemAnalysis;
} {
  return {
    emotion: { emotion: 'anxious', confidence: 0.55, keywords: [], secondaryEmotions: [] },
    risk: { level: 'low', keywords: [], warningMessage: '', hotline: '400' },
    problem: { category: 'interpersonal', confidence: 0.6, keywords: [], subcategories: [] }
  };
}

describe('applyStatisticalFusion', () => {
  test('elevates risk when composite score is high', () => {
    const { emotion, risk, problem } = baseInputs();
    const metrics = refineMetricsWithSignals(emotion, risk, problem);
    const statModel = buildPsychStatModel(emotion, risk, problem, metrics, []);
    statModel.compositeScores.riskScore = 72;

    const fused = applyStatisticalFusion(emotion, risk, problem, statModel);
    expect(['high', 'critical']).toContain(fused.risk.level);
  });

  test('hidden risk flag elevates low to medium', () => {
    const { emotion, risk, problem } = baseInputs();
    const metrics = refineMetricsWithSignals(emotion, risk, problem);
    const statModel = buildPsychStatModel(emotion, risk, problem, metrics, []);
    if (statModel.intelligentModel) {
      statModel.intelligentModel.hiddenRisk = { score: 70, flag: true };
    }

    const fused = applyStatisticalFusion(emotion, risk, problem, statModel);
    expect(['medium', 'high', 'critical']).toContain(fused.risk.level);
  });

  test('does not downgrade critical risk', () => {
    const { emotion, problem } = baseInputs();
    const risk: RiskAssessment = {
      level: 'critical',
      keywords: [],
      warningMessage: '紧急',
      hotline: '400'
    };
    const metrics = refineMetricsWithSignals(emotion, risk, problem);
    const statModel = buildPsychStatModel(emotion, risk, problem, metrics, []);
    statModel.compositeScores.riskScore = 50;

    const fused = applyStatisticalFusion(emotion, risk, problem, statModel);
    expect(fused.risk.level).toBe('critical');
  });
});
