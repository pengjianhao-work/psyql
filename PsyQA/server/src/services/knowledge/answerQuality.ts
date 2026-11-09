import type { SearchResult } from './searchTypes';

const ACTION = /可以先|建议|试试|不妨|试着|步骤|每天|分钟|写下来|呼吸|安排|计划|记录|休息|联系|先把|先做|你可以/;
const GENERIC_START = /^(?:我理解|听起来|辛苦了|谢谢你的|抱抱|你并不孤单|我能感觉到|看到你|你愿意|你的感受)/;

/** 去掉开头的纯安抚，留下后面的具体做法。不足 80 字的原样返回。 */
export function polishKnowledgeAnswer(answer: string, maxLen = 480): string {
  const text = answer.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= 80) return text;
  const parts = text
    .split(/(?<=[。！？])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return clip(text, maxLen);
  let start = 0;
  while (start < parts.length - 1 && GENERIC_START.test(parts[start]) && !ACTION.test(parts[start])) {
    start += 1;
  }
  return clip(parts.slice(start).join(''), maxLen);
}

export function answerUsefulness(answer: string): number {
  const text = answer.replace(/\s+/g, ' ').trim();
  if (text.length < 80) return 0.72;
  if (ACTION.test(text)) return 1;
  return 0.9;
}

/** 具体做法优先，过短片段让出位置。 */
export function preferUsefulAnswers(items: SearchResult[]): SearchResult[] {
  const adjusted = items.map((item) => {
    const answer = polishKnowledgeAnswer(item.answer);
    return { ...item, answer, similarity: item.similarity * answerUsefulness(answer) };
  });
  return [...adjusted].sort((a, b) => b.similarity - a.similarity);
}

function clip(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const last = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
  if (last > maxLen * 0.55) return cut.slice(0, last + 1);
  return cut.trim();
}
