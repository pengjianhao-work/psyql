import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';

/**
 * L2 层记忆：从对话中蒸馏出的「事实/偏好/稳定模式」。
 * 与 L1（原始对话向量+memory_meta 标签）和 L3（月/年总结、画像）分层：
 * - L1：可逐条查看/归档/删除的原始对话记忆
 * - L2：本文件，聚合后的稳定事实，用户可编辑/删除，注入 Agent prompt
 * - L3：portrait / monthlySummaries / annualReports，由现有服务生成
 */

export type UserFactCategory =
  | 'emotion'
  | 'relationship'
  | 'academic'
  | 'habit'
  | 'preference'
  | 'context';

export type UserFactConfidence = 'low' | 'medium' | 'high';

export interface UserFact {
  id: string;
  fact: string;
  category: UserFactCategory;
  confidence: UserFactConfidence;
  /** 同一事实被独立对话反复印证的次数 */
  occurrences: number;
  /** 来源对话 dialog_time（截断保留最近 10 条） */
  sourceDialogTimes: string[];
  /** active 展示并注入 prompt；archived 仅保留记录 */
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface UserFactDraft {
  fact: string;
  category: UserFactCategory;
  confidence: UserFactConfidence;
}

interface UserFactFile {
  byUser: Record<
    string,
    {
      facts: UserFact[];
      lastDistillAt?: string;
      distilledCount?: number;
    }
  >;
}

const FACT_CATEGORIES = new Set<UserFactCategory>([
  'emotion',
  'relationship',
  'academic',
  'habit',
  'preference',
  'context'
]);

function factsFilePath(): string {
  return resolveDataFile('user_facts.json');
}

function loadFactsFile(): UserFactFile {
  return readJsonFileSync<UserFactFile>(factsFilePath(), { byUser: {} });
}

function saveFactsFile(data: UserFactFile): void {
  writeJsonFileSync(factsFilePath(), data);
}

function ensureUserBucket(
  file: UserFactFile,
  userId: string
): { facts: UserFact[]; lastDistillAt?: string; distilledCount?: number } {
  if (!file.byUser[userId]) {
    file.byUser[userId] = { facts: [] };
  }
  return file.byUser[userId];
}

export function normalizeFactText(text: string): string {
  return text
    .replace(/[\s，。！？；：、,.!?;:()（）\[\]【】《》<>-—_]+/g, '')
    .toLowerCase();
}

/** 简单字符 bigram Jaccard，用于事实去重合并（不引入向量依赖） */
export function factSimilarity(a: string, b: string): number {
  const na = normalizeFactText(a);
  const nb = normalizeFactText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const grams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(na);
  const gb = grams(nb);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter += 1;
  const union = ga.size + gb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function nextFactId(): string {
  return `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 写入一条蒸馏事实：同分类下与已有 active 事实相似度 ≥0.55 视为同一事实，
 * 合并为 occurrences+1 并更新置信度/来源，不重复新增。
 */
export function upsertUserFact(
  userId: string,
  draft: UserFactDraft,
  sourceDialogTime?: string
): UserFact | null {
  const factText = draft.fact.trim();
  if (!factText || factText.length < 4 || factText.length > 120) return null;
  const category = FACT_CATEGORIES.has(draft.category) ? draft.category : 'context';
  const confidence = ['low', 'medium', 'high'].includes(draft.confidence)
    ? draft.confidence
    : 'medium';

  const file = loadFactsFile();
  const bucket = ensureUserBucket(file, userId);
  const now = new Date().toISOString();

  let best: UserFact | null = null;
  let bestScore = 0;
  for (const f of bucket.facts) {
    if (f.status !== 'active' || f.category !== category) continue;
    const score = factSimilarity(f.fact, factText);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  if (best && bestScore >= 0.55) {
    best.occurrences += 1;
    best.updatedAt = now;
    if (sourceDialogTime && !best.sourceDialogTimes.includes(sourceDialogTime)) {
      best.sourceDialogTimes.push(sourceDialogTime);
      if (best.sourceDialogTimes.length > 10) {
        best.sourceDialogTimes = best.sourceDialogTimes.slice(-10);
      }
    }
    const rank = { low: 0, medium: 1, high: 2 };
    if (rank[confidence] > rank[best.confidence]) best.confidence = confidence;
    saveFactsFile(file);
    return best;
  }

  const fact: UserFact = {
    id: nextFactId(),
    fact: factText,
    category,
    confidence,
    occurrences: 1,
    sourceDialogTimes: sourceDialogTime ? [sourceDialogTime] : [],
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
  bucket.facts.push(fact);
  if (bucket.facts.length > 200) {
    bucket.facts = bucket.facts
      .filter((f) => f.status === 'active')
      .slice(-200);
  }
  saveFactsFile(file);
  return fact;
}

export function listUserFacts(
  userId: string,
  opts: { includeArchived?: boolean } = {}
): UserFact[] {
  const file = loadFactsFile();
  const facts = file.byUser[userId]?.facts ?? [];
  const filtered = opts.includeArchived ? facts : facts.filter((f) => f.status === 'active');
  return filtered.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateUserFact(
  userId: string,
  factId: string,
  patch: { fact?: string; status?: 'active' | 'archived' }
): UserFact | null {
  const file = loadFactsFile();
  const bucket = file.byUser[userId];
  const target = bucket?.facts.find((f) => f.id === factId);
  if (!bucket || !target) return null;

  if (patch.fact !== undefined) {
    const text = patch.fact.trim();
    if (text.length >= 4 && text.length <= 120) {
      target.fact = text;
    }
  }
  if (patch.status === 'active' || patch.status === 'archived') {
    target.status = patch.status;
  }
  target.updatedAt = new Date().toISOString();
  saveFactsFile(file);
  return target;
}

export function deleteUserFact(userId: string, factId: string): boolean {
  const file = loadFactsFile();
  const bucket = file.byUser[userId];
  if (!bucket) return false;
  const before = bucket.facts.length;
  bucket.facts = bucket.facts.filter((f) => f.id !== factId);
  if (bucket.facts.length === before) return false;
  saveFactsFile(file);
  return true;
}

export function getFactDistillState(
  userId: string
): { lastDistillAt?: string; distilledCount: number; totalFacts: number } {
  const file = loadFactsFile();
  const bucket = file.byUser[userId];
  return {
    lastDistillAt: bucket?.lastDistillAt,
    distilledCount: bucket?.distilledCount ?? 0,
    totalFacts: bucket?.facts.filter((f) => f.status === 'active').length ?? 0
  };
}

export function recordFactDistillRun(userId: string, dialogCount: number): void {
  const file = loadFactsFile();
  const bucket = ensureUserBucket(file, userId);
  bucket.lastDistillAt = new Date().toISOString();
  bucket.distilledCount = Math.max(bucket.distilledCount ?? 0, dialogCount);
  saveFactsFile(file);
}

const FACT_CATEGORY_LABEL: Record<UserFactCategory, string> = {
  emotion: '情绪模式',
  relationship: '人际关系',
  academic: '学业',
  habit: '生活习惯',
  preference: '偏好',
  context: '处境背景'
};

const CONFIDENCE_LABEL: Record<UserFactConfidence, string> = {
  low: '初步',
  medium: '较稳定',
  high: '稳定'
};

/** 注入 Agent prompt 的 L2 事实块；无事实或用户无档案时返回空串。 */
export function formatUserFactsForPrompt(userId: string): string {
  if (!userId || userId === 'default_user') return '';
  const facts = listUserFacts(userId).slice(0, 20);
  if (!facts.length) return '';
  const lines = facts.map(
    (f) =>
      `- [${FACT_CATEGORY_LABEL[f.category]}·${CONFIDENCE_LABEL[f.confidence]}] ${f.fact}` +
      (f.occurrences > 1 ? `（印证 ${f.occurrences} 次）` : '')
  );
  return `【关于TA的记忆事实 · 仅供参考，不要逐条复述】\n${lines.join('\n')}`;
}
