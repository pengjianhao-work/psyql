import React from 'react';
import { EmotionAnalysis, ProblemAnalysis, RiskAssessment, PsychStatModel } from '../types';
import { buildReportQuickSummary } from '../utils/reportSummary';

interface Props {
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem?: ProblemAnalysis;
  statModel?: PsychStatModel;
  implicitNeeds?: Array<{ implicitConcern: string; suggestedPrompt: string }>;
  reportText?: string;
}

export const ReportSummaryCards: React.FC<Props> = ({
  emotion,
  risk,
  problem,
  statModel,
  implicitNeeds,
  reportText
}) => {
  const quick = buildReportQuickSummary(emotion, risk, problem, statModel);

  const cards = [
    { title: '核心情绪', body: quick.emotionLabel, sub: quick.reliabilityHint },
    { title: '风险等级', body: quick.riskLabel, sub: risk.warningMessage?.slice(0, 60) || '暂无高危信号' },
    {
      title: '关注领域',
      body: quick.problemLabel,
      sub: quick.actionHint || '结合下方详细报告理解'
    }
  ];

  if (implicitNeeds?.length) {
    cards.push({
      title: '隐性提示',
      body: implicitNeeds[0].implicitConcern,
      sub: implicitNeeds[0].suggestedPrompt
    });
  } else if (reportText && /改善|建议|关注/.test(reportText)) {
    const line = reportText.split('\n').find((l) => /建议|关注|改善/.test(l));
    if (line) {
      cards.push({ title: '报告要点', body: line.slice(0, 48), sub: '摘自完整报告' });
    }
  }

  return (
    <div className="report-summary-cards">
      <h4 className="report-summary-title">智能摘要 · 3 条核心结论</h4>
      <div className="report-summary-grid">
        {cards.slice(0, 3).map((c) => (
          <article key={c.title} className="report-summary-card">
            <span className="report-summary-card-title">{c.title}</span>
            <strong>{c.body}</strong>
            <p className="muted">{c.sub}</p>
          </article>
        ))}
      </div>
    </div>
  );
};
