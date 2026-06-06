import { Request, Response } from 'express';
import { analyzePsychState } from '../services/psych/psychAnalysisService';
import { getCarePlanSuggestion } from '../services/psych/carePlanHints';
import { getEmotionStyle, formatEmotionReport, getCategoryName } from '../services/psych/emotionService';
import { getInterventionPlan } from '../services/psych/interventionService';
import {
  buildPsychStatModel,
  formatStatisticalReportSection,
  refineMetricsWithSignals
} from '../services/psych/psychStatsService';

export const postAnalyzePsych = async (req: Request, res: Response): Promise<void> => {
  const { text, tryLlm } = req.body as { text?: string; tryLlm?: boolean };
  if (!text || !String(text).trim()) {
    res.status(400).json({ error: '请提供 text 字段' });
    return;
  }

  const bundle = await analyzePsychState(String(text).trim(), undefined, {
    tryLlm: tryLlm !== false
  });
  const intervention = getInterventionPlan(
    bundle.emotion.emotion,
    bundle.problem.category,
    bundle.risk.level
  );
  const carePlan = getCarePlanSuggestion(bundle.problem.category);
  const metrics = refineMetricsWithSignals(bundle.emotion, bundle.risk, bundle.problem);
  const statModel = buildPsychStatModel(bundle.emotion, bundle.risk, bundle.problem, metrics, []);
  const baseReport = formatEmotionReport(
    bundle.emotion,
    bundle.risk,
    bundle.problem,
    intervention.frameworkName
  );
  const report = `${baseReport}\n\n${formatStatisticalReportSection(statModel)}`;

  res.json({
    ...bundle,
    emotionStyle: getEmotionStyle(bundle.emotion.emotion),
    intervention: {
      frameworkId: intervention.frameworkId,
      frameworkName: intervention.frameworkName
    },
    carePlan,
    statModel,
    report,
    problemName: getCategoryName(bundle.problem.category)
  });
};
