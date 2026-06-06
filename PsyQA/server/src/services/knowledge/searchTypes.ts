export interface SearchResult {
  id: string;
  question: string;
  answer: string;
  similarity: number;
  dialogTime?: string;
  source?: 'public' | 'user';
}
