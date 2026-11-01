import {
  averageColbertScore,
  buildKnowledgeQuery,
  detectQdrantSchema
} from '../services/knowledge/qdrantHybrid';

describe('detectQdrantSchema', () => {
  it('recognizes the single-vector collection and the hybrid collection', () => {
    expect(detectQdrantSchema({ vectors: { size: 1024, distance: 'Cosine' } })).toBe('legacy');
    expect(
      detectQdrantSchema({
        vectors: {
          dense: { size: 1024 },
          colbert: { multivector_config: { comparator: 'max_sim' } }
        },
        sparse_vectors: { lexical: {} }
      })
    ).toBe('hybrid');
    expect(detectQdrantSchema(null)).toBe('missing');
  });
});

describe('buildKnowledgeQuery', () => {
  const encoded = {
    dense: [0.1, 0.2],
    sparse: { indices: [7], values: [0.4] },
    colbert: [
      [0.1, 0.2],
      [0.3, 0.4]
    ]
  };

  it('recalls with dense and sparse, then rescores with colbert', () => {
    const body = buildKnowledgeQuery(encoded, 5);
    const outer = body.prefetch as Array<{ prefetch: unknown[]; query: { fusion: string } }>;
    expect(outer[0].query.fusion).toBe('rrf');
    expect(outer[0].prefetch).toHaveLength(2);
    expect(body.using).toBe('colbert');
    expect(body.query).toBe(encoded.colbert);
    expect(body.limit).toBe(5);
  });

  it('turns the summed MaxSim back into an average from 0 to 1', () => {
    expect(averageColbertScore(1.2, 2)).toBeCloseTo(0.6);
    expect(averageColbertScore(3, 2)).toBe(1);
    expect(averageColbertScore(-1, 2)).toBe(0);
  });
});
