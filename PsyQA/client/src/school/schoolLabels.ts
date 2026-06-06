export const EMOTION_LABELS: Record<string, string> = {
  happy: '开心',
  sad: '低落',
  anxious: '焦虑',
  angry: '愤怒',
  lonely: '孤独',
  neutral: '平稳',
  hopeful: '充满希望',
  confused: '迷茫困惑',
  frustrated: '挫败',
  guilty: '内疚',
  shameful: '羞愧',
  proud: '自豪'
};

export const RISK_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重'
};

export function formatEmotion(value?: string | null): string {
  if (!value) return '—';
  return EMOTION_LABELS[value] ?? value;
}

export function formatRisk(value?: string | null): string {
  if (!value) return '—';
  return RISK_LABELS[value] ?? value;
}

export function riskClass(value?: string | null): string {
  if (value === 'critical' || value === 'high') return 'risk-high';
  if (value === 'medium') return 'risk-medium';
  return 'risk-low';
}

export function stressLevelClass(value: number): string {
  if (value >= 75) return 'stress-high';
  if (value >= 50) return 'stress-medium';
  return 'stress-low';
}
