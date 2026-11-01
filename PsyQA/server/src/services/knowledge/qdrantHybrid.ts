export const DENSE_NAME = 'dense';
export const COLBERT_NAME = 'colbert';
export const LEXICAL_NAME = 'lexical';
export const COLBERT_KEEP = 64;
export const VECTOR_DIM = 1024;

export type QdrantSchema = 'hybrid' | 'legacy' | 'missing';

export interface HybridEncoded {
  dense: number[];
  sparse: { indices: number[]; values: number[] };
  colbert: number[][];
}

/** 从 Qdrant 集合配置判断是旧的单向量，还是 dense + 稀疏 + colbert。 */
export function detectQdrantSchema(params: unknown): QdrantSchema {
  if (!params || typeof params !== 'object') return 'missing';
  const record = params as { vectors?: unknown; sparse_vectors?: { lexical?: unknown } };
  const vectors = record.vectors;
  if (!vectors || typeof vectors !== 'object') return 'missing';
  if (typeof (vectors as { size?: unknown }).size === 'number') return 'legacy';
  const named = vectors as { dense?: { size?: number }; colbert?: { multivector_config?: unknown } };
  if (named.dense?.size && named.colbert?.multivector_config && record.sparse_vectors?.lexical) {
    return 'hybrid';
  }
  return 'missing';
}

/**
 * 先用整句向量和稀疏权重召回，再用 colbert 对这批候选做 MaxSim。
 * colbert 没有全库图，只读被召回的那些点。
 */
export function buildKnowledgeQuery(encoded: HybridEncoded, limit: number): Record<string, unknown> {
  const prefetchLimit = Math.max(limit * 3, 40);
  const branches: Record<string, unknown>[] = [
    { query: encoded.dense, using: DENSE_NAME, limit: prefetchLimit }
  ];
  if (
    encoded.sparse.indices.length > 0 &&
    encoded.sparse.indices.length === encoded.sparse.values.length
  ) {
    branches.push({
      query: { indices: encoded.sparse.indices, values: encoded.sparse.values },
      using: LEXICAL_NAME,
      limit: prefetchLimit
    });
  }
  if (encoded.colbert.length > 0) {
    return {
      prefetch: [
        {
          prefetch: branches,
          query: { fusion: 'rrf' },
          limit: Math.max(limit * 2, 24)
        }
      ],
      query: encoded.colbert,
      using: COLBERT_NAME,
      limit,
      with_payload: true
    };
  }
  return {
    prefetch: branches,
    query: { fusion: 'rrf' },
    limit,
    with_payload: true
  };
}

/** Qdrant 的 MaxSim 是每个查询词的最大相似度之和，除以词数后回到 0–1。 */
export function averageColbertScore(score: number, queryTokens: number): number {
  if (!Number.isFinite(score) || queryTokens <= 0) return 0;
  const average = score / queryTokens;
  if (average < 0) return 0;
  if (average > 1) return 1;
  return average;
}
