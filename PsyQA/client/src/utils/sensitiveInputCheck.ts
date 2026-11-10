export type SensitiveLevel = 'none' | 'medium' | 'high' | 'critical';

export interface SensitiveCheckResult {
  level: SensitiveLevel;
  keywords: string[];
  message: string;
}

const CRISIS_PATTERNS: Array<{ level: SensitiveLevel; keywords: string[]; message: string }> = [
  {
    level: 'critical',
    keywords: [
      '自杀', '不想活', '结束生命', '跳楼', '割腕', '了结', '去死', '杀了他', '杀人',
      '活着没什么意思', '活着没有意思', '没什么意思活着', '生无可恋'
    ],
    message: '检测到可能的危机表述。你的生命非常宝贵，建议立即联系信任的人或拨打心理援助热线 400-161-9995。仍要发送吗？'
  },
  {
    level: 'high',
    keywords: ['停药', '断药', '减药', '换药', '不吃药了', '不想吃药', '把药停了'],
    message: '停药、减药或换药要由开药的医生决定，这里不能讨论怎么停、怎么换。请联系医生或学校心理中心，必要时拨打心理援助热线 400-161-9995。仍要发送吗？'
  },
  {
    level: 'high',
    keywords: ['自残', '自伤', '伤害自己', '想死', '活着没意思', '撑不下去'],
    message: '你似乎正经历很痛苦的时刻。可以先深呼吸，或联系校内心理中心/热线。确定继续发送这条消息吗？'
  },
  {
    level: 'medium',
    keywords: ['崩溃', '绝望', '活不下去', '没有希望', '彻底完了'],
    message: '听起来你现在很难受。若愿意，可以先说说最困扰你的一件事；若感到难以承受，建议寻求专业支持。'
  }
];

export function checkSensitiveInput(text: string): SensitiveCheckResult {
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  if (!normalized) {
    return { level: 'none', keywords: [], message: '' };
  }

  for (const group of CRISIS_PATTERNS) {
    const hits = group.keywords.filter((kw) => normalized.includes(kw.toLowerCase()));
    if (hits.length) {
      return { level: group.level, keywords: hits, message: group.message };
    }
  }
  return { level: 'none', keywords: [], message: '' };
}

export function shouldConfirmSensitiveSend(result: SensitiveCheckResult): boolean {
  return result.level === 'critical' || result.level === 'high';
}
