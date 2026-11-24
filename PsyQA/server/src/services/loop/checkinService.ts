import { getDb } from '../../db/database';

export interface WellbeingCheckin {
  id: number;
  mood: string;
  stress: number | null;
  sleepHours: number | null;
  energy: number | null;
  eventText: string;
  skipped: boolean;
  createdAt: string;
}

const clamp15 = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : null;

const clampSleep = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(24, Math.max(0, v)) : null;

export function createWellbeingCheckin(
  userId: string,
  input: {
    mood?: string;
    stress?: number | null;
    sleepHours?: number | null;
    energy?: number | null;
    eventText?: string;
    skipped?: boolean;
  }
): WellbeingCheckin {
  const now = new Date().toISOString();
  const skipped = input.skipped === true;
  const mood = String(input.mood ?? '').slice(0, 30);
  const eventText = String(input.eventText ?? '').slice(0, 500);
  if (!skipped && !mood.trim() && input.stress == null && input.energy == null) {
    throw new Error('打卡至少要写一点内容，或者选择跳过');
  }
  const res = getDb()
    .prepare(
      `INSERT INTO wellbeing_checkins (user_id, mood, stress, sleep_hours, energy, event_text, skipped, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      skipped ? '' : mood,
      skipped ? null : clamp15(input.stress),
      skipped ? null : clampSleep(input.sleepHours),
      skipped ? null : clamp15(input.energy),
      skipped ? '' : eventText,
      skipped ? 1 : 0,
      now
    );
  return {
    id: Number(res.lastInsertRowid),
    mood: skipped ? '' : mood,
    stress: skipped ? null : clamp15(input.stress),
    sleepHours: skipped ? null : clampSleep(input.sleepHours),
    energy: skipped ? null : clamp15(input.energy),
    eventText: skipped ? '' : eventText,
    skipped,
    createdAt: now
  };
}

export function listWellbeingCheckins(userId: string, limit = 14): WellbeingCheckin[] {
  const rows = getDb()
    .prepare(
      `SELECT id, mood, stress, sleep_hours, energy, event_text, skipped, created_at
       FROM wellbeing_checkins WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(userId, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    mood: String(r.mood ?? ''),
    stress: (r.stress as number | null) ?? null,
    sleepHours: (r.sleep_hours as number | null) ?? null,
    energy: (r.energy as number | null) ?? null,
    eventText: String(r.event_text ?? ''),
    skipped: r.skipped === 1,
    createdAt: String(r.created_at)
  }));
}
