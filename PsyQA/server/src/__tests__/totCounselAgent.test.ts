import {
  buildFallbackBranches,
  parseThoughtBranches,
  parseScoredBranches,
  scoreBranchesByRules
} from '../services/llm/totCounselAgent';
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
    ...overrides
  };
}

describe('totCounselAgent parsers', () => {
  it('parseThoughtBranches reads JSON array', () => {
    const raw = `杂音
[{"id":"A","strategy":"共情优先","empathyFocus":"接纳焦虑","suggestionFocus":"呼吸练习","riskNote":"非诊断"},{"id":"B","strategy":"行动导向","empathyFocus":"肯定倾诉","suggestionFocus":"小步骤","riskNote":"可执行"}]
尾部`;
    const branches = parseThoughtBranches(raw, 3);
    expect(branches).not.toBeNull();
    expect(branches![0].id).toBe('A');
    expect(branches![0].strategy).toContain('共情');
  });

  it('parseScoredBranches maps scores to branches', () => {
    const branches = buildFallbackBranches(mockCtx());
    const scored = parseScoredBranches(
      '[{"id":"A","score":9,"rationale":"安全"},{"id":"B","score":7,"rationale":"认知"},{"id":"C","score":8,"rationale":"行动"}]',
      branches
    );
    expect(scored).not.toBeNull();
    expect(scored!.find((b) => b.id === 'A')?.score).toBe(9);
  });

  it('scoreBranchesByRules prefers safety on high risk', () => {
    const ctx = mockCtx({
      risk: {
        level: 'critical',
        keywords: ['crisis'],
        warningMessage: '',
        hotline: ''
      }
    });
    const scored = scoreBranchesByRules(ctx, buildFallbackBranches(ctx));
    const best = [...scored].sort((a, b) => b.score - a.score)[0];
    expect(best.strategy).toMatch(/安全|稳住/);
  });

  it('buildFallbackBranches always returns 3', () => {
    expect(buildFallbackBranches(mockCtx()).length).toBe(3);
  });
});

describe('agentPolicy tot mode', () => {
  it('resolveCounselAgentMode accepts tot aliases', () => {
    const prev = process.env.PSYQA_AGENT_MODE;
    process.env.PSYQA_AGENT_MODE = 'tot';
    expect(resolveCounselAgentMode()).toBe('tot');
    process.env.PSYQA_AGENT_MODE = 'tree-of-thoughts';
    expect(resolveCounselAgentMode()).toBe('tot');
    if (prev === undefined) delete process.env.PSYQA_AGENT_MODE;
    else process.env.PSYQA_AGENT_MODE = prev;
  });
});
