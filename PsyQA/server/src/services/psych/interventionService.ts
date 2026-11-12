import { EmotionType, ProblemCategory, RiskLevel } from './emotionService';

export interface InterventionPlan {
  frameworkId: string;
  frameworkName: string;
  structureHint: string;
  openingPhrase: string;
  closingPhrase: string;
}

type FrameworkCore = Omit<InterventionPlan, 'openingPhrase' | 'closingPhrase'>;

const EMOTION_PHRASES: Partial<Record<EmotionType, { open: string; close: string }>> = {
  sad: {
    open: '我能感受到你现在心里很重，这种难过被看见本身就有意义。',
    close: '你不用一个人扛，今天可以先做一件很小、但能让自己稍微松一口气的事。'
  },
  anxious: {
    open: '焦虑来的时候，身体往往比脑子更先报警，我们先不急着解决一切。',
    close: '把步子缩小，完成一小步就值得肯定，我会继续陪你梳理。'
  },
  angry: {
    open: '你有权利感到生气，我们先不评判对错，先把情绪安放一下。',
    close: '等你稍微平静一点，我们再一起看：什么边界需要被说清楚。'
  },
  lonely: {
    open: '孤独感很真实，也并不代表你不够好或不被需要。',
    close: '若愿意，今天试着给一位你信任的人发一句简单的问候。'
  },
  frustrated: {
    open: '挫败感说明你在乎这件事，这本身也是一种力量。',
    close: '把目标拆到「今天能完成」的粒度，会比逼自己一下子变好更有效。'
  },
  guilty: {
    open: '内疚常常来自你很在意关系或责任，我们可以一起看看哪些自责超出了合理范围。',
    close: '对自己宽容一点，不等于逃避责任，而是为了能更可持续地前行。'
  },
  confused: {
    open: '迷茫不代表你不行，很多时候只是选择太多、信息太杂。',
    close: '先写下你最在意的 1 个目标，我们再倒推下一步。'
  },
  neutral: {
    open: '谢谢你愿意把这些讲出来，我们慢慢理。',
    close: '有任何新的感受或变化，都可以继续告诉我。'
  }
};

const DEFAULT_PHRASE = {
  open: '谢谢你信任我，愿意说出这些。',
  close: '你已经在照顾自己了，我们一步一步来。'
};

function pickPhrase(emotion: EmotionType): { open: string; close: string } {
  return EMOTION_PHRASES[emotion] ?? DEFAULT_PHRASE;
}

const SAFETY_PLAN: InterventionPlan = {
  frameworkId: 'safety_plan',
  frameworkName: '安全计划（危机优先）',
  structureHint: [
    '① 共情并确认当下是否安全（人在哪里、身边是否有人）',
    '② 不深挖创伤细节；引导离开危险物、先稳住呼吸',
    '③ 给出可立刻联系的人：室友/家人/辅导员，或校内心理中心',
    '④ 提供全国心理援助热线，鼓励此刻就联系现实支持',
    '禁止诊断、开药、原因分析或哲学讨论'
  ].join('\n'),
  openingPhrase: '我非常在意你现在的安全，我们先确保你此刻是安全的。',
  closingPhrase: '请优先联系身边可信任的人或校内心理中心，也可拨打心理援助热线，你值得被帮助。'
};

const FRAMEWORK_LABELS: Record<string, string> = {
  safety_plan: '安全计划（危机优先）',
  cbt_academic: 'CBT 轻度 · 学业焦虑',
  interpersonal_activation: '人际支持 + 行为激活',
  emotion_boundary: '情绪调节 + 边界',
  mi_future: '动机访谈 · 未来迷茫',
  mindfulness_light: '正念轻量 · 情绪调节',
  cbt_general: 'CBT 通用 · 压力管理',
  interpersonal_general: '人际沟通通用',
  mindfulness_general: '正念与情绪调节',
  romantic_support: '恋爱关系支持',
  identity_support: '自我认同支持',
  supportive_counseling: '支持性心理咨询'
};

export function labelFramework(frameworkId?: string): string {
  if (!frameworkId) return '';
  return FRAMEWORK_LABELS[frameworkId] || frameworkId;
}

function fourStep(empathy: string, clarify: string, action: string, close: string): string {
  return `① 共情：${empathy} ② 澄清/命名：${clarify} ③ 今日小步：${action} ④ 收尾：${close}`;
}

