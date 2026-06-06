import { getUserHistory } from '../common/historyManager';
import { ProblemCategory } from '../psych/emotionService';

export interface ImplicitNeedHint {
  id: string;
  surfaceTopic: string;
  implicitConcern: string;
  confidence: number;
  suggestedPrompt: string;
}

const IMPLICIT_PATTERNS: Array<{
  surface: RegExp;
  implicit: string;
  category: ProblemCategory;
  prompt: string;
}> = [
  {
    surface: /失眠|睡不着|熬夜|入睡/i,
    implicit: '潜在学业或未来焦虑',
    category: 'academic_stress',
    prompt: '最近除了睡眠，学业或未来规划是否也让你感到压力？'
  },
  {
    surface: /胃|头痛|胸闷|疲惫|没力气/i,
    implicit: '情绪躯体化信号',
    category: 'emotion_regulation',
    prompt: '身体的不适有时与长期压力有关，你愿意聊聊最近最挂心的事吗？'
  },
  {
    surface: /没意思|无聊|懒得/i,
    implicit: '可能的低落或抑郁倾向',
    category: 'emotion_regulation',
    prompt: '「没意思」背后有时是更深的低落，最近有没有特别失落的事？'
  },
  {
    surface: /手机|游戏|刷/i,
    implicit: '逃避型应对或人际回避',
    category: 'interpersonal',
    prompt: '长时间沉浸屏幕有时是暂时逃避，是否有不想面对的关系或任务？'
  }
];

export function mineImplicitNeeds(userId: string, currentQuestion: string): ImplicitNeedHint[] {
  const history = getUserHistory(userId);
  const texts = [
    currentQuestion,
    ...(history?.dialogs.slice(-8).map((d) => `${d.user} ${d.summary}`) || [])
  ].join(' ');

  const hints: ImplicitNeedHint[] = [];
  for (const p of IMPLICIT_PATTERNS) {
    if (!p.surface.test(texts)) continue;
    const explicitAcademic = /考试|学业|成绩|考研/.test(currentQuestion);
    if (p.category === 'academic_stress' && explicitAcademic) continue;

    hints.push({
      id: `implicit_${p.category}_${hints.length}`,
      surfaceTopic: currentQuestion.slice(0, 40),
      implicitConcern: p.implicit,
      confidence: 0.62 + hints.length * 0.05,
      suggestedPrompt: p.prompt
    });
  }

  const problemCounts: Record<string, number> = {};
  for (const d of history?.dialogs.slice(-12) || []) {
    if (d.psych?.problem) {
      problemCounts[d.psych.problem] = (problemCounts[d.psych.problem] || 0) + 1;
    }
  }
  const top = Object.entries(problemCounts).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3 && !hints.some((h) => h.implicitConcern.includes(top[0]))) {
    hints.push({
      id: `implicit_hist_${top[0]}`,
      surfaceTopic: '历史对话模式',
      implicitConcern: `反复出现的 ${top[0]} 议题尚未充分展开`,
      confidence: 0.7,
      suggestedPrompt: '我注意到这个话题在你过去的对话中多次出现，想深入聊聊吗？'
    });
  }

  return hints.slice(0, 3);
}
