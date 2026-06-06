import { SimilarQuestion } from '../types';
import { KnowledgeItem } from '../services/knowledge/ragService';
import { computeTextRelevance } from './textProcessor';

/** 同义/近义主题词：命中任一词即视为与组内其他词有主题重叠 */
const TOPIC_SYNONYM_GROUPS: string[][] = [
  ['舍友', '室友', '宿舍', '寝室'],
  ['失眠', '睡不着', '入睡'],
  ['焦虑', '紧张', '担心'],
  ['抑郁', '低落', '难过']
];

function expandWithSynonyms(text: string): string {
  let expanded = text;
  for (const group of TOPIC_SYNONYM_GROUPS) {
    if (group.some((w) => text.includes(w))) {
      expanded += group.join('');
    }
  }
  return expanded;
}

/** 用户原话与目标文本是否共享足够长的中文片段（避免仅因泛化词命中） */
export function hasDirectTopicOverlap(query: string, target: string, minChars = 2): boolean {
  const q = expandWithSynonyms(query.replace(/[^\u4e00-\u9fa5]/g, '').trim());
  const t = expandWithSynonyms(target.replace(/[^\u4e00-\u9fa5]/g, ''));
  if (q.length < minChars || !t) return false;

  const maxLen = Math.min(8, q.length);
  for (let len = maxLen; len >= minChars; len--) {
    for (let i = 0; i <= q.length - len; i++) {
      if (t.includes(q.slice(i, i + len))) return true;
    }
  }
  return false;
}

const MIN_DISPLAY_SIMILAR_SCORE = 7;
const MIN_DISPLAY_KNOWLEDGE_SCORE = 5.5;
const STRONG_SIMILAR_SCORE = 11;
const STRONG_KNOWLEDGE_SCORE = 9;

export function filterSimilarQuestionsForDisplay(
  query: string,
  description: string | undefined,
  items: SimilarQuestion[],
  max = 2
): SimilarQuestion[] {
  const raw = [query, description].filter(Boolean).join(' ').trim();
  if (!raw) return [];

  return items
    .filter((sq) => {
      const score = sq.similarity ?? 0;
      if (score < MIN_DISPLAY_SIMILAR_SCORE) return false;
      if (score >= STRONG_SIMILAR_SCORE) return true;
      const blob = `${sq.question} ${sq.description || ''}`;
      return hasDirectTopicOverlap(raw, sq.question) || hasDirectTopicOverlap(raw, blob);
    })
    .slice(0, max);
}

export function filterKnowledgeForDisplay(
  query: string,
  items: KnowledgeItem[],
  max = 2
): KnowledgeItem[] {
  const raw = query.trim();
  if (!raw) return [];

  return items
    .filter((k) => {
      const score = k.relevance ?? computeTextRelevance(raw, k.question, k.answer);
      if (score < MIN_DISPLAY_KNOWLEDGE_SCORE) return false;
      if (score >= STRONG_KNOWLEDGE_SCORE) return true;
      return (
        hasDirectTopicOverlap(raw, k.question) ||
        hasDirectTopicOverlap(raw, k.answer)
      );
    })
    .slice(0, max);
}
