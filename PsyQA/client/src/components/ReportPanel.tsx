import React, { useState } from 'react';
import {
  EmotionAnalysis,
  RiskAssessment,
  EmotionStyle,
  ProblemAnalysis,
  InterventionInfo,
  CarePlanSuggestion,
  PsychStatModel,
  EMOTION_NAMES,
  PROBLEM_CATEGORY_NAMES,
  RISK_LEVEL_NAMES,
  STATS_RELIABILITY_NAMES,
  TREND_DIRECTION_NAMES,
  TrendDirection
} from '../types';
import { renderFormattedReport } from '../utils/formatReportText';
import {
  DonutChart,
  FusionBarChart,
  GaugeChart,
  PsychRadarChart,
  paletteColor
} from './charts';

interface ReportPanelProps {
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem?: ProblemAnalysis;
  intervention?: InterventionInfo;
  carePlan?: CarePlanSuggestion;
  analysisSources?: { emotion: string; risk: string; problem: string };
  llmUsed?: boolean;
  emotionStyle: EmotionStyle;
  report: string;
  statModel?: PsychStatModel;
  reportPending?: boolean;
  shareContext?: {
    userLabel?: string;
    sessionIndex?: number;
    studentLabel?: string;
    orgName?: string;
    className?: string;
    studentNo?: string;
    allowSchoolTranscriptView?: boolean;
  };
}

const trendColor = (trend: TrendDirection): string => {
  if (trend === 'improving') return '#4CAF50';
  if (trend === 'worsening') return '#F44336';
  if (trend === 'stable') return '#607D8B';
  return '#9E9E9E';
};

const metricBarColor = (value: number, invert = false): string => {
  const v = invert ? 100 - value : value;
  if (v >= 75) return '#F44336';
  if (v >= 55) return '#FF9800';
  if (v >= 30) return '#FFC107';
  return '#4CAF50';
};

const riskColors: Record<string, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0'
};

