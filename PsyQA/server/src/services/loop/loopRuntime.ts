/**
 * 心理闭环 runtime（模式路由 + 有界执行）。
 *
 * 与 reactCounselAgent 的分工：ReAct 负责自由倾诉对话；本 runtime 负责
 * 结构化闭环（签到→计划→行动→复盘）与危机前置判定，输出为确定性模板，
 * LLM 侧写留待评测恢复后接入，不先上车后补票。
 *
 * 不变量：
 * - safety_check 永远是第一个执行的工具，结果 high/critical 立即返回安全
 *   模板（含热线 + 用户自写的 safety_plan），不做任何普通闭环操作；
 * - 工具调用有 MAX_STEPS 上限与整体时间预算，写操作必须经工具层校验；
 * - 回复模板不诊断、不堆清单，一次只给一个可选下一步。
 */
import { executeLoopTool, type LoopToolName } from './loopAgentTools';
import { getActivePlan, type SupportPlan } from './supportPlanService';
import { getSafetyPlan, type SafetyPlan } from './reflectionService';
import type { RiskLevel } from '../psych/emotionService';
import type { UserSignal } from '../signals/userSignalService';

export const LOOP_MAX_STEPS = 5;
export const LOOP_TIME_BUDGET_MS = 3_000;

export interface LoopTurnResult {
  mode: 'safety' | 'support';
  riskLevel: RiskLevel;
  reply: string;
  toolsUsed: LoopToolName[];
  steps: number;
  /** 普通模式下的可选项（不强迫）：练习建议 + 当前计划摘要 */
  suggestions?: {
    practice: { title: string; body: string | null }[];
    activePlan: { goal: string; pendingActions: string[] } | null;
    recentSignals: number;
  };
  safetyPlan?: SafetyPlan | null;
}

export function runLoopTurn(userId: string, text: string): LoopTurnResult {
  const t0 = Date.now();
  const toolsUsed: LoopToolName[] = [];

  // 第一步永远是 safety_check——不可被任何参数跳过
  const safety = executeLoopTool(userId, 'safety_check', { text });
  toolsUsed.push('safety_check');
  const risk = (safety.output as { level: RiskLevel; hotline: string; warningMessage: string });

  if (risk.level === 'high' || risk.level === 'critical') {
    const safetyPlan = getSafetyPlan(userId);
    return {
      mode: 'safety',
      riskLevel: risk.level,
      reply: buildSafetyReply(risk, safetyPlan),
      toolsUsed,
      steps: 1,
      safetyPlan
    };
  }

  // 普通路径：信号 → 计划 → 练习建议（预算内最多 LOOP_MAX_STEPS 个工具）
  const suggestions: NonNullable<LoopTurnResult['suggestions']> = {
    practice: [],
    activePlan: null,
    recentSignals: 0
  };
  const ctx = { riskLevel: risk.level };

  if (budgetLeft(t0)) {
    const sig = executeLoopTool(userId, 'get_recent_signals', { limit: 10 }, ctx);
    toolsUsed.push('get_recent_signals');
    if (sig.ok) suggestions.recentSignals = (sig.output as UserSignal[]).length;
  }
  if (budgetLeft(t0)) {
    const plan = getActivePlan(userId);
    if (plan) suggestions.activePlan = planSummary(plan);
  }
  if (budgetLeft(t0)) {
    const prac = executeLoopTool(userId, 'suggest_practice', {}, ctx);
    toolsUsed.push('suggest_practice');
    if (prac.ok) {
      suggestions.practice = (prac.output as { items: { title: string; body: string | null }[] }).items;
    }
  }

  return {
    mode: 'support',
    riskLevel: risk.level,
    reply: buildSupportReply(text, suggestions),
    toolsUsed,
    steps: toolsUsed.length,
    suggestions,
    safetyPlan: null
  };
}

const budgetLeft = (t0: number): boolean => Date.now() - t0 < LOOP_TIME_BUDGET_MS;

function planSummary(plan: SupportPlan): { goal: string; pendingActions: string[] } {
  const today = new Date().toISOString().slice(0, 10);
  return {
    goal: plan.goalText,
    pendingActions: plan.actions
      .filter((a) => a.status === 'pending' && (!a.day || a.day <= today))
      .slice(0, 3)
      .map((a) => a.actionText)
  };
}

function buildSafetyReply(
  risk: { warningMessage: string; hotline: string },
  plan: SafetyPlan | null
): string {
  const parts: string[] = [
    '听到这些，我最担心的是你的安全。现在先不聊打卡和计划——眼前最要紧的是让你身边有人陪着。',
    plan?.contacts?.length
      ? `你之前写下的应急卡里提到可以联系：${plan.contacts.slice(0, 3).join('、')}。要不要现在就试着联系其中一位？`
      : '请优先联系身边可信任的人（家人、朋友、辅导员），或学校心理中心。',
    plan?.coping?.length ? `你写下的可以做的事：${plan.coping.slice(0, 3).join('；')}。` : '',
    `如果需要有人倾听，${risk.hotline}。`,
    '你不是一个人。我在这里陪着你，也请先让自己处在有人在的地方。'
  ];
  return parts.filter(Boolean).join('\n');
}

function buildSupportReply(text: string, s: NonNullable<LoopTurnResult['suggestions']>): string {
  const opening = text.trim()
    ? `你说到「${text.trim().slice(0, 40)}${text.trim().length > 40 ? '…' : ''}」，我听到了。`
    : '我在。';
  const lines: string[] = [opening];
  if (s.activePlan?.pendingActions.length) {
    lines.push(`这周的目标是「${s.activePlan.goal}」，今天可以只挑一件小事：${s.activePlan.pendingActions[0]}。`);
  } else if (s.practice.length) {
    lines.push(`如果你愿意，可以试试这个小练习：${s.practice[0].title}——做完不打卡也没关系。`);
  } else {
    lines.push('要不要做个简单的签到，或者先随便聊聊今天发生了什么？你说了算。');
  }
  return lines.join('\n');
}
