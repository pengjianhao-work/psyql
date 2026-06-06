import React from 'react';

interface GaugeChartProps {
  title?: string;
  value: number;
  max?: number;
  label?: string;
  size?: number;
}

export const GaugeChart: React.FC<GaugeChartProps> = ({
  title = '综合异常度',
  value,
  max = 100,
  label,
  size = 160
}) => {
  const cx = size / 2;
  const cy = size * 0.58;
  const r = size * 0.38;
  const ratio = Math.min(1, Math.max(0, value / max));
  const startAngle = Math.PI;
  const endAngle = 0;
  const valueAngle = startAngle - ratio * Math.PI;

  const arc = (from: number, to: number, color: string, sw = 10) => {
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to);
    const y2 = cy + r * Math.sin(to);
    const large = from - to > Math.PI ? 1 : 0;
    return (
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    );
  };

  const needleX = cx + (r - 8) * Math.cos(valueAngle);
  const needleY = cy + (r - 8) * Math.sin(valueAngle);
  const levelColor = ratio >= 0.7 ? '#ef4444' : ratio >= 0.4 ? '#f59e0b' : '#22c55e';

  return (
    <div className="viz-chart viz-gauge">
      <h4 className="viz-chart-title">{title}</h4>
      <svg viewBox={`0 0 ${size} ${size * 0.72}`} className="viz-gauge-svg" role="img">
        {arc(startAngle, endAngle, '#f1f5f9', 12)}
        {ratio > 0 && arc(startAngle, valueAngle, levelColor, 12)}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="#334155" />
        <text x={cx} y={cy + 28} textAnchor="middle" className="viz-gauge-value">
          {value}
        </text>
        {label && (
          <text x={cx} y={cy + 44} textAnchor="middle" className="viz-gauge-label">
            {label}
          </text>
        )}
      </svg>
    </div>
  );
};
