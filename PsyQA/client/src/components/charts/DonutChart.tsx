import React from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  title?: string;
  segments: DonutSegment[];
  size?: number;
  emptyText?: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  title,
  segments,
  size = 200,
  emptyText = '暂无数据'
}) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return (
      <div className="viz-chart viz-donut viz-empty">
        {title && <h4 className="viz-chart-title">{title}</h4>}
        <p className="muted">{emptyText}</p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.38;
  const innerR = size * 0.24;
  const midR = (outerR + innerR) / 2;
  const strokeW = outerR - innerR;
  const circumference = 2 * Math.PI * midR;

  let cum = 0;
  const rings = segments.map((seg) => {
    const frac = seg.value / total;
    const dash = frac * circumference;
    const offset = -cum * circumference + circumference * 0.25;
    cum += frac;
    return { ...seg, dash, offset, pct: Math.round(frac * 100) };
  });

  return (
    <div className="viz-chart viz-donut">
      {title && <h4 className="viz-chart-title">{title}</h4>}
      <div className="viz-donut-body">
        <svg viewBox={`0 0 ${size} ${size}`} className="viz-donut-svg" role="img">
          <circle cx={cx} cy={cy} r={midR} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
          {rings.map((r) => (
            <circle
              key={r.label}
              cx={cx}
              cy={cy}
              r={midR}
              fill="none"
              stroke={r.color}
              strokeWidth={strokeW}
              strokeDasharray={`${r.dash} ${circumference - r.dash}`}
              strokeDashoffset={r.offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" className="viz-donut-center-num">
            {total}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="viz-donut-center-label">
            合计
          </text>
        </svg>
        <ul className="viz-donut-legend">
          {rings.map((r) => (
            <li key={r.label}>
              <span className="viz-legend-dot" style={{ background: r.color }} />
              <span>{r.label}</span>
              <span className="viz-legend-pct">{r.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
