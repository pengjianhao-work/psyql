import { parseReActOutput, shouldUseReAct, resolveReActPlan } from '../services/llm/reactCounselAgent';
import type { ReActCounselContext } from '../services/llm/reactCounselAgent';

describe('reactCounselAgent', () => {
  it('shouldUseReAct defaults on unless disabled', () => {
    const prev = process.env.PSYQA_REACT_ENABLED;
    const prevFast = process.env.PSYQA_FAST_ANSWER;
    delete process.env.PSYQA_REACT_ENABLED;
    delete process.env.PSYQA_FAST_ANSWER;
    expect(shouldUseReAct()).toBe(true);
    process.env.PSYQA_REACT_ENABLED = '0';
    expect(shouldUseReAct()).toBe(false);
    if (prev === undefined) delete process.env.PSYQA_REACT_ENABLED;
    else process.env.PSYQA_REACT_ENABLED = prev;
    if (prevFast === undefined) delete process.env.PSYQA_FAST_ANSWER;
    else process.env.PSYQA_FAST_ANSWER = prevFast;
  });

  it('parseReActOutput extracts thought action and json input', () => {
    const raw = `Thought: 需要先查知识库
Action: search_knowledge
Action Input: {"query":"考试焦虑"}`;
    const p = parseReActOutput(raw);
    expect(p.thought).toContain('知识库');
    expect(p.action).toBe('search_knowledge');
    expect(p.actionInput.query).toBe('考试焦虑');
  });

  it('parseReActOutput handles finish action', () => {
    const raw = `Thought: 信息足够
Action: finish
Action Input: {"answer":"你好，我理解你的感受…"}`;
    const p = parseReActOutput(raw);
    expect(p.action).toBe('finish');
    expect(String(p.actionInput.answer)).toContain('理解');
  });

  it('resolveReActPlan short-circuits high risk with prefetch', () => {
    const ctx = {
      userId: 'u1',
      question: 'test',
      emotion: { emotion: 'anxious', confidence: 0.8, keywords: [] },
      risk: { level: 'high', warningMessage: '', hotline: '' },
      problem: { category: 'academic', keywords: [], subcategories: [] },
      intervention: {
        frameworkName: 'CBT',
        structureHint: '',
        openingPhrase: '',
        closingPhrase: ''
      },
      historySummary: '',
      agentContext: '',
      tone: '温和',
      prefetchedKnowledge: [{ question: 'q', answer: 'a' }]
    } as unknown as ReActCounselContext;
    const plan = resolveReActPlan(ctx);
    expect(plan.maxSteps).toBeLessThanOrEqual(3);
    expect(plan.prefetchOnly).toBe(true);
  });
});
