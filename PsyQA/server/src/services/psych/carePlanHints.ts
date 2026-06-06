import { ProblemCategory, getCategoryName } from './emotionService';

export const CARE_PLAN_BY_PROBLEM: Record<ProblemCategory, string> = {
  academic_stress:
    '【学业关怀】固定睡眠时间；每天只定3个可完成的小任务；每学习25分钟休息5分钟；每周安排半天完全放松。',
  interpersonal:
    '【人际关怀】记录一次真实互动（哪怕只是问候）；避免在情绪低落时做重大关系决定；需要时找辅导员或心理中心。',
  family_relationship:
    '【家庭关怀】用「我感受」句式与父母沟通；设定可讨论的边界话题；冲突激烈时先暂停再谈。',
  romantic_relationship:
    '【感情关怀】允许自己悲伤但不苛责自己；减少反复翻看聊天记录；每天做一件与恋爱无关的愉悦小事。',
  career_future:
    '【未来关怀】写下3件你在乎的价值；本周做1次职业/专业探索（访谈学长或查1个岗位）；不求一次想清人生。',
  self_identity:
    '【自我关怀】每天记录1个做得好的细节；减少与他人社交媒体攀比；把「我应该」改成「我可以试试」。',
  emotion_regulation:
    '【情绪关怀】情绪升高时先离开触发场景；5-4-3-2-1 grounding；每天10分钟散步或拉伸。',
  body_image:
    '【身体关怀】减少频繁称体重；关注身体功能而非外表；若困扰持续建议校医院或心理咨询。',
  addiction:
    '【习惯关怀】设定手机/游戏使用时段；睡前1小时不用屏幕；用番茄钟替代无限制刷手机。',
  trauma:
    '【创伤关怀】不强迫自己详述创伤；建立安全日常节律；强烈闪回时请联系专业心理咨询。',
  other:
    '【通用关怀】每天保证基本睡眠与一餐热食；与一位信任的人保持联系；情绪持续两周以上建议寻求专业帮助。'
};

export function getCarePlanSuggestion(problem: ProblemCategory): {
  category: ProblemCategory;
  categoryName: string;
  suggestion: string;
} {
  return {
    category: problem,
    categoryName: getCategoryName(problem),
    suggestion: CARE_PLAN_BY_PROBLEM[problem] || CARE_PLAN_BY_PROBLEM.other
  };
}
