export interface Answer {
  answer_text: string;
  has_label: boolean;
  labels_sequence: string | null;
}

export interface Question {
  question: string;
  description: string;
  keywords: string;
  answers: Answer[];
  questionID: number;
}

export interface SimilarQuestion {
  question: string;
  description: string;
  keywords: string;
  answers: Answer[];
  similarity: number;
}

export interface AskRequest {
  question: string;
  description?: string;
}

export interface AskResponse {
  question: string;
  description?: string;
  similarQuestions: SimilarQuestion[];
  answer: string;
}