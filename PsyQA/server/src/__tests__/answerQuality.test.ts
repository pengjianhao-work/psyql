import { answerUsefulness, polishKnowledgeAnswer, preferUsefulAnswers } from '../services/knowledge/answerQuality';
import type { SearchResult } from '../services/knowledge/searchTypes';

function hit(id: string, answer: string, similarity: number): SearchResult {
  return { id, question: id, answer, similarity };
}

describe('polishKnowledgeAnswer', () => {
  it('drops a leading reassurance and keeps the concrete step', () => {
    const polished = polishKnowledgeAnswer(
      '我理解你的感受。可以先把今天要做的事写成三件，只完成第一件，做完再决定要不要继续。中间起来喝一口水，不要一边看消息一边写。晚上把没做完的留到明天上午，不要在睡前补。'
    );
    expect(polished.startsWith('可以先')).toBe(true);
    expect(polished.includes('我理解')).toBe(false);
  });

  it('leaves a short reply unchanged', () => {
    const answer = '先睡一觉，明天再看。';
    expect(polishKnowledgeAnswer(answer)).toBe(answer);
  });

  it('keeps an answer that already starts with a suggestion', () => {
    const answer = '建议先和室友约一个十分钟，把作息差异说清楚。后面如果还是被打扰，再把耳机和门牌用上。';
    expect(polishKnowledgeAnswer(answer)).toBe(answer);
  });
});

describe('preferUsefulAnswers', () => {
  it('lets a concrete answer pass a higher-scored short fragment', () => {
    const ordered = preferUsefulAnswers([
      hit('short', '你先别着急，慢慢来。', 0.9),
      hit(
        'long',
        '可以先把复习拆成两段，每段只做四十分钟，中间起来走一走。走完再写下一段要看的两页，做完就停，不要把没完成的部分当成今天的失败。明天用同样的两段再看一遍，只重复没记住的那两页。',
        0.8
      )
    ]);
    expect(ordered[0].id).toBe('long');
    expect(answerUsefulness(ordered[0].answer)).toBe(1);
  });
});
