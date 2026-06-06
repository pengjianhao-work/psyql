import {
  CarePlanSuggestion,
  EmotionAnalysis,
  InterventionInfo,
  ProblemAnalysis,
  PsychStatModel,
  RiskAssessment,
  EMOTION_NAMES,
  PROBLEM_CATEGORY_NAMES,
  RISK_LEVEL_NAMES
} from '../types';

export interface ReportQuickSummary {
  emotionLabel: string;
  riskLabel: string;
  problemLabel: string;
  oneLine: string;
  reliabilityPct: number | null;
  reliabilityHint: string;
  actionHint: string | null;
}

export function buildReportQuickSummary(
  emotion: EmotionAnalysis,
  risk: RiskAssessment,
  problem?: ProblemAnalysis,
  statModel?: PsychStatModel,
  carePlan?: CarePlanSuggestion,
  intervention?: InterventionInfo
): ReportQuickSummary {
  const emotionLabel = EMOTION_NAMES[emotion.emotion] || emotion.emotion;
  const riskLabel = RISK_LEVEL_NAMES[risk.level] || risk.level;
  const problemLabel = problem
    ? PROBLEM_CATEGORY_NAMES[problem.category] || problem.category
    : '未分类';

  const reliabilityPct =
    statModel?.compositeScores.modelConfidence ??
    (emotion.confidence > 0 ? Math.round(emotion.confidence * 100) : null);

  let reliabilityHint = '综合本次对话与历史数据的分析可靠程度';
  if (reliabilityPct !== null) {
    if (reliabilityPct < 45) {
      reliabilityHint = '可靠度偏低，结论仅供参考，建议结合自评或寻求专业评估';
    } else if (reliabilityPct < 70) {
      reliabilityHint = '可靠度中等，可结合下方详细报告理解';
    } else {
      reliabilityHint = '可靠度较高，仍不能替代专业诊断';
    }
  }

  const actionHint =
    risk.warningMessage ||
    carePlan?.suggestion?.slice(0, 48) ||
    (intervention ? `建议参考：${intervention.frameworkName}` : null);

  return {
    emotionLabel,
    riskLabel,
    problemLabel,
    oneLine: `${emotionLabel} · ${riskLabel}风险 · ${problemLabel}`,
    reliabilityPct,
    reliabilityHint,
    actionHint
  };
}

export function buildReportCopyText(
  summary: ReportQuickSummary,
  report: string,
  statModel?: PsychStatModel
): string {
  const session = statModel?.sessionIndex ?? statModel?.totalSessions;
  const lines = [
    '【心理港湾 · 咨询摘要】',
    session ? `咨询次数：第 ${session} 次` : '',
    `情绪状态：${summary.emotionLabel}`,
    `风险等级：${summary.riskLabel}`,
    `问题领域：${summary.problemLabel}`,
    summary.reliabilityPct !== null ? `分析可靠度：${summary.reliabilityPct}%` : '',
    summary.actionHint ? `关注提示：${summary.actionHint}` : '',
    '',
    '【详细报告】',
    report.trim()
  ];
  return lines.filter(Boolean).join('\n');
}
