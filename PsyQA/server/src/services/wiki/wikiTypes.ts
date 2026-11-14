/**
 * LLM Wiki 的共享类型。
 * 一页 wiki = 一个心理主题的离线聚合知识，正文由 LLM 生成、校验后入库；
 * 在线只检索已发布页，不现场生成。
 */

export type WikiStatus = 'draft' | 'published' | 'archived';

export interface WikiSourceRef {
  /** 真实存在的 vector_documents.id，引用透传靠它 */
  docId: string;
  question: string;
  answer: string;
}

export interface WikiSection {
  heading: string;
  body: string;
}

export interface WikiPage {
  slug: string;
  title: string;
  category: string;
  summary: string;
  sections: WikiSection[];
  relatedQuestions: string[];
  sourceRefs: WikiSourceRef[];
  status: WikiStatus;
  model: string;
  promptHash: string;
  updatedAt: string;
}

export interface WikiPageWithEmbedding {
  page: WikiPage;
  embedding: number[] | null;
}

export interface WikiHit {
  slug: string;
  title: string;
  category: string;
  summary: string;
  sections: WikiSection[];
  score: number;
  sourceDocIds: string[];
}

export interface WikiListParams {
  category?: string;
  status?: WikiStatus | 'all';
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface WikiListResult {
  total: number;
  page: number;
  pageSize: number;
  items: Array<
    Pick<WikiPage, 'slug' | 'title' | 'category' | 'summary' | 'status' | 'updatedAt'> & {
      sourceCount: number;
      sectionCount: number;
      hasEmbedding: boolean;
    }
  >;
}
