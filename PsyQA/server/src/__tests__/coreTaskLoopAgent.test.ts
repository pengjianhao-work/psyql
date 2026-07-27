import {
  buildThoughtPlan,
  parseThoughtPlan,
  parseReflection,
  reflectByRules
} from '../services/llm/coreTaskLoopAgent';
import type { ReActCounselContext } from '../services/llm/reactCounselAgent';
import { resolveCounselAgentMode } from '../services/llm/agentPolicy';

function mockCtx(overrides: Partial<ReActCounselContext> = {}): ReActCounselContext {
  return {
    userId: 'u1',
    question: '考试前很焦虑睡不着',
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
    prefetchedKnowledge: [
      {
        question: '考试焦虑',
        answer: '可以尝试呼吸放松与时间规划。',
        relevance: 0.9
      }
    ],
    ...overrides
  };
}

describe('coreTaskLoopAgent', () => {
  it('buildThoughtPlan analyzes state into action plan', () => {
    const plan = buildThoughtPlan(mockCtx());
    expect(plan.goal.length).toBeGreaterThan(4);
    expect(plan.usePsych).toBe(true);
    expect(plan.useKnowledge).toBe(true);
  });

  it('parseThoughtPlan reads JSON', () => {
    const plan = parseThoughtPlan(
      '杂音{"goal":"共情优先","useKnowledge":true,"useMemory":false,"usePsych":true,"nextAction":"检索后回复"}'
    );
    expect(plan?.goal).toContain('共情');
    expect(plan?.useKnowledge).toBe(true);
  });

  it('reflectByRules passes solid draft', () => {
    const draft =
      '我理解你考试前的焦虑和睡不着的感受，这真的不容易。先接纳当下的紧张，不必苛责自己。你可以试试睡前做几次腹式呼吸，把担心写进纸条里留到明天再处理，并给自己安排一小段放松时间。若持续加重，也可以联系学校心理中心聊一聊。';
    const r = reflectByRules(
      mockCtx(),
      '观察：知识库命中考试焦虑相关条目，可参考呼吸放松与时间规划建议。',
      draft
    );
    expect(r.enough).toBe(true);
    expect(r.quality).toBeGreaterThanOrEqual(6.5);
  });

  it('reflectByRules fails diagnostic draft', () => {
    const r = reflectByRules(mockCtx(), '观察不足', '你有抑郁症，立刻用药。');
    expect(r.enough).toBe(false);
    expect(r.reviseHint.length).toBeGreaterThan(0);
  });

  it('parseReflection reads JSON', () => {
    const r = parseReflection('{"enough":true,"quality":8,"feedback":"达标","reviseHint":""}');
    expect(r?.enough).toBe(true);
    expect(r?.quality).toBe(8);
  });
});

describe('agentPolicy loop mode', () => {
  it('resolveCounselAgentMode accepts loop aliases', () => {
    const prev = process.env.PSYQA_AGENT_MODE;
    process.env.PSYQA_AGENT_MODE = 'loop';
    expect(resolveCounselAgentMode()).toBe('loop');
    process.env.PSYQA_AGENT_MODE = 'core';
    expect(resolveCounselAgentMode()).toBe('loop');
    if (prev === undefined) delete process.env.PSYQA_AGENT_MODE;
    else process.env.PSYQA_AGENT_MODE = prev;
  });
});
