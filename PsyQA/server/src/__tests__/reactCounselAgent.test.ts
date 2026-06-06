import { parseReActOutput, resolveReActPlan } from '../services/llm/reactCounselAgent';
import type { ReActCounselContext } from '../services/llm/reactCounselAgent';

describe('parseReActOutput', () => {
  test('parses thought action and json input', () => {
    const raw = `Thought: 需要先查知识库
Action: search_knowledge
Action Input: {"query":"宿舍矛盾"}`;
    const parsed = parseReActOutput(raw);
    expect(parsed.action).toBe('search_knowledge');
    expect(parsed.actionInput.query).toBe('宿舍矛盾');
    expect(parsed.thought).toContain('知识库');
  });

  test('rejects unknown actions', () => {
    const parsed = parseReActOutput('Action: fly_to_moon\nAction Input: {}');
    expect(parsed.action).toBeUndefined();
  });

  test('parse finish with answer', () => {
    const parsed = parseReActOutput(
      'Action: finish\nAction Input: {"answer":"这是一段足够长的测试回复，用于验证 finish 解析是否正常工作。"}'
    );
    expect(parsed.action).toBe('finish');
    expect(String(parsed.actionInput.answer)).toContain('测试回复');
  });
});

describe('resolveReActPlan', () => {
  const baseCtx = {
    userId: 'demo',
    question: '测试',
    emotion: { emotion: 'anxious', confidence: 0.6, keywords: [], secondaryEmotions: [] },
    risk: { level: 'low', keywords: [], warningMessage: '', hotline: '400' },
    problem: { category: 'other', confidence: 0.5, keywords: [], subcategories: [] },
    intervention: {
      frameworkName: 'CBT',
      structureHint: '',
      openingPhrase: '你好',
      closingPhrase: '保重'
    },
    historySummary: '',
    agentContext: '',
    tone: '温和'
  } as ReActCounselContext;

  test('prefetch plan when knowledge prefetched', () => {
    const plan = resolveReActPlan({
      ...baseCtx,
      prefetchedKnowledge: [{ question: 'q', answer: 'a' }]
    });
    expect(plan.prefetchOnly).toBe(true);
  });

  test('demo mode disables prefetch shortcut', () => {
    const prev = process.env.PSYQA_REACT_DEMO;
    process.env.PSYQA_REACT_DEMO = '1';
    const plan = resolveReActPlan({
      ...baseCtx,
      prefetchedKnowledge: [{ question: 'q', answer: 'a' }]
    });
    expect(plan.prefetchOnly).toBe(false);
    if (prev === undefined) delete process.env.PSYQA_REACT_DEMO;
    else process.env.PSYQA_REACT_DEMO = prev;
  });
});
