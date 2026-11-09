export type TrainingType = 'emotion' | 'stress' | 'cbt' | 'affirmation' | 'sleep';
export type TrainingStatus = 'in_progress' | 'completed';

export interface TrainingSession {
  id: string;
  userId: string;
  trainingType: TrainingType;
  status: TrainingStatus;
  answers: Record<string, unknown>;
  currentStep: number;
  feedback: Record<string, unknown> | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTrainingSessionInput {
  trainingType: TrainingType;
}

export interface UpdateTrainingProgressInput {
  answers?: Record<string, unknown>;
  currentStep?: number;
}

export interface CompleteTrainingInput {
  answers?: Record<string, unknown>;
  feedback?: Record<string, unknown>;
}

export const TRAINING_TYPES: TrainingType[] = [
  'emotion', 'stress', 'cbt', 'affirmation', 'sleep'
];
