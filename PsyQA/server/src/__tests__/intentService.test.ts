import { classifyIntent, mergeIntent } from '../services/psych/intentService';

describe('classifyIntent', () => {
  test('treats a bare hello as greeting', () => {
    expect(classifyIntent('你好').kind).toBe('greeting');
    expect(classifyIntent('在吗').kind).toBe('greeting');
  });

  test('keeps a greeting that already asks for help as advice', () => {
    expect(classifyIntent('你好，我最近和室友吵架了怎么办').kind).toBe('advice');
  });

  test('treats emotional disclosure without a request as venting', () => {
    expect(classifyIntent('室友又吵起来了，我好难受').kind).toBe('venting');
  });

  test('treats a continuation cue as followup', () => {
    expect(classifyIntent('然后呢').kind).toBe('followup');
    expect(classifyIntent('继续', { hasHistory: true }).kind).toBe('followup');
    expect(classifyIntent('好的', { hasHistory: true }).kind).toBe('followup');
    expect(classifyIntent('你好', { hasHistory: true }).kind).toBe('greeting');
    expect(classifyIntent('继续').kind).not.toBe('followup');
  });

  test('locks first-person crisis and leaves third-person mentions alone', () => {
    expect(classifyIntent('我想死').kind).toBe('crisis');
    expect(classifyIntent('听说他想死').kind).not.toBe('crisis');
  });

  test('routes unrelated tasks away and keeps stressed study talk in counseling', () => {
    expect(classifyIntent('帮我写一段 python 代码').kind).toBe('offtopic');
    expect(classifyIntent('论文写不出来，压力好大').kind).toBe('venting');
  });
});

describe('mergeIntent', () => {
  test('does not let the model downgrade a crisis rule', () => {
    const rule = classifyIntent('我想死');
    expect(mergeIntent(rule, 'venting').intent.kind).toBe('crisis');
  });

  test('accepts a model intent when the rule is unsure', () => {
    const rule = classifyIntent('啊');
    expect(rule.confidence).toBeLessThan(0.6);
    expect(mergeIntent(rule, 'advice').intent.kind).toBe('advice');
  });
});
