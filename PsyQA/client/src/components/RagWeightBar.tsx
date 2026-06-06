import React from 'react';
import type { AgentProfilePayload } from '../api';

const MILESTONES = [
  { month: 0, label: '0月', user: 30 },
  { month: 6, label: '6月', user: 45 },
  { month: 18, label: '18月', user: 70 },
  { month: 24, label: '24月', user: 85 }
];

interface RagWeightBarProps {
  weights: AgentProfilePayload['ragWeights'];
}

export const RagWeightBar: React.FC<RagWeightBarProps> = ({ weights }) => {
  const userPct = Math.round(weights.user * 100);
  const pubPct = Math.round(weights.public * 100);
  const timelinePct = Math.round(weights.timelineUser * 100);
  const boostPct = Math.round(weights.memoryBoost * 100);
  const progressPct = Math.min(100, (weights.monthsElapsed / 24) * 100);
  const markerLeft = `${progressPct}%`;

  return (
    <div className="rag-weight-viz">
      <div className="rag-weight-head">
        <strong
          title={`私有权重 = 时间轴权重(${timelinePct}%) + 记忆密度加成(${boostPct}%)\n阶段：${weights.label}\n规则：0月30% → 6月45% → 18月70% → 24月85%`}
        >
          RAG 权重 · 动态混合
        </strong>
        <span className="rag-weight-meta">
          第 {weights.monthsElapsed} 月 · {weights.memoryCount} 条私有记忆
        </span>
      </div>

      <div className="rag-weight-bar" role="img" aria-label={`私有记忆 ${userPct}%，公共知识 ${pubPct}%`}>
        <div className="rag-weight-user" style={{ width: `${userPct}%` }}>
          <span>私有 {userPct}%</span>
        </div>
        <div className="rag-weight-public" style={{ width: `${pubPct}%` }}>
          <span>公共 {pubPct}%</span>
        </div>
      </div>

      <div className="rag-weight-breakdown">
        <span>时间轴 {timelinePct}%</span>
        {boostPct > 0 && <span>记忆加成 +{boostPct}%</span>}
      </div>

      <div className="rag-weight-timeline">
        <div className="rag-weight-track">
          {MILESTONES.map((m) => (
            <span
              key={m.month}
              className="rag-weight-milestone"
              style={{ left: `${(m.month / 24) * 100}%` }}
              title={`${m.label}：约 ${m.user}% 私有权重`}
            >
              {m.label}
            </span>
          ))}
          <span
            className="rag-weight-now"
            style={{ left: markerLeft }}
            title={`当前第 ${weights.monthsElapsed} 月`}
          />
        </div>
        <p className="rag-weight-timeline-hint">随咨询时长与记忆沉淀，私有检索权重连续上升（24 个月达峰值）</p>
      </div>
    </div>
  );
};
