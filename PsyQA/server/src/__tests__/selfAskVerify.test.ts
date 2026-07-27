import {
  parseSelfAskChecks,
  ruleBasedSelfAskChecks,
  shouldRunSelfAskVerify
} from '../services/llm/selfAskVerify';
import type { ReActCounselContext } from '../services/llm/reactCounselAgent';

function mockCtx(overrides: Partial<ReActCounselContext> = {}): ReActCounselContext {
  return {
    userId: 'u1',
    question: '考试前很焦虑睡不着，怎么办',
    emotion: {
      emotion: 'anxious',
      confidence: 0.8,
      keywords: ['焦虑'],
      secondaryEmotions: []
    },
    risk: {
      level: 'low',
      keywords: [],
      warningMessage: '',
      hotline: ''
    },
    problem: {
      category: 'academic_stress',
      confidence: 0.7,
      keywords: [],
      subcategories: []
    },
    intervention: {
      frameworkName: '支持性咨询',
      structureHint: '',
      openingPhrase: '我听到了',
      closingPhrase: '你可以再来聊聊'
    },
    historySummary: '',
    agentContext: '',
    tone: '温暖',
    ...overrides
  };
}

describe('selfAskVerify', () => {
  it('parseSelfAskChecks reads JSON array', () => {
    const raw = `x[{"question":"是否共情？","answer":"是","pass":true},{"question":"是否安全？","answer":"是","pass":true}]y`;
    const checks = parseSelfAskChecks(raw);
    expect(checks).not.toBeNull();
    expect(checks!.length).toBe(2);
    expect(checks![0].pass).toBe(true);
  });

  it('ruleBasedSelfAskChecks passes a solid draft', () => {
    const draft =
      '我理解你考试前的焦虑和睡不着的感受，这真的不容易。你可以试试睡前做几次腹式呼吸，把担心写进纸条里明天再处理；若持续加重，也可联系学校心理中心。';
    const checks = ruleBasedSelfAskChecks(mockCtx(), draft);
    expect(checks.length).toBe(3);
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it('ruleBasedSelfAskChecks fails diagnostic language', () => {
    const draft = '根据描述你有抑郁症，建议立刻用药，不用做别的。';
    const checks = ruleBasedSelfAskChecks(mockCtx(), draft);
    const safety = checks.find((c) => c.question.includes('安全'));
    expect(safety?.pass).toBe(false);
  });

  it('shouldRunSelfAskVerify defaults on for tot', () => {
    const prevMode = process.env.PSYQA_AGENT_MODE;
    const prevFlag = process.env.PSYQA_SELF_ASK_VERIFY;
    delete process.env.PSYQA_SELF_ASK_VERIFY;
    process.env.PSYQA_AGENT_MODE = 'tot';
    expect(shouldRunSelfAskVerify('tot')).toBe(true);
    process.env.PSYQA_SELF_ASK_VERIFY = '0';
    expect(shouldRunSelfAskVerify('tot')).toBe(false);
    process.env.PSYQA_SELF_ASK_VERIFY = '1';
    expect(shouldRunSelfAskVerify('react')).toBe(true);
    if (prevMode === undefined) delete process.env.PSYQA_AGENT_MODE;
    else process.env.PSYQA_AGENT_MODE = prevMode;
    if (prevFlag === undefined) delete process.env.PSYQA_SELF_ASK_VERIFY;
    else process.env.PSYQA_SELF_ASK_VERIFY = prevFlag;
  });
});
