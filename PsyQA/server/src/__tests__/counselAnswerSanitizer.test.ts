import {
  hasReActLeak,
  isValidCounselAnswer,
  sanitizeCounselAnswer
} from '../services/llm/counselAnswerSanitizer';

describe('counselAnswerSanitizer', () => {
  const goodAnswer =
    '亲爱的朋友，我能感受到你最近学习压力很大。先允许自己休息片刻，把任务拆成小块，每完成一小步就给自己一点肯定。若持续难以入睡或情绪很低落，可以联系学校心理中心或拨打心理援助热线。';

  test('detects react leak', () => {
    expect(hasReActLeak('Thought: x\nAction: finish')).toBe(true);
    expect(hasReActLeak(goodAnswer)).toBe(false);
  });

  test('extracts answer from leaked finish json', () => {
    const leaked = `Thought: 用户学习压力大
Action: search psych
Action Input: {"answer":"${goodAnswer}"}`;
    expect(sanitizeCounselAnswer(leaked)).toBe(goodAnswer);
    expect(isValidCounselAnswer(sanitizeCounselAnswer(leaked))).toBe(true);
  });

  test('rejects raw react blob as valid answer', () => {
    expect(isValidCounselAnswer('Action: finish\nAction Input: {}')).toBe(false);
  });
});