export const ReportPanel: React.FC<ReportPanelProps> = ({
  emotion,
  risk,
  problem,
  intervention,
  carePlan,
  analysisSources,
  llmUsed,
  reportPending,
  emotionStyle,
  report,
  statModel
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showStats, setShowStats] = useState(Boolean(statModel));

  const lowConfidence = emotion.confidence < 0.45;

  const handleExport = () => {
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `心理咨询报告_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderMetricBar = (
    label: string,
    detail: { value: number; levelText: string; percentile?: number; baselineDelta?: number },
    invert = false
  ) => (
    <div className="stat-metric-row" key={label}>
      <div className="stat-metric-head">
        <span className="stat-metric-label">{label}</span>
        <span className="stat-metric-value">
          {detail.value}
          <small> / 100</small>
        </span>
      </div>
      <div className="stat-bar-track">
        <div
          className="stat-bar-fill"
          style={{
            width: `${detail.value}%`,
            backgroundColor: metricBarColor(detail.value, invert)
          }}
        />
      </div>
      <div className="stat-metric-meta">
        <span className="stat-level-text">{detail.levelText}</span>
        {detail.percentile !== undefined && <span>历史分位 P{detail.percentile}</span>}
        {detail.baselineDelta !== undefined && (
          <span className="stat-baseline-delta">
            较基线 {detail.baselineDelta > 0 ? '+' : ''}
            {detail.baselineDelta}
          </span>
        )}
      </div>
    </div>
  );

  const problemName = problem
    ? PROBLEM_CATEGORY_NAMES[problem.category] || problem.category
    : '—';

  return (
    <div className="report-panel report-panel-enhanced">
      <div
        className="report-header"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => e.key === 'Enter' && setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
      >
        <div className="report-title">
          <span className="report-icon">{'\uD83D\uDCCB'}</span>
          <span>心理咨询报告</span>
          {statModel && (
            <span className="report-session-badge">
              第 {statModel.sessionIndex} 次 · 置信 {statModel.compositeScores.modelConfidence}%
            </span>
          )}
          {llmUsed && <span className="report-llm-badge">大模型辅助</span>}
          {reportPending && <span className="report-llm-badge portrait-pending">报告生成中</span>}
        </div>
        <div className="report-toggle">{isExpanded ? '\u25BC' : '\u25B6'}</div>
      </div>

      {isExpanded && (
        <div className="report-content report-content-scroll">
          {lowConfidence && (
            <div className="report-disclaimer">
              情绪识别置信度较低，以下分析仅供参考，如有持续困扰建议寻求专业心理评估。
            </div>
          )}

          <div className="report-overview-grid">
            <div className="report-overview-card" style={{ borderTopColor: emotionStyle.color }}>
              <span className="report-overview-label">情绪状态</span>
              <strong className="report-overview-value">{EMOTION_NAMES[emotion.emotion] || emotion.emotion}</strong>
              <span className="report-overview-meta">置信 {(emotion.confidence * 100).toFixed(0)}%</span>
              {emotion.keywords.length > 0 && (
                <div className="report-overview-tags">
                  {emotion.keywords.slice(0, 4).map((kw) => (
                    <span key={kw} className="report-mini-tag">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="report-overview-card report-overview-problem">
              <span className="report-overview-label">问题领域</span>
              <strong className="report-overview-value">{problemName}</strong>
              {problem && problem.confidence > 0 && (
                <span className="report-overview-meta">置信 {(problem.confidence * 100).toFixed(0)}%</span>
              )}
              {problem && problem.subcategories.length > 0 && (
                <p className="report-overview-hint">可能涉及：{problem.subcategories.slice(0, 3).join('、')}</p>
              )}
            </div>

            <div className="report-overview-card" style={{ borderTopColor: riskColors[risk.level] }}>
              <span className="report-overview-label">风险等级</span>
              <strong className="report-overview-value" style={{ color: riskColors[risk.level] }}>
                {RISK_LEVEL_NAMES[risk.level]}
              </strong>
              {risk.warningMessage ? (
                <p className="report-overview-warn">{risk.warningMessage}</p>
              ) : (
                <span className="report-overview-meta">当前未见高危信号</span>
              )}
            </div>
          </div>

          <div className="report-greeting-block" style={{ borderLeftColor: emotionStyle.color }}>
            <span className="report-greeting-emoji">{emotionStyle.emoji}</span>
            <div>
              <p className="report-greeting-text">{emotionStyle.greeting}</p>
              <p className="report-greeting-tone">咨询语气：{emotionStyle.tone}</p>
            </div>
          </div>

          {(intervention || carePlan) && (
            <div className="report-guidance-row">
              {intervention && (
                <div className="report-guidance-card">
                  <span className="report-guidance-label">干预框架</span>
                  <strong>{intervention.frameworkName}</strong>
                </div>
              )}
              {carePlan && (
                <div className="report-guidance-card report-guidance-care">
                  <span className="report-guidance-label">{carePlan.categoryName} · 关怀建议</span>
                  <p>{carePlan.suggestion}</p>
                </div>
              )}
            </div>
          )}

          <div className="report-section report-narrative-section">
            <div className="section-title">详细分析报告</div>
            <div className="report-narrative-panel">{renderFormattedReport(report)}</div>
          </div>

          {risk.hotline && (
            <div className="report-hotline-bar">
              <span>心理援助热线</span>
              <strong>{risk.hotline}</strong>
            </div>
          )}

          {statModel && (
            <div className="report-section report-stats-section">
              <button
                type="button"
                className="report-stats-toggle"
                onClick={() => setShowStats((v) => !v)}
              >
                <span>统计建模与趋势</span>
                <span className={`stat-reliability stat-reliability-${statModel.statsReliability}`}>
                  {STATS_RELIABILITY_NAMES[statModel.statsReliability]}
                </span>
                <span>{showStats ? '\u25BC' : '\u25B6'}</span>
              </button>

              {showStats && (
                <div className="stat-model-section">
                  {!statModel.showAdvancedStats && statModel.totalSessions < 5 && (
                    <p className="stat-sample-hint">
                      再咨询 {5 - statModel.totalSessions} 次后将展示相关分析与波动统计（当前{' '}
                      {statModel.totalSessions} 次）。
                    </p>
                  )}

                  <div className="stat-composite-grid">
                    <div className="stat-composite-card">
                      <span className="stat-composite-label">风险量化分</span>
                      <strong>{statModel.compositeScores.riskScore}</strong>
                    </div>
                    <div className="stat-composite-card">
                      <span className="stat-composite-label">情绪强度</span>
                      <strong>{statModel.compositeScores.emotionIntensity}</strong>
                    </div>
                    <div className="stat-composite-card">
                      <span className="stat-composite-label">问题显著度</span>
                      <strong>{statModel.compositeScores.problemSalience}</strong>
                    </div>
                    <div className="stat-composite-card">
                      <span className="stat-composite-label">模型置信度</span>
                      <strong>{statModel.compositeScores.modelConfidence}%</strong>
                    </div>
                  </div>

                  {statModel && (
                    <div className="stat-viz-grid">
                      <PsychRadarChart
                        title="心理指数雷达图"
                        metrics={[
                          { label: '压力', value: statModel.indices.stress.value },
                          { label: '焦虑', value: statModel.indices.anxiety.value },
                          { label: '平稳', value: statModel.indices.moodStability.value },
                          { label: '困扰', value: statModel.indices.distress.value },
                          { label: '幸福', value: statModel.indices.wellbeing.value },
                          { label: '功能', value: statModel.indices.functionalCapacity.value }
                        ]}
                      />
                      {statModel.distributions.emotionFreq.length > 0 && (
                        <DonutChart
                          title="累计情绪分布"
                          segments={statModel.distributions.emotionFreq.map((e, i) => ({
                            label: e.emotion,
                            value: e.count,
                            color: paletteColor(i)
                          }))}
                        />
                      )}
                      {statModel.intelligentModel && (
                        <FusionBarChart
                          layers={[
                            {
                              name: '统计',
                              distress: statModel.intelligentModel.layerScores.statistical.distress,
                              color: '#94a3b8'
                            },
                            {
                              name: 'ML',
                              distress: statModel.intelligentModel.layerScores.ml.distress,
                              color: '#667eea'
                            },
                            {
                              name: '神经网络',
                              distress: statModel.intelligentModel.layerScores.neural.distress,
                              color: '#764ba2'
                            },
                            {
                              name: '融合',
                              distress: statModel.intelligentModel.layerScores.fused.distress,
                              color: '#f59e0b'
                            }
                          ]}
                        />
                      )}
                      {statModel.showAdvancedStats && statModel.advancedMathematics && (
                        <GaugeChart
                          value={statModel.advancedMathematics.anomalyScore}
                          label={statModel.advancedMathematics.emotionEntropyNote}
                        />
                      )}
                    </div>
                  )}

                  {statModel.intelligentModel && (
                    <div className="intelligent-model-block">
                      <div className="stat-subtitle">三层智能融合（统计 + ML + 神经网络）</div>
                      <p className="intelligent-attribution">{statModel.intelligentModel.primaryConcern}</p>
                      <div className="stat-layer-scores">
                        <span>融合困扰 {statModel.intelligentModel.layerScores.fused.distress}</span>
                        <span>聚类 {statModel.intelligentModel.mlCluster}</span>
                        <span>
                          预测下轮 压力 {statModel.intelligentModel.predictions.nextStress} / 焦虑{' '}
                          {statModel.intelligentModel.predictions.nextAnxiety}
                        </span>
                      </div>
                    </div>
                  )}

                  {statModel.showAdvancedStats && statModel.advancedMathematics && (
                    <div className="stat-advanced-math-block">
                      <div className="stat-subtitle">高阶数学指标</div>
                      <ul className="stat-math-list">
                        <li>
                          Shannon 熵 H = {statModel.advancedMathematics.emotionEntropy} bit —{' '}
                          {statModel.advancedMathematics.emotionEntropyNote}
                        </li>
                        <li>
                          自相关 ρ(1)：压力 {statModel.advancedMathematics.stressAutocorr}，焦虑{' '}
                          {statModel.advancedMathematics.anxietyAutocorr}
                        </li>
                        <li>
                          Z 分数：压力 Z = {statModel.advancedMathematics.stressZScore}，焦虑 Z ={' '}
                          {statModel.advancedMathematics.anxietyZScore}
                        </li>
                        <li>
                          马氏距离 d_M = {statModel.advancedMathematics.mahalanobisDistance}，卡尔曼压力估计 ={' '}
                          {statModel.advancedMathematics.kalmanStressEstimate}
                        </li>
                        <li>综合异常度 {statModel.advancedMathematics.anomalyScore}/100</li>
                      </ul>
                    </div>
                  )}

                  <div className="stat-metrics-grid">
                    {renderMetricBar('压力指数', statModel.indices.stress)}
                    {renderMetricBar('焦虑指数', statModel.indices.anxiety)}
                    {renderMetricBar('情绪平稳度', statModel.indices.moodStability, true)}
                    {renderMetricBar('心理困扰度', statModel.indices.distress)}
                  </div>

                  {statModel.trends.length > 0 && (
                    <div className="stat-trends-block">
                      <div className="stat-subtitle">时序趋势</div>
                      <div className="stat-trends-table stat-trends-compact">
                        {statModel.trends.map((t) => (
                          <div className="stat-trend-row" key={t.metricKey}>
                            <span className="stat-trend-name">{t.metric}</span>
                            <span className="stat-trend-current">{t.current}</span>
                            <span className="stat-trend-delta">
                              {t.delta !== undefined ? `${t.delta > 0 ? '+' : ''}${t.delta}` : '—'}
                            </span>
                            <span className="stat-trend-dir" style={{ color: trendColor(t.trend) }}>
                              {TREND_DIRECTION_NAMES[t.trend]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <ul className="stat-summary-list">
                    {statModel.summaryLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {(analysisSources || llmUsed !== undefined) && (
            <p className="report-tech-line">
              分析来源：情绪 {analysisSources?.emotion || 'rule'} · 风险 {analysisSources?.risk || 'rule'} · 问题{' '}
              {analysisSources?.problem || 'rule'}
              {llmUsed ? ' · 已启用 LLM' : ''}
            </p>
          )}

          <div className="report-actions">
            <button type="button" className="action-btn export-btn" onClick={handleExport}>
              导出完整报告
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
