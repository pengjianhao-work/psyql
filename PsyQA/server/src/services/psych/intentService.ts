import { isLikelyThirdPersonCrisisMention } from '../../utils/psychTextAnalysis';

export type IntentKind = 'greeting' | 'venting' | 'advice' | 'followup' | 'crisis' | 'offtopic';

export interface IntentAnalysis {
  kind: IntentKind;
  confidence: number;
  label: string;
}

const INTENT_LABEL: Record<IntentKind, string> = {
  greeting: '寒暄',
  venting: '倾诉',
  advice: '求建议',
  followup: '追问',
  crisis: '危机求助',
  offtopic: '跑题'
};

const INTENT_SET = new Set<IntentKind>([
  'greeting',
  'venting',
  'advice',
  'followup',
  'crisis',
  'offtopic'
]);

const CRISIS_TERMS = [
  '自杀',
  '想死',
  '不想活',
  '轻生',
  '结束生命',
  '割腕',
  '跳楼',
  '自残',
  '伤害自己',
  '活不下去',
  '寻死',
  '杀人',
  '伤害别人'
];

const OFFTOPIC_PATTERNS = [
  /帮我(写|做|改|翻译)(?!不)/,
  /代写/,
  /写一段\s*(代码|python|java|程序)/i,
  /翻译(一下|这段|这个)/,
  /股票|彩票|天气怎么样|做菜|游戏攻略|作业答案/
];

const DISTRESS_PATTERN = /焦虑|难过|压力|失眠|难受|崩溃|委屈|想哭|心情|情绪|孤独|害怕|痛苦/;

const GREETING_PATTERN =
  /^(?:你好|您好|嗨|哈喽|hi|hello|在吗|早上好|晚上好|中午好|谢谢|谢谢你|好的|嗯+|哦+|哈哈)[!！。~\s]*$/i;

const EXPLICIT_FOLLOWUP = /上次|刚才|你刚才|然后呢|还有呢|接着说|展开说说|具体一点|没听懂|再说说/;
const SOFT_FOLLOWUP = /^(?:继续|然后|还有|接着)[吧呀啊呢]?[。！!？?\s]*$/;

const ADVICE_PATTERN = /怎么办|怎么做|如何|怎样才能|有什么办法|给我(?:点|一些)?建议|有什么建议|该怎么|帮我想想|有没有方法/;

const VENTING_PATTERN = /想说说|听我说|好难受|好烦|崩溃|压力大|睡不着|心里|委屈|想哭|难受|烦死/;

export function intentLabel(kind: IntentKind): string {
  return INTENT_LABEL[kind];
}

export function isIntentKind(value: string | undefined): value is IntentKind {
  return Boolean(value && INTENT_SET.has(value as IntentKind));
}

function hasFirstPersonCrisis(text: string): boolean {
  const normalized = text.toLowerCase();
  for (const term of CRISIS_TERMS) {
    let idx = 0;
    while ((idx = normalized.indexOf(term, idx)) !== -1) {
      if (!isLikelyThirdPersonCrisisMention(normalized, idx)) return true;
      idx += term.length;
    }
  }
  return false;
}

function makeIntent(kind: IntentKind, confidence: number): IntentAnalysis {
  return { kind, confidence, label: INTENT_LABEL[kind] };
}

export function classifyIntent(text: string, options?: { hasHistory?: boolean }): IntentAnalysis {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (!raw) return makeIntent('venting', 0.35);

  if (hasFirstPersonCrisis(raw)) return makeIntent('crisis', 0.93);

  const looksOfftopic = OFFTOPIC_PATTERNS.some((pattern) => pattern.test(raw));
  if (looksOfftopic && !DISTRESS_PATTERN.test(raw)) return makeIntent('offtopic', 0.88);

  if (raw.length <= 12 && GREETING_PATTERN.test(raw)) {
    if (options?.hasHistory && /^(?:好的|谢谢|谢谢你|嗯+|哦+|哈哈)[!！。~\s]*$/i.test(raw)) {
      return makeIntent('followup', 0.74);
    }
    return makeIntent('greeting', 0.9);
  }

  if (EXPLICIT_FOLLOWUP.test(raw) || (options?.hasHistory && SOFT_FOLLOWUP.test(raw))) {
    return makeIntent('followup', 0.8);
  }

  if (ADVICE_PATTERN.test(raw)) return makeIntent('advice', 0.82);

  if (VENTING_PATTERN.test(raw) || raw.length >= 12) return makeIntent('venting', raw.length >= 12 ? 0.64 : 0.72);

  return makeIntent('venting', 0.42);
}

export function mergeIntent(
  rule: IntentAnalysis,
  llmKind: string | undefined
): { intent: IntentAnalysis; source: 'rule' | 'llm' | 'hybrid' } {
  if (!isIntentKind(llmKind) || llmKind === rule.kind) {
    return {
      intent: rule,
      source: isIntentKind(llmKind) ? 'hybrid' : 'rule'
    };
  }
  if (rule.kind === 'crisis' || rule.confidence >= 0.85) {
    return { intent: rule, source: 'rule' };
  }
  if (llmKind === 'crisis' || rule.confidence < 0.6) {
    return { intent: makeIntent(llmKind, 0.66), source: 'llm' };
  }
  return { intent: rule, source: 'hybrid' };
}

export function intentKnowledgeLimit(kind: IntentKind): number {
  if (kind === 'greeting' || kind === 'offtopic') return 0;
  if (kind === 'followup' || kind === 'crisis') return 1;
  if (kind === 'venting') return 2;
  return 3;
}

export function intentMemoryLimit(kind: IntentKind): number {
  if (kind === 'greeting' || kind === 'offtopic') return 0;
  if (kind === 'crisis') return 2;
  if (kind === 'venting') return 3;
  if (kind === 'followup') return 4;
  return 5;
}

export function formatIntentDirective(intent: IntentAnalysis): string {
  switch (intent.kind) {
    case 'venting':
      return '【本轮意图：倾诉】以共情为主。充分回应用户的感受；建议最多一句，不要步骤清单，不要换成新话题。';
    case 'advice':
      return '【本轮意图：求建议】先简短共情，再给出可以做到的建议。';
    case 'followup':
      return '【本轮意图：追问】顺着上一轮话题继续，不要重新开场，也不要换成新的知识主题。';
    case 'crisis':
      return '【本轮意图：危机求助】先确认安全和可以联系的人，再倾听。不要展开长篇分析。';
    case 'greeting':
      return '【本轮意图：寒暄】用一两句打招呼，邀请对方说说最近的感受。不要给建议清单。';
    case 'offtopic':
      return '【本轮意图：跑题】说明这里主要陪伴情绪和校园压力，邀请对方说说自己的感受。不要完成无关任务。';
    default:
      return '【本轮意图：倾诉】以共情为主。';
  }
}
