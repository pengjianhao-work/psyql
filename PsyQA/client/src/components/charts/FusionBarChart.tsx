import React from 'react';

interface FusionBarChartProps {
  title?: string;
  layers: Array<{ name: string; distress: number; color: string }>;
  width?: number;
  height?: number;
}

export const FusionBarChart: React.FC<FusionBarChartProps> = ({
  title = '三层融合 · 困扰度对比',
  layers,
  width = 320,
  height = 180
}) => {
  if (!layers.length) return null;

  const padding = { top: 16, right: 12, bottom: 36, left: 36 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = 100;
  const barW = chartW / layers.length - 12;

  return (
    <div className="viz-chart viz-bar-group">
      <h4 className="viz-chart-title">{title}</h4>
      <svg viewBox={`0 0 ${width} ${height}`} className="viz-bar-svg" role="img">
        {[0, 25, 50, 75, 100].map((v) => {
          const y = padding.top + chartH - (v / maxVal) * chartH;
          return (
            <g key={v}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#eef2f7"
                strokeDasharray="3"
              />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" className="viz-axis-label">
                {v}
              </text>
            </g>
          );
        })}
        {layers.map((layer, i) => {
          const x = padding.left + i * (chartW / layers.length) + 6;
          const h = (layer.distress / maxVal) * chartH;
          const y = padding.top + chartH - h;
          return (
            <g key={layer.name}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx="6"
                fill={layer.color}
                opacity="0.88"
              />
              <text
                x={x + barW / 2}
                y={y - 6}
                textAnchor="middle"
                className="viz-bar-value"
              >
                {layer.distress}
              </text>
              <text
                x={x + barW / 2}
                y={height - 10}
                textAnchor="middle"
                className="viz-bar-label"
              >
                {layer.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
