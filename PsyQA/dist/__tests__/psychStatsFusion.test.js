"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const psychStatsService_1 = require("../services/psych/psychStatsService");
function baseInputs() {
    return {
        emotion: { emotion: 'anxious', confidence: 0.55, keywords: [], secondaryEmotions: [] },
        risk: { level: 'low', keywords: [], warningMessage: '', hotline: '400' },
        problem: { category: 'interpersonal', confidence: 0.6, keywords: [], subcategories: [] }
    };
}
describe('applyStatisticalFusion', () => {
    test('elevates risk when composite score is high', () => {
        const { emotion, risk, problem } = baseInputs();
        const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(emotion, risk, problem);
        const statModel = (0, psychStatsService_1.buildPsychStatModel)(emotion, risk, problem, metrics, []);
        statModel.compositeScores.riskScore = 72;
        const fused = (0, psychStatsService_1.applyStatisticalFusion)(emotion, risk, problem, statModel);
        expect(['high', 'critical']).toContain(fused.risk.level);
    });
    test('hidden risk flag elevates low to medium', () => {
        const { emotion, risk, problem } = baseInputs();
        const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(emotion, risk, problem);
        const statModel = (0, psychStatsService_1.buildPsychStatModel)(emotion, risk, problem, metrics, []);
        if (statModel.intelligentModel) {
            statModel.intelligentModel.hiddenRisk = { score: 70, flag: true };
        }
        const fused = (0, psychStatsService_1.applyStatisticalFusion)(emotion, risk, problem, statModel);
        expect(['medium', 'high', 'critical']).toContain(fused.risk.level);
    });
    test('does not downgrade critical risk', () => {
        const { emotion, problem } = baseInputs();
        const risk = {
            level: 'critical',
            keywords: [],
            warningMessage: '紧急',
            hotline: '400'
        };
        const metrics = (0, psychStatsService_1.refineMetricsWithSignals)(emotion, risk, problem);
        const statModel = (0, psychStatsService_1.buildPsychStatModel)(emotion, risk, problem, metrics, []);
        statModel.compositeScores.riskScore = 50;
        const fused = (0, psychStatsService_1.applyStatisticalFusion)(emotion, risk, problem, statModel);
        expect(fused.risk.level).toBe('critical');
    });
});
