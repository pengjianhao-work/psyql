import { callLlmGenerate, shouldUseLlm } from '../llm/llmClient';
import { extractJsonObject } from '../llm/ollamaClient';
import { getRecentDialogs } from '../../db/userAgentStore';
import {
  upsertUserFact,
  getFactDistillState,
  recordFactDistillRun,
  UserFactCategory,
  UserFactConfidence
} from './userFactService';

/**
 * L2 记忆蒸馏：把最近若干轮对话交给 LLM，提炼「关于用户的稳定事实」。
 * - 异步 fire-and-forget，不阻塞回答主链路
 * - 去抖：距上次蒸馏累计新增 ≥4 条对话才跑
 * - 安全：risk 为 high/critical 的对话不进入蒸馏输入；输出禁止诊断/危机细节
 */

const MIN_NEW_DIALOGS = 4;
const LOOKBACK_DIALOGS = 10;
const VALID_CATEGORIES = new Set<UserFactCategory>([
  'emotion',
  'relationship',
  'academic',
  'habit',
  'preference',
  'context'
]);

const inFlight = new Set<string>();

function isHighRiskDialog(psychJson: string | null): boolean {
  if (!psychJson) return false;
  try {
    const parsed = JSON.parse(psychJson) as { risk?: string; riskLevel?: string };
    const risk = parsed.risk ?? parsed.riskLevel ?? '';
    return risk === 'high' || risk === 'critical';
  } catch {
    return false;
  }
}

function buildDistillPrompt(dialogs: Array<{ dialogTime: string; userText: string; summary: string }>): string {
  const lines = dialogs.map((d, i) => {
    const user = d.userText.replace(/\s+/g, ' ').slice(0, 120);
    const summary = (d.summary || '').replace(/\s+/g, ' ').slice(0, 80);
    return `${i + 1}. [${d.dialogTime}] 用户说：${user}${summary ? `｜摘要：${summary}` : ''}`;
  });

  return `你是心理支持产品的记忆整理助手。下面是同一位用户最近的对话片段。
请提炼「关于这个用户的稳定事实、偏好、处境背景」，输出且只输出 JSON：
{"facts":[{"fact":"...","category":"emotion|relationship|academic|habit|preference|context","confidence":"low|medium|high"}]}

规则：
- 只提炼跨对话稳定或反复出现的模式、偏好、处境；一次性情绪波动不算
- fact 用简洁第三人称描述用户，20-40 字，不复述对话原文中的敏感细节
- category 含义：emotion=情绪模式 relationship=人际关系 academic=学业 habit=生活习惯 preference=偏好 context=处境背景
- confidence：仅出现一次=low，反复印证=medium，高度确定=high
- 禁止诊断、禁止心理疾病标签、禁止记录自伤/危机细节、禁止编造
- 没有值得提炼的内容时输出 {"facts":[]}

对话片段：
${lines.join('\n')}`;
}

function parseFactDrafts(raw: string | null): Array<{
  fact: string;
  category: UserFactCategory;
  confidence: UserFactConfidence;
}> {
  if (!raw) return [];
  const obj = extractJsonObject(raw);
  const list = (obj as { facts?: unknown } | null)?.facts;
  if (!Array.isArray(list)) return [];
  const out: Array<{ fact: string; category: UserFactCategory; confidence: UserFactConfidence }> = [];
  for (const item of list.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const fact = String(rec.fact ?? '').trim();
    const category = String(rec.category ?? 'context') as UserFactCategory;
    const confidence = String(rec.confidence ?? 'medium') as UserFactConfidence;
    if (!fact) continue;
    out.push({
      fact,
      category: VALID_CATEGORIES.has(category) ? category : 'context',
      confidence: ['low', 'medium', 'high'].includes(confidence) ? confidence : 'medium'
    });
  }
  return out;
}

/** 执行一次蒸馏（无论来源），返回新写入/合并的事实数。 */
export async function runFactDistillation(userId: string): Promise<number> {
  if (!userId || userId === 'default_user' || !shouldUseLlm()) return 0;

  const dialogs = getRecentDialogs(userId, LOOKBACK_DIALOGS)
    .filter((d) => d.userText && d.userText.trim().length >= 10)
    .filter((d) => !isHighRiskDialog(d.psychJson));
  if (dialogs.length < 3) return 0;

  const prompt = buildDistillPrompt(
    dialogs.map((d) => ({ dialogTime: d.dialogTime, userText: d.userText, summary: d.summary ?? '' }))
  );
  const raw = await callLlmGenerate(prompt, {
    provider: 'auto',
    temperature: 0.2,
    maxTokens: 800,
    timeoutMs: 60000
  });
  const drafts = parseFactDrafts(raw);
  if (!drafts.length) {
    recordFactDistillRun(userId, dialogs.length);
    return 0;
  }

  const latestDialogTime = dialogs[0]?.dialogTime;
  let touched = 0;
  for (const draft of drafts) {
    const fact = upsertUserFact(userId, draft, latestDialogTime);
    if (fact) touched += 1;
  }
  recordFactDistillRun(userId, dialogs.length);
  return touched;
}

/**
 * 异步触发蒸馏：距上次蒸馏的累计对话数不足 MIN_NEW_DIALOGS 则跳过。
 * 供 portraitQueue 等后台链路调用，不阻塞主流程。
 */
export function scheduleFactDistillation(userId: string): void {
  if (!userId || userId === 'default_user' || inFlight.has(userId)) return;

  const state = getFactDistillState(userId);
  const recentCount = Math.min(getRecentDialogs(userId, 100).length, 100);
  const newSinceLast = recentCount - state.distilledCount;
  if (newSinceLast < MIN_NEW_DIALOGS && state.lastDistillAt) return;
  if (recentCount < 3) return;

  inFlight.add(userId);
  void (async () => {
    try {
      const touched = await runFactDistillation(userId);
      if (touched > 0) {
        console.log(`[fact-distill] user=${userId} merged ${touched} fact(s)`);
      }
    } catch (err) {
      console.warn('[fact-distill] failed:', err);
    } finally {
      inFlight.delete(userId);
    }
  })();
}
