import React from 'react';

interface RadarMetric {
  label: string;
  value: number;
  max?: number;
}

interface PsychRadarChartProps {
  title?: string;
  metrics: RadarMetric[];
  size?: number;
}

const DEFAULT_COLORS = ['#667eea', '#764ba2'];

export const PsychRadarChart: React.FC<PsychRadarChartProps> = ({
  title = '心理指数雷达',
  metrics,
  size = 240
}) => {
  if (metrics.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36;
  const levels = [0.25, 0.5, 0.75, 1];
  const n = metrics.length;

  const pointAt = (index: number, ratio: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = maxR * ratio;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), angle };
  };

  const dataPoints = metrics.map((m, i) => {
    const ratio = Math.min(1, Math.max(0, m.value / (m.max ?? 100)));
    return pointAt(i, ratio);
  });

  const polygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="viz-chart viz-radar">
      <h4 className="viz-chart-title">{title}</h4>
      <svg viewBox={`0 0 ${size} ${size}`} className="viz-radar-svg" role="img">
        <defs>
          <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={DEFAULT_COLORS[0]} stopOpacity="0.35" />
            <stop offset="100%" stopColor={DEFAULT_COLORS[1]} stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {levels.map((lv) => (
          <polygon
            key={lv}
            points={metrics.map((_, i) => {
              const p = pointAt(i, lv);
              return `${p.x},${p.y}`;
            }).join(' ')}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}
        {metrics.map((m, i) => {
          const p = pointAt(i, 1);
          const labelR = maxR + 18;
          const lx = cx + labelR * Math.cos(p.angle);
          const ly = cy + labelR * Math.sin(p.angle);
          return (
            <g key={m.label}>
              <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="1" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="viz-radar-label"
              >
                {m.label}
              </text>
              <text
                x={lx}
                y={ly + 12}
                textAnchor="middle"
                className="viz-radar-value"
              >
                {m.value}
              </text>
            </g>
          );
        })}
        <polygon points={polygon} fill="url(#radarFill)" stroke="#667eea" strokeWidth="2" />
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#667eea" stroke="#fff" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
};
