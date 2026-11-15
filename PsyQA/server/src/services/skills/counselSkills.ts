/**
 * 咨询 skill 注册表（第一阶段：守卫收敛）。
 *
 * 一个 skill 描述"这类问题允许注入哪些背景上下文"。选择是确定性的，
 * 只看规则层已有信号（risk.level / intent.kind / 时效性判定），不调 LLM，
 * 因此危机路径不可能被 skill 机制绕过。
 *
 * 消费方：
 * - answerOrchestrator：决定预取 Promise 发不发（rule 信号）
 * - reactCounselAgent executeTool：决定工具返回注入还是拒绝文案（融合后 risk）
 *
 * 工具白名单暂不收敛（用户决定危机不额外禁用工具），这里只管背景注入。
 */

import type { RiskLevel, ProblemCategory } from '../psych/emotionService';
import type { IntentKind } from '../psych/intentService';

export interface CounselSkillContext {
  riskLevel: RiskLevel;
  intentKind?: IntentKind | string;
  category?: ProblemCategory;
  /** needsFreshWebSearch(fullText) 的结果，只影响 web 预取 */
  freshInfo?: boolean;
}

export interface CounselSkill {
  id: 'crisis' | 'default';
  /** 允许注入内部主题背景（wiki 主题页、本周热点词条） */
  topicBackground: boolean;
  /** 允许联网补时效背景（另需 freshInfo=true 才真正发起） */
  web: boolean;
}

const CRISIS_SKILL: CounselSkill = { id: 'crisis', topicBackground: false, web: false };
const DEFAULT_SKILL: CounselSkill = { id: 'default', topicBackground: true, web: true };

/** 危机/高风险判定：规则层 risk 或 intent 命中都算。 */
export function isSafetyContext(riskLevel: RiskLevel, intentKind?: string): boolean {
  return (
    riskLevel === 'high' ||
    riskLevel === 'critical' ||
    intentKind === 'crisis'
  );
}

export function resolveCounselSkill(ctx: CounselSkillContext): CounselSkill {
  if (isSafetyContext(ctx.riskLevel, ctx.intentKind)) return CRISIS_SKILL;
  return DEFAULT_SKILL;
}

/** 这轮是否要发起联网预取：skill 允许 + 问题确实是时效性。 */
export function shouldPrefetchWeb(skill: CounselSkill, freshInfo: boolean): boolean {
  return skill.web && freshInfo;
}
