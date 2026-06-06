export { DonutChart, type DonutSegment } from './DonutChart';
export { PsychRadarChart } from './PsychRadarChart';
export { FusionBarChart } from './FusionBarChart';
export { GaugeChart } from './GaugeChart';

const DONUT_PALETTE = [
  '#667eea',
  '#764ba2',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899'
];

export function paletteColor(index: number): string {
  return DONUT_PALETTE[index % DONUT_PALETTE.length];
}
