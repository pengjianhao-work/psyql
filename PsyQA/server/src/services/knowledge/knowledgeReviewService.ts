import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';

export type ReviewVerdict = 'correct' | 'incorrect' | 'partial';

export interface KnowledgeReviewEntry {
  id: string;
  knowledgeQuestion: string;
  knowledgeAnswerPreview: string;
  verdict: ReviewVerdict;
  reviewerId: string;
  reviewerName: string;
  comment?: string;
  createdAt: string;
}

interface ReviewFile {
  entries: KnowledgeReviewEntry[];
}

const dataPath = resolveDataFile('knowledge_reviews.json');

function readAll(): ReviewFile {
  return readJsonFileSync<ReviewFile>(dataPath, { entries: [] });
}

function writeAll(data: ReviewFile): void {
  writeJsonFileSync(dataPath, data);
}

export function submitKnowledgeReview(input: {
  knowledgeQuestion: string;
  knowledgeAnswerPreview: string;
  verdict: ReviewVerdict;
  reviewerId: string;
  reviewerName: string;
  comment?: string;
}): KnowledgeReviewEntry {
  const data = readAll();
  const entry: KnowledgeReviewEntry = {
    id: `kr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    createdAt: new Date().toISOString()
  };
  data.entries.unshift(entry);
  if (data.entries.length > 2000) data.entries = data.entries.slice(0, 2000);
  writeAll(data);
  return entry;
}

export function listKnowledgeReviews(limit = 50): KnowledgeReviewEntry[] {
  return readAll().entries.slice(0, limit);
}

export function exportReviewsForFineTune(): Array<{ instruction: string; output: string; label: string }> {
  return readAll()
    .entries.filter((e) => e.verdict === 'correct' || e.verdict === 'partial')
    .map((e) => ({
      instruction: e.knowledgeQuestion,
      output: e.knowledgeAnswerPreview,
      label: e.verdict
    }));
}