export function getInterventionPlan(
  emotion: EmotionType,
  problem: ProblemCategory,
  risk: RiskLevel
): InterventionPlan {
  if (risk === 'high' || risk === 'critical') {
    return SAFETY_PLAN;
  }

  const phrases = pickPhrase(emotion);
  const key = `${emotion}:${problem}`;

  const table: Record<string, FrameworkCore> = {
    'anxious:academic_stress': {
      frameworkId: 'cbt_academic',
      frameworkName: FRAMEWORK_LABELS.cbt_academic,
      structureHint: fourStep(
        '承认考试/学习带来的紧绷',
        '点出 1 条自动化思维（如「我肯定考砸」）',
        '25 分钟专注 + 5 分钟休息；今晚只完成 1 个最小任务',
        '提醒可向同学/辅导员求助，必要时联系校内心理中心'
      )
    },
    'frustrated:academic_stress': {
      frameworkId: 'cbt_academic',
      frameworkName: FRAMEWORK_LABELS.cbt_academic,
      structureHint: fourStep(
        '看见挫败背后的在乎',
        '区分「这门课难」与「我整个人不行」',
        '列出可控的 1 件事（复习一小节/约答疑）并设定 20 分钟起步',
        '肯定已付出的努力，邀请明天再聊进展'
      )
    },
    'lonely:interpersonal': {
      frameworkId: 'interpersonal_activation',
      frameworkName: FRAMEWORK_LABELS.interpersonal_activation,
      structureHint: fourStep(
        '承认孤独很真实',
        '区分「此刻没人陪」与「永远不被需要」',
        '发一句低负担问候，或去公共学习区待 20 分钟',
        '若持续低落，建议预约校内心理咨询'
      )
    },
    'sad:interpersonal': {
      frameworkId: 'interpersonal_activation',
      frameworkName: FRAMEWORK_LABELS.interpersonal_activation,
      structureHint: fourStep(
        '共情失落或被疏远的感觉',
        '澄清最在意的一段关系/一次互动',
        '设计 1 个微小社交行动（共进餐/短问候）',
        '保持联系通道，不强迫立刻修复一切'
      )
    },
    'anxious:romantic_relationship': {
      frameworkId: 'romantic_support',
      frameworkName: FRAMEWORK_LABELS.romantic_support,
      structureHint: fourStep(
        '承认恋爱里的不安很常见',
        '命名担心（怕被冷落/不确定感）',
        '用「我信息」说清 1 个需要，或先写下来不急着发',
        '关系压力过大时，可寻求校内咨询支持'
      )
    },
    'confused:self_identity': {
      frameworkId: 'identity_support',
      frameworkName: FRAMEWORK_LABELS.identity_support,
      structureHint: fourStep(
        '迷茫不代表失败',
        '写下「我在乎的 3 件事」与「暂时不确定的」',
        '本周只做 1 个探索行动（问学长/查一门课/试一项活动）',
        '身份可以慢慢长出来，不必一次定终身'
      )
    },
    'anxious:emotion_regulation': {
      frameworkId: 'mindfulness_light',
      frameworkName: FRAMEWORK_LABELS.mindfulness_light,
      structureHint: fourStep(
        '看见身体先报警的信号',
        '给情绪一个名字（慌/紧/空）',
        '做 1 轮 4-6 呼吸或 5-4-3-2-1 grounding',
        '稳定后再谈具体压力源'
      )
    },
    'angry:family_relationship': {
      frameworkId: 'emotion_boundary',
      frameworkName: FRAMEWORK_LABELS.emotion_boundary,
      structureHint: fourStep(
        '允许生气，先不评判对错',
        '分清「边界被碰」与「对方意图」',
        '先做 3 分钟走动/呼吸；再用「我信息」模板写一句想说的话',
        '需要时可通过辅导员等第三方协助沟通'
      )
    },
    'anxious:career_future': {
      frameworkId: 'mi_future',
      frameworkName: FRAMEWORK_LABELS.mi_future,
      structureHint: fourStep(
        '承认对未来的不确定感',
        '探索最在乎的 3 件事与利弊',
        '本周 1 个探索行动（职业信息/访谈学长）',
        '把大目标拆成可试错的小步'
      )
    },
    'sad:emotion_regulation': {
      frameworkId: 'mindfulness_light',
      frameworkName: FRAMEWORK_LABELS.mindfulness_light,
      structureHint: fourStep(
        '低落被看见本身就有意义',
        '情绪命名 + 身体信号',
        '5-4-3-2-1 grounding 或对自己说一句自我关怀',
        '持续低落时鼓励联系校内心理中心'
      )
    }
  };

  const fallbackByProblem: Partial<Record<ProblemCategory, FrameworkCore>> = {
    academic_stress: {
      frameworkId: 'cbt_general',
      frameworkName: FRAMEWORK_LABELS.cbt_general,
      structureHint: fourStep('承认学业压力', '区分可控/不可控', '今天能开始的 1～2 个小行动', '需要时寻求同学或校内支持')
    },
    interpersonal: {
      frameworkId: 'interpersonal_general',
      frameworkName: FRAMEWORK_LABELS.interpersonal_general,
      structureHint: fourStep('共情关系里的难受', '澄清期待与边界', '1 次具体、温和的沟通练习', '关系修复可以慢慢来')
    },
    family_relationship: {
      frameworkId: 'emotion_boundary',
      frameworkName: FRAMEWORK_LABELS.emotion_boundary,
      structureHint: fourStep('看见家庭议题带来的紧绷', '分清情绪与事实', '先稳定自己，再选 1 句想表达的话', '可借助辅导员等校内资源')
    },
    romantic_relationship: {
      frameworkId: 'romantic_support',
      frameworkName: FRAMEWORK_LABELS.romantic_support,
      structureHint: fourStep('共情感情中的波动', '命名最卡的一点', '写清需要或暂停回应给自己空间', '压力大时联系信任的人或校内咨询')
    },
    career_future: {
      frameworkId: 'mi_future',
      frameworkName: FRAMEWORK_LABELS.mi_future,
      structureHint: fourStep('承认迷茫正常', '理出价值优先级', '本周一个探索行动', '允许路径调整')
    },
    self_identity: {
      frameworkId: 'identity_support',
      frameworkName: FRAMEWORK_LABELS.identity_support,
      structureHint: fourStep('看见自我怀疑', '分开「事实」与「苛刻评价」', '记录 2 条具体小证据或优点', '身份议题可慢慢谈')
    },
    emotion_regulation: {
      frameworkId: 'mindfulness_general',
      frameworkName: FRAMEWORK_LABELS.mindfulness_general,
      structureHint: fourStep('接纳当下情绪', '命名身体信号', '5 分钟内可完成的调节动作', '稳定后再处理具体事件')
    },
    body_image: {
      frameworkId: 'supportive_counseling',
      frameworkName: FRAMEWORK_LABELS.supportive_counseling,
      structureHint: fourStep('外貌焦虑很常见', '减少比较与苛责语句', '今天做 1 件照顾身体但不惩罚自己的事', '持续痛苦时建议专业支持')
    },
    addiction: {
      frameworkId: 'cbt_general',
      frameworkName: FRAMEWORK_LABELS.cbt_general,
      structureHint: fourStep('承认习惯难改', '找触发场景', '用 10 分钟替代行为打断一次循环', '不羞耻地寻求支持')
    },
    trauma: {
      frameworkId: 'supportive_counseling',
      frameworkName: FRAMEWORK_LABELS.supportive_counseling,
      structureHint: fourStep(
        '感谢信任，不追问细节',
        '强调当下安全与节奏由你掌握',
        '先做稳定动作（呼吸/到安全环境）',
        '引导联系校内心理中心或专业咨询，不替代治疗'
      )
    }
  };

  const picked =
    table[key] ??
    fallbackByProblem[problem] ?? {
      frameworkId: 'supportive_counseling',
      frameworkName: FRAMEWORK_LABELS.supportive_counseling,
      structureHint: fourStep('共情当下感受', '梳理最困扰的一点', '给出可执行的小建议', '简短鼓励并保持可继续聊')
    };

  return {
    ...picked,
    openingPhrase: phrases.open,
    closingPhrase: phrases.close
  };
}

export const ETHICS_FOOTER =
  '\n\n---\n【重要说明】以上内容为心理支持与自助建议，不能替代医疗诊断或治疗。若感到难以承受或出现自伤/伤人想法，请立即联系身边人并拨打 120 / 心理援助热线。';

export const HIGH_RISK_CLARIFICATION =
  '在继续之前，我想确认：你刚才提到的困扰，是否包含伤害自己或他人的具体计划？若有，请优先联系可信任的人或拨打心理援助热线。';
