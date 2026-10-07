import type { SearchResult } from './searchTypes';

const RRF_K = 10;
const SPARSE_RRF_WEIGHT = 0.7;

/**
 * 加权倒数排名融合。稠密名次权重大于稀疏名次，两边靠前都出现的文档会升到前面。
 * 只在稀疏名单中段出现、稠密名单里也很靠后的文档，不会压过稠密检索的第一条。
 * 融合分映射到 0.62–0.90，便于和个人记忆的余弦分一起排序。
 */
export function fuseHybridResults(
  dense: SearchResult[],
  sparse: SearchResult[],
  topK: number
): SearchResult[] {
  if (topK <= 0) return [];
  if (!dense.length) return sparse.slice(0, topK);
  if (!sparse.length) return dense.slice(0, topK);

  const rows = new Map<string, { item: SearchResult; score: number }>();
  const absorb = (list: SearchResult[], weight: number) => {
    list.forEach((item, rank) => {
      const key = item.id || item.question.slice(0, 80);
      const gain = weight / (RRF_K + rank + 1);
      const prev = rows.get(key);
      if (!prev) {
        rows.set(key, { item, score: gain });
        return;
      }
      prev.score += gain;
      if (item.answer.length > prev.item.answer.length) prev.item = item;
    });
  };
  absorb(dense, 1);
  absorb(sparse, SPARSE_RRF_WEIGHT);

  const ranked = [...rows.values()].sort((a, b) => b.score - a.score).slice(0, topK);
  const topScore = ranked[0]?.score || 1;
  return ranked.map(({ item, score }) => ({
    ...item,
    similarity: 0.62 + 0.28 * (score / topScore)
  }));
}
