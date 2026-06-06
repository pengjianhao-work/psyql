import { retrieveKnowledge, reloadKnowledgeBase } from '../services/knowledge/ragService';
import { cacheDeletePrefix } from '../utils/memoryCache';

describe('ragService cache', () => {
  beforeAll(() => {
    reloadKnowledgeBase();
  });

  beforeEach(() => {
    cacheDeletePrefix('rag:');
  });

  it('retrieveKnowledge returns cached results for identical queries', () => {
    const q = 'unique-cache-test-query-xyz';
    const first = retrieveKnowledge(q, 2);
    const second = retrieveKnowledge(q, 2);
    expect(second).toEqual(first);
    expect(first).toBe(second);
  });
});
