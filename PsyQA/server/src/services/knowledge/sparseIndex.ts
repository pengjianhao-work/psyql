import { preprocessText } from '../../utils/textProcessor';

const K1 = 1.2;
const B = 0.75;
const QUESTION_WEIGHT = 3;

/** 字符二元组倒排索引，供 BM25 稀疏检索。 */
export class SparseIndex {
  private postings = new Map<string, number[]>();
  private docLengths: number[] = [];
  private totalLength = 0;

  clear(): void {
    this.postings.clear();
    this.docLengths = [];
    this.totalLength = 0;
  }

  get size(): number {
    return this.docLengths.length;
  }

  add(question: string, answer = ''): void {
    const docIndex = this.docLengths.length;
    const tf = new Map<string, number>();
    for (const [term, count] of countTokens(question)) tf.set(term, count * QUESTION_WEIGHT);
    for (const [term, count] of countTokens(answer)) tf.set(term, (tf.get(term) || 0) + count);
    let length = 0;
    for (const [term, count] of tf) {
      length += count;
      const list = this.postings.get(term);
      if (list) list.push(docIndex, count);
      else this.postings.set(term, [docIndex, count]);
    }
    const docLength = length || 1;
    this.docLengths.push(docLength);
    this.totalLength += docLength;
  }

  search(query: string, topK: number): Array<{ index: number; similarity: number; raw: number }> {
    if (!this.docLengths.length || topK <= 0) return [];
    const queryTerms = countTokens(query);
    if (!queryTerms.size) return [];

    const docCount = this.docLengths.length;
    const avgLen = this.totalLength / docCount || 1;
    const scores = new Map<number, number>();

    for (const [term, queryCount] of queryTerms) {
      const list = this.postings.get(term);
      if (!list || list.length === 0) continue;
      const df = list.length / 2;
      if (df > docCount * 0.45) continue;
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
      const queryWeight = 1 + Math.log(queryCount);
      for (let i = 0; i < list.length; i += 2) {
        const doc = list[i];
        const tf = list[i + 1];
        const docLength = this.docLengths[doc] || 1;
        const denom = tf + K1 * (1 - B + (B * docLength) / avgLen);
        const gain = idf * ((tf * (K1 + 1)) / denom) * queryWeight;
        scores.set(doc, (scores.get(doc) || 0) + gain);
      }
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);
    const maxScore = ranked[0]?.[1] || 1;
    return ranked.map(([index, score]) => ({ index, similarity: score / maxScore, raw: score }));
  }
}

function countTokens(text: string): Map<string, number> {
  const processed = preprocessText(text);
  const counts = new Map<string, number>();
  const add = (term: string) => {
    if (term.length < 2 || /\s/.test(term)) return;
    counts.set(term, (counts.get(term) || 0) + 1);
  };
  for (let i = 0; i < processed.length - 1; i++) add(processed.slice(i, i + 2));
  for (const word of processed.split(' ')) add(word);
  return counts;
}
