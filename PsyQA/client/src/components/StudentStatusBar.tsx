import React from 'react';
import { QuestionResponse } from '../types';

interface StudentStatusBarProps {
  consultCount: number;
  latestReport: {
    emotion?: QuestionResponse['emotion'];
    risk?: QuestionResponse['risk'];
    statModel?: QuestionResponse['statModel'];
  } | null;
  portraitPending?: boolean;
  reportPending?: boolean;
  onRefreshInsights?: () => void;
  refreshing?: boolean;
}

const RISK_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重'
};

export const StudentStatusBar: React.FC<StudentStatusBarProps> = ({
  consultCount,
  latestReport,
  portraitPending,
  reportPending,
  onRefreshInsights,
  refreshing
}) => {
  const emotion = latestReport?.emotion?.emotion;
  const risk = latestReport?.risk?.level;
  const sessions = latestReport?.statModel?.totalSessions ?? consultCount;

  return (
    <div className="student-status-bar" role="status">
      <div className="student-status-metrics">
        <span className="student-status-chip">
          <strong>{sessions}</strong> 次咨询
        </span>
        {emotion && (
          <span className="student-status-chip">
            近期情绪 <strong>{emotion}</strong>
          </span>
        )}
        {risk && (
          <span className={`student-status-chip risk-${risk}`}>
            风险关注 <strong>{RISK_LABELS[risk] || risk}</strong>
          </span>
        )}
        {portraitPending && (
          <span className="student-status-chip portrait-pending">
            咨询画像生成中…
          </span>
        )}
        {reportPending && (
          <span className="student-status-chip report-pending">
            详细报告生成中…
          </span>
        )}
      </div>
      {onRefreshInsights && (
        <button
          type="button"
          className="student-status-refresh"
          onClick={onRefreshInsights}
          disabled={refreshing}
        >
          {refreshing ? '刷新中…' : '刷新报告与趋势'}
        </button>
      )}
    </div>
  );
};
