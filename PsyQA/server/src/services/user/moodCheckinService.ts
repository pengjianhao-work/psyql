import { getDb } from '../../db/database';

export interface MoodCheckin {
  id: number;
  userId: string;
  mood: string;
  note: string | null;
  createdAt: string;
}

const MAX_MOOD_LEN = 20;
const MAX_NOTE_LEN = 200;

export function addMoodCheckin(userId: string, mood: string, note?: string): MoodCheckin {
  const cleanMood = mood.trim().slice(0, MAX_MOOD_LEN);
  if (!cleanMood) {
    throw new Error('mood 不能为空');
  }
  const cleanNote = note?.trim().slice(0, MAX_NOTE_LEN) || null;
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare('INSERT INTO mood_checkins(user_id, mood, note, created_at) VALUES(?, ?, ?, ?)')
    .run(userId, cleanMood, cleanNote, createdAt);
  return { id: Number(result.lastInsertRowid), userId, mood: cleanMood, note: cleanNote, createdAt };
}

export function listMoodCheckins(userId: string, limit = 30): MoodCheckin[] {
  const rows = getDb()
    .prepare(
      'SELECT id, user_id, mood, note, created_at FROM mood_checkins WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    )
    .all(userId, Math.max(1, Math.min(100, limit))) as Array<{
    id: number;
    user_id: string;
    mood: string;
    note: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    mood: row.mood,
    note: row.note,
    createdAt: row.created_at
  }));
}
