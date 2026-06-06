import React from 'react';
import { getSessionReliability } from '../utils/sessionReliability';

interface SessionReliabilityBadgeProps {
  sessionCount: number;
  className?: string;
  showRounds?: boolean;
}

export const SessionReliabilityBadge: React.FC<SessionReliabilityBadgeProps> = ({
  sessionCount,
  className = '',
  showRounds = false
}) => {
  const info = getSessionReliability(sessionCount);

  return (
    <span
      className={`session-reliability-badge session-reliability-${info.tier} ${className}`.trim()}
      title={`当前累计咨询 ${sessionCount} 轮`}
    >
      {info.label}
      {showRounds && <small className="session-reliability-rounds"> · {sessionCount} 轮</small>}
    </span>
  );
};
