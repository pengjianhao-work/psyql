/**
 * 心理闭环 Agent 工具层（确定性执行）。
 *
 * 与 reactCounselAgent 的 COUNSEL_TOOL_DEFS 不同：这里的工具不交给 LLM
 * 自由调用，由 loopRuntime 按模式路由调度，参数全部经输入校验。
 *
 * 安全约束（safety-review 不变量）：
 * - ctx.riskLevel 为 high/critical 时，仅 safety_check 可执行，其余工具一律
 *   blocked——高风险不进入普通闭环计划/练习/记忆写入；
 * - 危机回复由 loopRuntime 走固定安全模板（含 assessRisk().hotline），
 *   工具层不代写，不给模型自由发挥空间；
 * - update_memory 仅在 input.confirmed === true 时写入 user_facts，
 *   与用户确认才能进 L2 的原则一致。
 */
import { getDb } from '../../db/database';
import { assessRisk } from '../psych/emotionService';
import type { RiskLevel } from '../psych/emotionService';
import { collectUserSignals } from '../signals/userSignalService';
import { retrieveKnowledge } from '../knowledge/ragService';
import { upsertUserFact } from '../user/userFactService';
import {
  createSupportPlan,
  adjustPlan,
  updateActionStatus,
  type ActionStatus
} from './supportPlanService';
import { addReflection, type ReflectionScope } from './reflectionService';
import { listResources } from './resourceService';

export type LoopToolName =
  | 'safety_check'
  | 'get_recent_signals'
  | 'search_psych_knowledge'
  | 'create_support_plan'
  | 'adjust_plan'
  | 'log_micro_action'
  | 'log_reflection'
  | 'suggest_practice'
  | 'update_memory';

export interface LoopToolContext {
  /** 本轮已评估的风险等级；high/critical 时除 safety_check 外全部阻断 */
  riskLevel?: RiskLevel;
}

export interface LoopToolResult {
  ok: boolean;
  tool: LoopToolName;
  /** true = 被安全门禁阻断（不是工具自身失败） */
  blocked?: boolean;
  output: unknown;
}

const SAFETY_ONLY_TOOLS = new Set<LoopToolName>(['safety_check']);
const SAFETY_BLOCK_MSG = '安全路径优先：高风险期间暂停普通闭环操作，先陪你处理眼前最要紧的事';

const isHighRisk = (level?: RiskLevel): boolean => level === 'high' || level === 'critical';

export function executeLoopTool(
  userId: string,
  name: LoopToolName,
  input: Record<string, unknown> = {},
  ctx: LoopToolContext = {}
): LoopToolResult {
  if (isHighRisk(ctx.riskLevel) && !SAFETY_ONLY_TOOLS.has(name)) {
    return { ok: false, tool: name, blocked: true, output: SAFETY_BLOCK_MSG };
  }
  try {
    return { ok: true, tool: name, output: dispatch(userId, name, input) };
  } catch (err) {
    return { ok: false, tool: name, output: err instanceof Error ? err.message : String(err) };
  }
}

function dispatch(userId: string, name: LoopToolName, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'safety_check': {
      const r = assessRisk(String(input.text ?? ''));
      return { level: r.level, warningMessage: r.warningMessage, hotline: r.hotline };
    }

    case 'get_recent_signals': {
      const limit = Math.max(1, Math.min(Number(input.limit ?? 10), 30));
      return collectUserSignals(userId, { limit });
    }

    case 'search_psych_knowledge': {
      const query = String(input.query ?? '').trim().slice(0, 200);
      if (!query) throw new Error('query 不能为空');
      const topK = Math.max(1, Math.min(Number(input.topK ?? 3), 5));
      return retrieveKnowledge(query, topK).map((k) => ({
        question: k.question,
        answer: k.answer.slice(0, 300),
        relevance: k.relevance
      }));
    }

    case 'create_support_plan': {
      const actions = normalizeActions(input.actions);
      return createSupportPlan(userId, String(input.goalText ?? ''), actions, 'agent');
    }

    case 'adjust_plan': {
      const planId = Number(input.planId);
      if (!Number.isFinite(planId)) throw new Error('planId 必填');
      return adjustPlan(userId, planId, String(input.goalText ?? ''), normalizeActions(input.actions));
    }

    case 'log_micro_action': {
      // 两种写入：标记计划内行动 / 记录一次自由练习（practice_logs）
      if (input.actionId != null) {
        const status = String(input.status ?? 'done') as ActionStatus;
        return updateActionStatus(userId, Number(input.actionId), status);
      }
      const kind = String(input.kind ?? 'practice').slice(0, 50);
      const outcome = ['done', 'partial', 'skipped'].includes(String(input.outcome))
        ? String(input.outcome)
        : 'done';
      const db = getDb();
      const res = db
        .prepare('INSERT INTO practice_logs (user_id, kind, ref_id, outcome, logged_at) VALUES (?,?,?,?,?)')
        .run(userId, kind, input.refId != null ? Number(input.refId) : null, outcome, new Date().toISOString());
      return { id: Number(res.lastInsertRowid), kind, outcome };
    }

    case 'log_reflection': {
      const scope = String(input.scope ?? 'evening') as ReflectionScope;
      return addReflection(userId, {
        scope,
        lines: Array.isArray(input.lines) ? input.lines.map(String) : undefined,
        helped: input.helped != null ? String(input.helped) : undefined,
        notHelped: input.notHelped != null ? String(input.notHelped) : undefined,
        adjustNote: input.adjustNote != null ? String(input.adjustNote) : undefined
      });
    }

    case 'suggest_practice': {
      // 规则式建议：从 resource_items 取激活的心理技能/自助条目，不依赖 LLM
      const kind = input.kind === 'selfhelp' ? 'selfhelp' : 'skill';
      const items = listResources(kind, false, 3);
      return {
        kind,
        items: items.map((r) => ({ id: r.id, title: r.title, body: r.body?.slice(0, 160) ?? null })),
        empty: items.length === 0
      };
    }

    case 'update_memory': {
      // L2 只写用户确认过的内容；confirmed 缺失或为 false 一律拒绝
      if (input.confirmed !== true) {
        throw new Error('记忆写入需用户明确确认（confirmed: true）');
      }
      const fact = String(input.fact ?? '').trim();
      const saved = upsertUserFact(userId, { fact, category: 'context', confidence: 'high' });
      if (!saved) throw new Error('事实文本无效（4–120 字）');
      return { id: saved.id, fact: saved.fact };
    }

    default:
      throw new Error(`未知工具 ${name}`);
  }
}

function normalizeActions(raw: unknown): { day?: string; actionText: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      const obj = (a ?? {}) as Record<string, unknown>;
      return { day: obj.day != null ? String(obj.day).slice(0, 10) : undefined, actionText: String(obj.actionText ?? '') };
    })
    .filter((a) => a.actionText.trim());
}
