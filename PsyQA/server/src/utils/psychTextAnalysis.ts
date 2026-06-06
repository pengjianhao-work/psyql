/** 关键词匹配：长词优先、避免重叠、否定句降权 */

const NEGATION_MARKERS = ['不', '没', '没有', '并非', '无', '别', '勿', '未', '不是', '不太', '并不'];

export function isNegatedAt(text: string, matchIndex: number): boolean {
  const window = text.slice(Math.max(0, matchIndex - 8), matchIndex);
  return NEGATION_MARKERS.some((n) => window.endsWith(n));
}

export function scoreKeywordMatches(
  text: string,
  keywords: string[],
  options?: { caseInsensitive?: boolean }
): { score: number; matched: string[] } {
  const haystack = options?.caseInsensitive !== false ? text.toLowerCase() : text;
  const sorted = [...keywords].filter(Boolean).sort((a, b) => b.length - a.length);
  const matched: string[] = [];
  const occupied: Array<[number, number]> = [];

  for (const kw of sorted) {
    const needle = options?.caseInsensitive !== false ? kw.toLowerCase() : kw;
    if (!needle) continue;
    let from = 0;
    while (from < haystack.length) {
      const idx = haystack.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const overlaps = occupied.some(([s, e]) => !(end <= s || idx >= e));
      if (!overlaps && !isNegatedAt(haystack, idx)) {
        matched.push(kw);
        occupied.push([idx, end]);
      }
      from = idx + 1;
    }
  }

  return { score: matched.length, matched };
}

/** 讨论他人/新闻语境时，降低危机词权重 */
export function isLikelyThirdPersonCrisisMention(text: string, keywordIndex: number): boolean {
  const window = text.slice(Math.max(0, keywordIndex - 12), Math.min(text.length, keywordIndex + 12));
  const thirdPerson = ['他', '她', '他们', '新闻', '报道', '听说', '据说', '视频', '电影', '剧中', '案例'];
  const firstPerson = ['我', '自己', '本人', '咱们', '咱'];
  const hasThird = thirdPerson.some((w) => window.includes(w));
  const hasFirst = firstPerson.some((w) => window.includes(w));
  return hasThird && !hasFirst;
}

export function normalizeConfidence(rawHits: number, cap = 6): number {
  if (rawHits <= 0) return 0.25;
  const ratio = rawHits / cap;
  return Math.min(0.92, 0.32 + ratio * 0.58);
}
