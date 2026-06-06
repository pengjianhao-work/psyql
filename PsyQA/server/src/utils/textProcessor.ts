export const preprocessText = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/** 中文 + 英文混合文本的 n-gram 特征，用于相似度计算 */
export function extractChineseNGrams(text: string, minN = 2, maxN = 4): string[] {
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '');
  const grams = new Set<string>();

  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= cleaned.length - n; i++) {
      grams.add(cleaned.substring(i, i + n));
    }
  }

  preprocessText(text)
    .split(' ')
    .filter((w) => w.length > 1)
    .forEach((w) => grams.add(w));

  return Array.from(grams);
}

/** 查询与目标文本的关联度；问题标题权重高于答案正文 */
export function computeTextRelevance(
  query: string,
  targetQuestion: string,
  targetAnswer?: string
): number {
  if (!query.trim() || !targetQuestion.trim()) {
    return 0;
  }

  const queryGrams = extractChineseNGrams(query);
  if (queryGrams.length === 0) {
    return 0;
  }

  const questionGrams = new Set(extractChineseNGrams(targetQuestion));
  const answerGrams = targetAnswer ? new Set(extractChineseNGrams(targetAnswer)) : new Set<string>();
  const questionText = preprocessText(targetQuestion);
  const answerText = targetAnswer ? preprocessText(targetAnswer) : '';

  let overlapScore = 0;
  for (const gram of queryGrams) {
    if (gram.length < 2) continue;
    if (questionGrams.has(gram) || questionText.includes(gram)) {
      overlapScore += 4;
    } else if (answerGrams.has(gram) || answerText.includes(gram)) {
      overlapScore += 1;
    }
  }

  const targetGrams = new Set([...questionGrams, ...answerGrams]);
  let intersection = 0;
  queryGrams.forEach((g) => {
    if (targetGrams.has(g)) intersection++;
  });
  const union = queryGrams.length + targetGrams.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  const queryCore = query.replace(/[^\u4e00-\u9fa5]/g, '');
  let phraseBonus = 0;
  for (let len = Math.min(queryCore.length, 10); len >= 2; len--) {
    for (let i = 0; i <= queryCore.length - len; i++) {
      const sub = queryCore.slice(i, i + len);
      if (questionText.includes(sub)) {
        phraseBonus = Math.max(phraseBonus, len * 1.5);
      }
    }
  }

  return overlapScore + jaccard * 6 + phraseBonus;
}

const QUERY_EXPANSIONS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /没考好|考砸|考差|考糟|考失败|考不好/, terms: ['考试', '成绩', '考试焦虑', '学业压力', '失利'] },
  { pattern: /考试|期末|挂科|补考/, terms: ['考试焦虑', '学业压力', '成绩'] },
  { pattern: /学不进去|学不会|看不进/, terms: ['学习', '学业', '焦虑', '注意力'] },
  { pattern: /失眠|睡不着/, terms: ['睡眠', '失眠', '焦虑'] },
  { pattern: /宿舍|室友/, terms: ['宿舍关系', '人际', '边界'] },
  { pattern: /失恋|分手|暗恋/, terms: ['恋爱', '感情', '失恋'] },
  { pattern: /父母|家里|家人/, terms: ['家庭', '亲子', '沟通'] },
  { pattern: /焦虑|紧张|担心/, terms: ['焦虑', '压力', '情绪调节'] },
  { pattern: /抑郁|低落|难过|不开心/, terms: ['情绪低落', '抑郁情绪', '自我否定'] },
  { pattern: /孤独|没人理解|没朋友/, terms: ['孤独', '人际', '陪伴'] },
  { pattern: /考研|就业|未来|迷茫/, terms: ['职业未来', '考研', '迷茫'] }
];

export function expandQueryTerms(query: string): string {
  const extras = new Set<string>();
  for (const { pattern, terms } of QUERY_EXPANSIONS) {
    if (pattern.test(query)) {
      terms.forEach((t) => extras.add(t));
    }
  }
  return extras.size > 0 ? `${query} ${Array.from(extras).join(' ')}` : query;
}

export function buildRetrievalQuery(
  question: string,
  description?: string,
  extraTerms: string[] = []
): string {
  const base = [question, description, ...extraTerms].filter(Boolean).join(' ').trim();
  return expandQueryTerms(base);
}

export const cosineSimilarity = (text1: string, text2: string): number => {
  const words1 = text1.split(' ').filter((w) => w.length > 0);
  const words2 = text2.split(' ').filter((w) => w.length > 0);

  const tf1: Record<string, number> = {};
  words1.forEach((w) => {
    tf1[w] = (tf1[w] || 0) + 1;
  });

  const tf2: Record<string, number> = {};
  words2.forEach((w) => {
    tf2[w] = (tf2[w] || 0) + 1;
  });

  const allWords = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);

  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  allWords.forEach((w) => {
    const v1 = tf1[w] || 0;
    const v2 = tf2[w] || 0;
    dot += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  });

  return norm1 === 0 || norm2 === 0 ? 0 : dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
};
