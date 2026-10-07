import { qdrantPointId } from '../services/knowledge/qdrantVectorService';

describe('qdrantPointId', () => {
  it('maps document ids to a stable UUID', () => {
    const first = qdrantPointId('kb_0');
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(qdrantPointId('kb_0')).toBe(first);
    expect(qdrantPointId('kb_1')).not.toBe(first);
  });
});
