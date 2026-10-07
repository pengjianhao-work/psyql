import { demoteUnrequestedCrisis, orderByRerankScores } from '../services/knowledge/rerankService';
import type { SearchResult } from '../services/knowledge/searchTypes';

function hit(id: string): SearchResult {
  return { id, question: id, answer: id, similarity: 0.5 };
}

describe('orderByRerankScores', () => {
  it('puts the higher rerank score first and keeps the requested count', () => {
    const items = [hit('a'), hit('b'), hit('c')];
    const ordered = orderByRerankScores(
      items,
      [
        { index: 2, score: 0.2 },
        { index: 0, score: 0.9 }
      ],
      2
    );
    expect(ordered.map((item) => item.id)).toEqual(['a', 'c']);
    expect(ordered[0].similarity).toBeCloseTo(0.9);
  });

  it('moves a crisis title behind ordinary matches when the query is not a crisis', () => {
    const items = [
      hit('知道学习重要但学不进去，活着很累，绝望想死？'),
      hit('半期没考好，最近学习压力很大很压抑，怎么办？')
    ];
    items[0].question = items[0].id;
    items[1].question = items[1].id;
    const ordered = demoteUnrequestedCrisis('最近学习压力很大，学不进去怎么办', items);
    expect(ordered[0].id).toBe('半期没考好，最近学习压力很大很压抑，怎么办？');
  });

  it('keeps crisis titles in front when the query itself mentions wanting to die', () => {
    const items = [hit('绝望想死？'), hit('学习压力很大')];
    items[0].question = items[0].id;
    items[1].question = items[1].id;
    const ordered = demoteUnrequestedCrisis('我不想活了，想死', items);
    expect(ordered[0].id).toBe('绝望想死？');
  });

  it('appends unscored items in their original order', () => {
    const items = [hit('a'), hit('b'), hit('c')];
    const ordered = orderByRerankScores(items, [{ index: 1, score: 0.4 }], 3);
    expect(ordered.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });
});
