import type { EmotionType, ProblemCategory, RiskLevel } from './emotionService';

export type MicroTrainingKey =
  | 'emotion'
  | 'stress'
  | 'cbt'
  | 'breathing'
  | 'problem'
  | 'sleep'
  | 'communication'
  | 'affirmation';

export interface MicroTrainingSuggestion {
  key: MicroTrainingKey;
  title: string;
  time: string;
  description: string;
}

const CATALOG: Record<MicroTrainingKey, MicroTrainingSuggestion> = {
  emotion: {
    key: 'emotion',
    title: '情绪觉察训练',
    time: '3 分钟',
    description: '记录触发事件、身体感受、内心想法和情绪名称'
  },
  stress: {
    key: 'stress',
    title: '压力拆解训练',
    time: '5 分钟',
    description: '把笼统压力拆成小事，区分可控与不可控'
  },
  cbt: {
    key: 'cbt',
    title: '消极认知纠正训练',
    time: '4 分钟',
    description: '用轻量 CBT 方式练习更平衡的想法'
  },
  breathing: {
    key: 'breathing',
    title: '呼吸稳定训练',
    time: '3 分钟',
    description: '用节律呼吸降低当下紧张感'
  },
  problem: {
    key: 'problem',
    title: '问题解决训练',
    time: '6 分钟',
    description: '把困扰转成一个今天能行动的小步骤'
  },
  sleep: {
    key: 'sleep',
    title: '睡前情绪放松训练',
    time: '6 分钟',
    description: '跟随文字引导做呼吸和肌肉放松'
  },
  communication: {
    key: 'communication',
    title: '沟通表达训练',
    time: '5 分钟',
    description: '练习用具体、温和的方式表达需要'
  },
  affirmation: {
    key: 'affirmation',
    title: '自我肯定训练',
    time: '3 分钟',
    description: '写下 2 条自身优点或当日小成就'
  }
};

/** 危机时不建议微训练 */
export function suggestMicroTrainings(input: {
  emotion: EmotionType;
  problem: ProblemCategory;
  risk: RiskLevel;
  limit?: number;
}): MicroTrainingSuggestion[] | { blocked: true; reason: string } {
  if (input.risk === 'high' || input.risk === 'critical') {
    return { blocked: true, reason: '危机或高风险时不推送微训练，优先安全与求助通道' };
  }

  const keys: MicroTrainingKey[] = [];
  if (input.emotion === 'anxious') keys.push('breathing', 'stress');
  if (input.emotion === 'sad' || input.emotion === 'lonely') keys.push('emotion', 'affirmation');
  if (input.emotion === 'angry') keys.push('breathing', 'communication');
  if (input.emotion === 'frustrated') keys.push('cbt', 'problem');
  if (input.problem === 'academic_stress') keys.push('stress', 'problem');
  if (input.problem === 'interpersonal' || input.problem === 'family_relationship') {
    keys.push('communication');
  }
  if (input.problem === 'emotion_regulation') keys.push('emotion', 'breathing');

  const ordered: MicroTrainingKey[] = [];
  for (const key of keys) {
    if (CATALOG[key] && !ordered.includes(key)) ordered.push(key);
  }
  if (!ordered.length) ordered.push('emotion', 'breathing');

  const limit = Math.min(Math.max(input.limit ?? 2, 1), 3);
  return ordered.slice(0, limit).map((key) => CATALOG[key]);
}

export function formatMicroTrainingObservation(
  result: MicroTrainingSuggestion[] | { blocked: true; reason: string }
): string {
  if ('blocked' in result) return result.reason;
  if (!result.length) return '暂无匹配的微训练建议。';
  return result
    .map((item, i) => `${i + 1}. ${item.title}（${item.time}）：${item.description}`)
    .join('\n');
}
