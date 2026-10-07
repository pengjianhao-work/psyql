import { SparseIndex } from '../services/knowledge/sparseIndex';
import { fuseHybridResults } from '../services/knowledge/hybridRetrieval';
import type { SearchResult } from '../services/knowledge/searchTypes';

function hit(id: string, similarity: number, answer = id): SearchResult {
  return { id, question: id, answer, similarity };
}

describe('fuseHybridResults', () => {
  it('ranks a document found by both lists above a single-list hit', () => {
    const fused = fuseHybridResults(
      [hit('a', 0.8), hit('b', 0.7)],
      [hit('b', 1, 'bb longer'), hit('c', 0.9)],
      3
    );
    expect(fused.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(fused[0].answer).toBe('bb longer');
    expect(fused[0].similarity).toBeGreaterThan(fused[1].similarity);
  });

  it('returns the only available list when the other side is empty', () => {
    const dense = [hit('a', 0.8), hit('b', 0.7)];
    expect(fuseHybridResults(dense, [], 1)).toEqual([dense[0]]);
    expect(fuseHybridResults([], dense, 1)).toEqual([dense[0]]);
  });
});

describe('SparseIndex', () => {
  it('ranks the document that shares the query words first', () => {
    const index = new SparseIndex();
    const docs = [
      '去动物园看小动物，今天天气很好',
      '和室友吵架了，宿舍气氛很差，不知道怎么相处',
      '毕业以后不知道做什么，对未来很迷茫'
    ];
    docs.forEach((text) => index.add(text));
    const ranked = index.search('和室友吵架了，宿舍气氛很差', 2);
    expect(ranked[0].index).toBe(1);
    expect(ranked[0].similarity).toBe(1);
  });
});
