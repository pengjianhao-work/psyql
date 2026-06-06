/** 按累计咨询轮数划分模型/画像可靠性 */
export type SessionReliabilityTier = 'reference' | 'moderate' | 'high';

export interface SessionReliabilityInfo {
  label: string;
  tier: SessionReliabilityTier;
  /** 与 statModel.statsReliability 对齐 */
  statsKey: 'low' | 'medium' | 'high';
}

/** 不足 20 轮 → 仅供参考；20–50 轮 → 较为可靠；大于 50 轮 → 相当可靠 */
export function getSessionReliability(rounds: number): SessionReliabilityInfo {
  const n = Math.max(0, Math.floor(rounds));
  if (n > 50) {
    return { label: '相当可靠', tier: 'high', statsKey: 'high' };
  }
  if (n >= 20) {
    return { label: '较为可靠', tier: 'moderate', statsKey: 'medium' };
  }
  return { label: '仅供参考', tier: 'reference', statsKey: 'low' };
}
