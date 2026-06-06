export interface SessionFeedbackInput {
  rating?: number;
  helpful?: boolean;
  comment?: string;
}

export interface SessionFeedbackRecord {
  userId: string;
  dialogTime: string;
  rating: number | null;
  helpful: boolean | null;
  comment: string | null;
  createdAt: string;
}

export interface UserProfileConcern {
  category: string;
  label: string;
  count: number;
}

export interface UserProfilePayload {
  userId: string;
  sessionCount: number;
  feedbackCount: number;
  avgRating: number | null;
  helpfulRate: number | null;
  topConcerns: UserProfileConcern[];
  dominantEmotion: string | null;
  dominantEmotionLabel: string | null;
  avgStressLevel: number | null;
  avgAnxietyLevel: number | null;
  recentThemes: string[];
  summary: string;
  updatedAt: string;
}
