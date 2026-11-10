import { randomBytes } from 'crypto';
import { getDb } from './database';
import {
  TrainingSession,
  TrainingType,
  TrainingStatus
} from '../types/training';

interface TrainingSessionRow {
  id: string;
  user_id: string;
  training_type: TrainingType;
  status: TrainingStatus;
  answers_json: string;
  current_step: number;
  feedback_json: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function toSession(row: TrainingSessionRow): TrainingSession {
  return {
    id: row.id,
    userId: row.user_id,
    trainingType: row.training_type,
    status: row.status,
    answers: parseObject(row.answers_json) ?? {},
    currentStep: row.current_step,
    feedback: parseObject(row.feedback_json),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export function createTrainingSession(userId: string, trainingType: TrainingType): TrainingSession {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO training_sessions
      (id, user_id, training_type, status, answers_json, current_step, started_at, updated_at)
    VALUES (?, ?, ?, 'in_progress', '{}', 0, ?, ?)
  `).run(id, userId, trainingType, now, now);
  return getTrainingSession(userId, id)!;
}

export function getTrainingSession(userId: string, id: string): TrainingSession | null {
  const row = getDb().prepare(
    'SELECT * FROM training_sessions WHERE id = ? AND user_id = ?'
  ).get(id, userId) as TrainingSessionRow | undefined;
  return row ? toSession(row) : null;
}

export function updateTrainingProgress(
  userId: string,
  id: string,
  answers: Record<string, unknown> | undefined,
  currentStep: number | undefined
): TrainingSession | null {
  const existing = getTrainingSession(userId, id);
  if (!existing || existing.status !== 'in_progress') return null;

  const nextAnswers = answers ? { ...existing.answers, ...answers } : existing.answers;
  const nextStep = currentStep === undefined ? existing.currentStep : currentStep;
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE training_sessions
    SET answers_json = ?, current_step = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'in_progress'
  `).run(JSON.stringify(nextAnswers), nextStep, now, id, userId);
  return getTrainingSession(userId, id);
}

export function completeTrainingSession(
  userId: string,
  id: string,
  answers?: Record<string, unknown>,
  feedback?: Record<string, unknown>
): TrainingSession | null {
  const existing = getTrainingSession(userId, id);
  if (!existing) return null;
  if (existing.status === 'completed') return existing;

  const nextAnswers = answers ? { ...existing.answers, ...answers } : existing.answers;
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE training_sessions
    SET answers_json = ?, feedback_json = ?, status = 'completed',
        updated_at = ?, completed_at = ?
    WHERE id = ? AND user_id = ? AND status = 'in_progress'
  `).run(
    JSON.stringify(nextAnswers),
    feedback ? JSON.stringify(feedback) : null,
    now, now, id, userId
  );
  return getTrainingSession(userId, id);
}

export function listTrainingSessions(
  userId: string,
  limit = 30,
  offset = 0
): TrainingSession[] {
  const rows = getDb().prepare(`
    SELECT * FROM training_sessions
    WHERE user_id = ?
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset) as TrainingSessionRow[];
  return rows.map(toSession);
}
