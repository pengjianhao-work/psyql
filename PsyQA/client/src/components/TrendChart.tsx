import React from 'react';
import { HistoryDataPoint } from '../types';

interface TrendChartProps {
  data: HistoryDataPoint[];
}

export const TrendChart: React.FC<TrendChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="chart-container">
        <h3 className="chart-title">📈 心理变化趋势</h3>
        <div className="chart-empty">
          <span className="chart-empty-icon" aria-hidden="true">📊</span>
          <p>开始对话后，这里会显示你的压力、焦虑与情绪平稳度变化</p>
        </div>
      </div>
    );
  }

  const padding = 36;
  const width = 560;
  const height = 220;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const maxValue = 100;
  const minValue = 0;

  const getX = (index: number) =>
    padding + (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth);
  const getY = (value: number) =>
    padding + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

  const stressPath = data
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(point.stressLevel)}`)
    .join(' ');

  const anxietyPath = data
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(point.anxietyLevel)}`)
    .join(' ');

  const moodPath = data
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(point.moodStability)}`)
    .join(' ');

  const latest = data[data.length - 1];

  return (
    <div className="chart-container">
      <div className="chart-head">
        <h3 className="chart-title">📈 心理变化趋势</h3>
        <div className="chart-latest-tags">
          <span className="chart-tag stress">压力 {latest.stressLevel}</span>
          <span className="chart-tag anxiety">焦虑 {latest.anxietyLevel}</span>
          <span className="chart-tag mood">平稳 {latest.moodStability}</span>
        </div>
      </div>
      <div className="chart-svg-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="trend-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="stressGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(244, 67, 54, 0.28)" />
              <stop offset="100%" stopColor="rgba(244, 67, 54, 0.04)" />
            </linearGradient>
            <linearGradient id="anxietyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 152, 0, 0.28)" />
              <stop offset="100%" stopColor="rgba(255, 152, 0, 0.04)" />
            </linearGradient>
            <linearGradient id="moodGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(76, 175, 80, 0.28)" />
              <stop offset="100%" stopColor="rgba(76, 175, 80, 0.04)" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((i) => {
            const y = padding + (chartHeight / 4) * i;
            const value = maxValue - (maxValue / 4) * i;
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e8ecf4" strokeDasharray="4" />
                <text x={padding - 8} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">
                  {value}
                </text>
              </g>
            );
          })}

          <path
            d={`${stressPath} L ${getX(data.length - 1)} ${height - padding} L ${padding} ${height - padding} Z`}
            fill="url(#stressGradient)"
          />
          <path d={stressPath} fill="none" stroke="#F44336" strokeWidth="2.5" strokeLinecap="round" />
          <path d={anxietyPath} fill="none" stroke="#FF9800" strokeWidth="2.5" strokeLinecap="round" />
          <path d={moodPath} fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" />

          {data.map((point, i) => (
            <g key={i}>
              <circle cx={getX(i)} cy={getY(point.stressLevel)} r="3.5" fill="#F44336" />
              <circle cx={getX(i)} cy={getY(point.anxietyLevel)} r="3.5" fill="#FF9800" />
              <circle cx={getX(i)} cy={getY(point.moodStability)} r="3.5" fill="#4CAF50" />
            </g>
          ))}
        </svg>
      </div>

      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#F44336' }} />
          <span>压力</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#FF9800' }} />
          <span>焦虑</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#4CAF50' }} />
          <span>情绪平稳度</span>
        </div>
      </div>
    </div>
  );
};
