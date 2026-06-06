import { stripUserQuestionEcho } from '../utils/answerSanitizer';

describe('stripUserQuestionEcho', () => {
  test('removes leading duplicate of user question', () => {
    const q = '今天和舍友吵架了';
    const answer = `${q}，我能理解你现在的心情很委屈。`;
    expect(stripUserQuestionEcho(answer, q)).toBe('我能理解你现在的心情很委屈。');
  });

  test('removes 亲爱的 prefix echo', () => {
    const q = '最近失眠很严重';
    const answer = `亲爱的，${q}，睡眠问题确实让人疲惫。`;
    expect(stripUserQuestionEcho(answer, q)).toBe('睡眠问题确实让人疲惫。');
  });

  test('keeps answer when question is short', () => {
    const answer = '你好，我在这里陪你。';
    expect(stripUserQuestionEcho(answer, '嗨')).toBe(answer);
  });

  test('preserves legitimate reference mid-answer', () => {
    const q = '和室友关系不好';
    const answer = '人际摩擦很常见。和室友关系不好时，可以先从沟通边界入手。';
    expect(stripUserQuestionEcho(answer, q)).toBe(answer);
  });
});
