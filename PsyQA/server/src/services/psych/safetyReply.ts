import type { RiskAssessment } from './emotionService';
import { ETHICS_FOOTER } from './interventionService';

const SAFETY_TYPES = new Set(['suicide', 'selfharm', 'violence', 'medication']);

export const SAFETY_HOTLINE = '全国心理援助热线：400-161-9995';

/** 规则层命中危机类型时走安全路径，不让普通回答替代。统计分抬高的 high 不算。 */
export function requiresSafetyPath(risk: Pick<RiskAssessment, 'crisisTypes'>): boolean {
  return Boolean(risk.crisisTypes?.some((type) => SAFETY_TYPES.has(type)));
}

export function buildSafetyReply(risk: Pick<RiskAssessment, 'crisisTypes' | 'hotline'>): string {
  const hotline = risk.hotline?.includes('400-161-9995') ? risk.hotline : SAFETY_HOTLINE;
  const types = new Set(risk.crisisTypes || []);
  const lines = ['我听到你现在很不好受。先把安全放在分析前面。'];
  const harm = types.has('suicide') || types.has('selfharm') || types.has('violence');

  if (types.has('medication') && harm) {
    lines.push('停药、减药或换药要由开药的医生决定。我不能和你讨论怎么停、怎么换，也不会做诊断。');
    lines.push('今天只做一步：现在联系一位你信任的人，或学校心理中心，告诉他们你正在考虑动药，并且现在很不好受。');
  } else if (types.has('medication')) {
    lines.push(
      '停药、减药或换药要由开药的医生决定。我不能和你讨论怎么停、怎么换，也不能据此判断你的状况。'
    );
    lines.push('今天只做一步：联系给你开药的医生，或学校心理中心，告诉他们你正在考虑动药。');
  } else {
    lines.push('今天只做一步：现在联系一位你信任的人，或学校心理中心，让对方陪着你。');
  }

  lines.push(`如果此刻撑不住，请拨打${hotline}。已经有伤害自己或别人的冲动时，直接拨打 120 或 110。`);
  lines.push('我不会做诊断，也不会讨论具体的伤害方式。');
  return `${lines.join('\n\n')}${ETHICS_FOOTER}`.trim();
}
