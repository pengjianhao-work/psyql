import { getRecentDialogs } from '../../db/userAgentStore';
import { listTrainingSessions } from '../../db/trainingStore';
import { listMoodCheckins } from '../user/moodCheckinService';
import { listJournals } from '../user/journalService';
import { listBottleSignalRows } from '../social/driftBottleService';
import { listWellbeingCheckins } from '../loop/checkinService';
import { listActionSignalRows } from '../loop/supportPlanService';
import { listReflections } from '../loop/reflectionService';
import type { TrainingType } from '../../types/training';

/**
 * L2 记忆蒸馏的「用户信号」归一化层。
 * - 把对话、心情打卡、微训练、私密日记等来源统一成 UserSignal，供蒸馏/画像等下游消费
 * - bottle 类型已在联合类型中占位，采集器在后续阶段注册
 * - 高危对话与规则层命中的日记标记 riskSensitive，默认不进入蒸馏输入
 */

export type UserSignalType =
  | 'dialog'
  | 'mood'
  | 'training'
  | 'journal'
  | 'bottle'
  | 'checkin'
  | 'plan'
  | 'reflection';

export interface UserSignal {
  type: UserSignalType;
  occurredAt: string; // ISO 或可排序时间串
  text: string; // 归一化后的文本，直接作为蒸馏输入
  riskSensitive?: boolean; // true 时默认从蒸馏输入中排除（如高危对话）
}

export type SignalCollector = (userId: string, limit: number) => UserSignal[];

const collectors = new Map<UserSignalType, SignalCollector>();

export function registerSignalCollector(type: UserSignalType, collector: SignalCollector): void {
  collectors.set(type, collector);
}

export function collectUserSignals(
  userId: string,
  opts: {
    limit?: number;
    types?: UserSignalType[];
    excludeRiskSensitive?: boolean;
  } = {}
): UserSignal[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
  const excludeRiskSensitive = opts.excludeRiskSensitive ?? true;
  const types = opts.types ?? [...collectors.keys()];

  const merged: UserSignal[] = [];
  for (const type of types) {
    const collector = collectors.get(type);
    if (!collector) continue;
    merged.push(...collector(userId, limit));
  }

  const filtered = excludeRiskSensitive ? merged.filter((s) => !s.riskSensitive) : merged;
  filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return filtered.slice(0, limit);
}

/** psych_json 中的 risk/riskLevel 为 high/critical 视为高危信号。 */
export function isHighRiskDialog(psychJson: string | null): boolean {
  if (!psychJson) return false;
  try {
    const parsed = JSON.parse(psychJson) as { risk?: string; riskLevel?: string };
    const risk = parsed.risk ?? parsed.riskLevel ?? '';
    return risk === 'high' || risk === 'critical';
  } catch {
    return false;
  }
}

const DIALOG_MIN_LEN = 10;
const DIALOG_TEXT_MAX = 200;

const TRAINING_TITLES: Record<TrainingType, string> = {
  emotion: '情绪觉察训练',
  stress: '压力拆解训练',
  cbt: '消极认知纠正训练',
  affirmation: '自我肯定训练',
  sleep: '睡前情绪放松训练'
};

// ---- 内置采集器 ----

registerSignalCollector('dialog', (userId, limit) => {
  const rows = getRecentDialogs(userId, limit);
  const signals: UserSignal[] = [];
  for (const row of rows) {
    const userText = (row.userText ?? '').replace(/\s+/g, ' ').trim();
    if (userText.length < DIALOG_MIN_LEN) continue;
    signals.push({
      type: 'dialog',
      occurredAt: row.dialogTime,
      text: `用户说：${userText.slice(0, DIALOG_TEXT_MAX)}`,
      riskSensitive: isHighRiskDialog(row.psychJson)
    });
  }
  return signals;
});

registerSignalCollector('mood', (userId, limit) => {
  return listMoodCheckins(userId, limit).map((c) => ({
    type: 'mood' as const,
    occurredAt: c.createdAt,
    text: `心情打卡：${c.mood}${c.note ? `；备注：${c.note}` : ''}`
  }));
});

registerSignalCollector('training', (userId, limit) => {
  return listTrainingSessions(userId, limit)
    .filter((s) => s.status === 'completed')
    .map((s) => ({
      type: 'training' as const,
      occurredAt: s.completedAt ?? s.updatedAt,
      text: `完成微训练：${TRAINING_TITLES[s.trainingType] ?? s.trainingType}`
    }));
});

const JOURNAL_TEXT_MAX = 200;

registerSignalCollector('journal', (userId, limit) => {
  return listJournals(userId, limit).map((j) => ({
    type: 'journal' as const,
    occurredAt: j.createdAt,
    text: `日记${j.title ? `《${j.title}》` : ''}：${j.body.slice(0, JOURNAL_TEXT_MAX)}`,
    riskSensitive: j.riskSensitive
  }));
});

const BOTTLE_TEXT_MAX = 200;

registerSignalCollector('bottle', (userId, limit) => {
  return listBottleSignalRows(userId, limit).map((b) => ({
    type: 'bottle' as const,
    occurredAt: b.createdAt,
    text: `漂流瓶：${b.body.slice(0, BOTTLE_TEXT_MAX)}`
  }));
});

registerSignalCollector('checkin', (userId, limit) => {
  return listWellbeingCheckins(userId, limit)
    .filter((c) => !c.skipped)
    .map((c) => ({
      type: 'checkin' as const,
      occurredAt: c.createdAt,
      text: `状态签到：${[c.mood, c.stress != null ? `压力${c.stress}/5` : '', c.energy != null ? `能量${c.energy}/5` : '', c.sleepHours != null ? `睡${c.sleepHours}h` : '', c.eventText].filter(Boolean).join('，')}`
    }));
});

registerSignalCollector('plan', (userId, limit) => {
  return listActionSignalRows(userId, limit).map((a) => ({
    type: 'plan' as const,
    occurredAt: a.doneAt,
    text: `${a.status === 'done' ? '完成' : '部分完成'}微行动：${a.actionText}`
  }));
});

registerSignalCollector('reflection', (userId, limit) => {
  return listReflections(userId, undefined, limit).map((r) => ({
    type: 'reflection' as const,
    occurredAt: r.createdAt,
    text: `${r.scope === 'weekly' ? '周复盘' : '晚间复盘'}：${[...r.lines, r.helped && `有用：${r.helped}`, r.notHelped && `没用：${r.notHelped}`].filter(Boolean).join('；')}`
  }));
});
