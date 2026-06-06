export interface CbtChoice {
  id: string;
  text: string;
  isAdaptive: boolean;
  feedback: string;
}

export interface CbtStep {
  scenario: string;
  thought: string;
  choices: CbtChoice[];
}

export interface CbtMicroModule {
  id: string;
  title: string;
  topic: 'anxiety' | 'interpersonal';
  framework: 'CBT';
  steps: CbtStep[];
  completionBonus: { moodStability: number; confidence: number };
}

const ANXIETY_MODULE: CbtMicroModule = {
  id: 'cbt_anxiety_exam',
  title: '考前焦虑 · 认知重构小练习',
  topic: 'anxiety',
  framework: 'CBT',
  completionBonus: { moodStability: 3, confidence: 2 },
  steps: [
    {
      scenario: '明天有一门重要考试，你复习时突然想到「我肯定考不好」。',
      thought: '「我肯定考不好」',
      choices: [
        {
          id: 'a1',
          text: '这证明我能力不行，不如放弃复习',
          isAdaptive: false,
          feedback: '这是「全或无」思维——一次考试不能定义你的全部能力。'
        },
        {
          id: 'a2',
          text: '我过去也有考砸的时候，但多数考试都顺利通过了',
          isAdaptive: true,
          feedback: '很好！用具体证据挑战灾难化预测，是 CBT 的核心技巧。'
        },
        {
          id: 'a3',
          text: '先列出已掌握的知识点，再补 1-2 个薄弱项',
          isAdaptive: true,
          feedback: '行动导向的替代思维能有效降低焦虑的生理唤醒。'
        }
      ]
    },
    {
      scenario: '走进考场前心跳加速、手心出汗。',
      thought: '「我紧张说明我会失败」',
      choices: [
        {
          id: 'b1',
          text: '紧张=失败，我应该立刻离开',
          isAdaptive: false,
          feedback: '紧张是身体的正常应激反应，不等于表现会差。'
        },
        {
          id: 'b2',
          text: '做 4-7-8 呼吸法，把紧张当作「身体在帮我集中注意力」',
          isAdaptive: true,
          feedback: '将生理反应重新解读（再框架）能显著降低考试焦虑。'
        }
      ]
    }
  ]
};

const INTERPERSONAL_MODULE: CbtMicroModule = {
  id: 'cbt_interpersonal_conflict',
  title: '人际矛盾 · 沟通认知练习',
  topic: 'interpersonal',
  framework: 'CBT',
  completionBonus: { moodStability: 4, confidence: 2 },
  steps: [
    {
      scenario: '室友没有提前说就用了你的东西，你很生气。',
      thought: '「他根本不尊重我」',
      choices: [
        {
          id: 'c1',
          text: '立刻冷战，让他自己体会',
          isAdaptive: false,
          feedback: '回避可能让误解加深；CBT 鼓励检验想法是否绝对正确。'
        },
        {
          id: 'c2',
          text: '用「我感受」句式表达：「我感到不被尊重，希望以后先问我」',
          isAdaptive: true,
          feedback: '非暴力沟通 + 认知检验，是人际 CBT 的经典组合。'
        },
        {
          id: 'c3',
          text: '先确认是否有误会，再决定如何沟通',
          isAdaptive: true,
          feedback: '在下定论前收集证据，能避免「读心术」认知偏差。'
        }
      ]
    }
  ]
};

export function pickCbtModule(problem?: string, emotion?: string): CbtMicroModule {
  if (
    problem === 'interpersonal' ||
    problem === 'family_relationship' ||
    problem === 'romantic_relationship'
  ) {
    return INTERPERSONAL_MODULE;
  }
  return ANXIETY_MODULE;
}

export function scoreCbtCompletion(
  module: CbtMicroModule,
  selections: Record<number, string>
): { score: number; adaptiveCount: number; total: number; message: string } {
  let adaptiveCount = 0;
  module.steps.forEach((step, idx) => {
    const choiceId = selections[idx];
    const choice = step.choices.find((c) => c.id === choiceId);
    if (choice?.isAdaptive) adaptiveCount += 1;
  });
  const total = module.steps.length;
  const score = total ? Math.round((adaptiveCount / total) * 100) : 0;
  const message =
    score >= 80
      ? '你已较好掌握认知重构技巧，心理画像平稳度将小幅提升。'
      : score >= 50
        ? '部分选择可再思考，建议回顾「适应性思维」选项的反馈。'
        : '认知偏差识别需要练习，可随时重做本模块。';
  return { score, adaptiveCount, total, message };
}
