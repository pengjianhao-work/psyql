import React from 'react';
import { ConversationPortrait } from '../types';

interface ConversationPortraitPanelProps {
  portrait: ConversationPortrait;
  compact?: boolean;
  sessionCount?: number;
  pending?: boolean;
}

const CONFIDENCE_LABEL: Record<ConversationPortrait['confidence'], string> = {
  low: '参考级',
  medium: '较可靠',
  high: '高置信'
};

export const ConversationPortraitPanel: React.FC<ConversationPortraitPanelProps> = ({
  portrait,
  compact = false,
  sessionCount,
  pending = false
}) => {
  const tagBlock = (title: string, items: string[], className = 'portrait-tag') => {
    if (!items.length) return null;
    return (
      <div className="portrait-tag-block">
        <span className="portrait-tag-label">{title}</span>
        <div className="portrait-tags">
          {items.map((item) => (
            <span key={item} className={className}>
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`conversation-portrait ${compact ? 'compact' : ''}`}>
      <div className="portrait-head">
        <div className="portrait-title-row">
          <span className="portrait-icon">🧭</span>
          <h3>本次咨询画像</h3>
          <span className={`portrait-confidence portrait-confidence-${portrait.confidence}`}>
            {CONFIDENCE_LABEL[portrait.confidence]}
          </span>
          {portrait.llmUsed && <span className="portrait-llm-badge">大模型生成</span>}
          {pending && <span className="portrait-llm-badge portrait-pending">生成中</span>}
          {sessionCount !== undefined && sessionCount > 0 && (
            <span className="portrait-session-badge">累计 {sessionCount} 次</span>
          )}
        </div>
        <p className="portrait-disclaimer">基于对话内容的辅助理解，非医学诊断，仅供自我觉察与关怀参考。</p>
      </div>

      <p className="portrait-summary">{portrait.summary}</p>

      {!compact && (
        <>
          <div className="portrait-emotion-line">
            <strong>情绪呈现：</strong>
            {portrait.emotionalPresentation}
          </div>

          {tagBlock('核心困扰', portrait.coreConcerns, 'portrait-tag concern')}
          {tagBlock('观察到的模式', portrait.observedPatterns, 'portrait-tag pattern')}
          {tagBlock('资源与优势', portrait.strengths, 'portrait-tag strength')}
          {tagBlock('支持需求', portrait.supportNeeds, 'portrait-tag support')}

          <div className="portrait-focus">
            <span className="portrait-focus-label">建议关注</span>
            <p>{portrait.recommendedFocus}</p>
          </div>
        </>
      )}
    </div>
  );
};

export const PortraitHistoryList: React.FC<{
  items: Array<{ time: string; summary: string; llmUsed?: boolean; group?: string }>;
}> = ({ items }) => {
  if (!items.length) {
    return <p className="muted portrait-history-empty">完成咨询后将在此展示历次画像摘要</p>;
  }

  return (
    <ul className="portrait-history-list">
      {items.map((item) => (
        <li key={item.time} className="portrait-history-item">
          <div className="portrait-history-meta">
            <time>{item.time}</time>
            {item.group && <span className="portrait-history-group">{item.group}</span>}
            {item.llmUsed && <span className="portrait-llm-badge small">LLM</span>}
          </div>
          <p>{item.summary}</p>
        </li>
      ))}
    </ul>
  );
};
