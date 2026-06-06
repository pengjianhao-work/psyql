import type { UserProgress } from '../types';

const RISK_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

/** 最近 3 次咨询风险连续升高，或压力指标连续上升 */
export function shouldShowTrendCareAlert(progress: UserProgress | null | undefined): {
  show: boolean;
  reason: string;
} {
  if (!progress?.history?.length || progress.history.length < 3) {
    return { show: false, reason: '' };
  }

  const recent = progress.history.slice(-3);
  const risks = recent.map((h) => RISK_ORDER[h.risk || 'low'] ?? 0);
  const riskWorsening =
    risks[0] < risks[1] && risks[1] <= risks[2] && risks[2] >= 1;

  const stresses = recent.map((h) => h.stressLevel).filter((v): v is number => typeof v === 'number');
  const stressWorsening =
    stresses.length === 3 && stresses[0] < stresses[1] && stresses[1] < stresses[2];

  if (riskWorsening) {
    return {
      show: true,
      reason: '最近 3 次对话风险等级呈上升趋势，建议关注自身状态并考虑联系辅导员或心理中心。'
    };
  }
  if (stressWorsening) {
    return {
      show: true,
      reason: '最近 3 次压力指数连续升高，可以试试放松练习或预约校内心理咨询。'
    };
  }
  return { show: false, reason: '' };
}
