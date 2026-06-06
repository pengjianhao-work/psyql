import { getDb } from './database';
import type { SessionFeedbackInput, SessionFeedbackRecord } from '../types/userProfile';

export function dialogExists(userId: string, dialogTime: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM dialogs WHERE user_id = ? AND dialog_time = ?')
    .get(userId, dialogTime);
  return Boolean(row);
}

export function saveSessionFeedback(
  userId: string,
  dialogTime: string,
  input: SessionFeedbackInput
): SessionFeedbackRecord {
  const now = new Date().toISOString();
  const rating =
    input.rating !== undefined && input.rating !== null
      ? Math.min(5, Math.max(1, Math.round(Number(input.rating))))
      : null;
  const helpful =
    input.helpful === undefined || input.helpful === null ? null : input.helpful ? 1 : 0;
  const comment = input.comment?.trim() ? input.comment.trim().slice(0, 500) : null;

  getDb()
    .prepare(
      `INSERT INTO session_feedback(user_id, dialog_time, rating, helpful, comment, created_at)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, dialog_time) DO UPDATE SET
         rating = COALESCE(excluded.rating, session_feedback.rating),
         helpful = COALESCE(excluded.helpful, session_feedback.helpful),
         comment = COALESCE(excluded.comment, session_feedback.comment),
         created_at = excluded.created_at`
    )
    .run(userId, dialogTime, rating, helpful, comment, now);

  return getSessionFeedback(userId, dialogTime)!;
}

export function getSessionFeedback(
  userId: string,
  dialogTime: string
): SessionFeedbackRecord | null {
  const row = getDb()
    .prepare(
      `SELECT user_id, dialog_time, rating, helpful, comment, created_at
       FROM session_feedback WHERE user_id = ? AND dialog_time = ?`
    )
    .get(userId, dialogTime) as
    | {
        user_id: string;
        dialog_time: string;
        rating: number | null;
        helpful: number | null;
        comment: string | null;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    userId: row.user_id,
    dialogTime: row.dialog_time,
    rating: row.rating,
    helpful: row.helpful === null ? null : row.helpful === 1,
    comment: row.comment,
    createdAt: row.created_at
  };
}

export function listSessionFeedback(userId: string): SessionFeedbackRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT user_id, dialog_time, rating, helpful, comment, created_at
       FROM session_feedback WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId) as Array<{
    user_id: string;
    dialog_time: string;
    rating: number | null;
    helpful: number | null;
    comment: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    userId: row.user_id,
    dialogTime: row.dialog_time,
    rating: row.rating,
    helpful: row.helpful === null ? null : row.helpful === 1,
    comment: row.comment,
    createdAt: row.created_at
  }));
}

export function clearUserFeedback(userId: string): void {
  getDb().prepare('DELETE FROM session_feedback WHERE user_id = ?').run(userId);
}

export function clearUserProfileRow(userId: string): void {
  getDb().prepare('DELETE FROM user_profile WHERE user_id = ?').run(userId);
}
