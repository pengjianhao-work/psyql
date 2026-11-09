export interface SearchResult {
  id: string;
  question: string;
  answer: string;
  similarity: number;
  dialogTime?: string;
  source?: 'public' | 'user';
  emotion?: string;
  trigger?: string;
  episodeId?: string;
  episodeTitle?: string;
  episodeTopic?: string;
  queryTopic?: string;
}
