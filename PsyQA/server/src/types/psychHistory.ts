import { EmotionType, ProblemCategory, RiskLevel } from '../services/emotionService';

export interface ConversationPortrait {
  summary: string;
  emotionalPresentation: string;
  coreConcerns: string[];
  observedPatterns: string[];
  strengths: string[];
  supportNeeds: string[];
  recommendedFocus: string;
  confidence: 'low' | 'medium' | 'high';
  llmUsed: boolean;
  generatedAt: string;
}

export interface PsychSnapshot {
  emotion: EmotionType;
  risk: RiskLevel;
  problem: ProblemCategory;
  confidence: number;
  stressLevel: number;
  anxietyLevel: number;
  moodStability: number;
  modelStressLevel?: number;
  modelAnxietyLevel?: number;
  modelMoodStability?: number;
  frameworkId?: string;
  userSelfRating?: number;
  selfRatedStress?: number;
  selfRatedAnxiety?: number;
  analysisSources?: {
    emotion?: string;
    risk?: string;
    problem?: string;
  };
}
