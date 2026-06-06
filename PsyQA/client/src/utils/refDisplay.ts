const PREVIEW_LEN = 100;

export function truncateText(text: string, maxLen = PREVIEW_LEN): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}

export function parseKeywordTags(keywords: string): string[] {
  if (!keywords?.trim()) return [];
  return keywords
    .split(/[\s,，、|/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function hasDirectTopicOverlap(query: string, target: string, minChars = 2): boolean {
  const q = query.replace(/[^\u4e00-\u9fa5]/g, '').trim();
  const t = target.replace(/[^\u4e00-\u9fa5]/g, '');
  if (q.length < minChars || !t) return false;
  const maxLen = Math.min(8, q.length);
  for (let len = maxLen; len >= minChars; len--) {
    for (let i = 0; i <= q.length - len; i++) {
      if (t.includes(q.slice(i, i + len))) return true;
    }
  }
  return false;
}

export function dedupeSimilarQuestions<T extends { question: string; similarity?: number }>(
  similar: T[],
  knowledgeQuestions: string[],
  userQuery?: string
): T[] {
  const seen = new Set(knowledgeQuestions);
  const result: T[] = [];
  const q = userQuery?.trim() || '';

  for (const item of similar) {
    if (seen.has(item.question)) continue;
    if (q) {
      const score = item.similarity ?? 0;
      const blob = item.question;
      const related =
        score >= 11 ||
        (score >= 7 && hasDirectTopicOverlap(q, blob));
      if (!related) continue;
    }
    seen.add(item.question);
    result.push(item);
  }
  return result.slice(0, 2);
}

export function filterKnowledgeForUserQuery<T extends { question: string; relevance?: number }>(
  userQuery: string,
  items: T[]
): T[] {
  const q = userQuery.trim();
  if (!q) return [];
  return items
    .filter((k) => {
      const score = k.relevance ?? 0;
      if (score >= 9) return true;
      if (score < 5.5) return false;
      return hasDirectTopicOverlap(q, k.question);
    })
    .slice(0, 2);
}
