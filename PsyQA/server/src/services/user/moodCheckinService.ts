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

/** 心情词 → 效价：打卡卡片的固定选项 + 常见同义词，未知词按中性 0 处理。 */
const MOOD_VALENCE: Record<string, number> = {
  还不错: 2, 开心: 2, 好: 2, 愉快: 2,
  一般: 1, 还行: 1, 平静: 1, 没事: 1,
  有点累: 0, 累: 0, 疲惫: 0, 中性: 0,
  烦躁: -1, 生气: -1, 怒: -1, 烦: -1, 焦虑: -1,
  低落: -2, 难过: -2, 伤心: -2, 抑郁: -2, 想哭: -2
};

export interface MoodTrend {
  total: number;
  averageValence: number;
  recentAverage: number | null;
  previousAverage: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  topMoods: Array<{ mood: string; count: number }>;
  recent: MoodCheckin[];
}

/** 统计情绪打卡趋势：近 7 天 vs 再往前，供 Agent 做情绪曲线解读。 */
export function getMoodTrend(userId: string, days = 30): MoodTrend {
  const checkins = listMoodCheckins(userId, 100).slice(0, days);
  if (!checkins.length) {
    return { total: 0, averageValence: 0, recentAverage: null, previousAverage: null, direction: 'unknown', topMoods: [], recent: [] };
  }
  const valence = (mood: string) => MOOD_VALENCE[mood.trim()] ?? 0;
  const avg = (list: MoodCheckin[]) =>
    list.length ? list.reduce((sum, c) => sum + valence(c.mood), 0) / list.length : null;

  const cutoff = Date.now() - 7 * 86400000;
  const recent = checkins.filter((c) => new Date(c.createdAt).getTime() >= cutoff);
  const previous = checkins.filter((c) => new Date(c.createdAt).getTime() < cutoff);
  const recentAvg = avg(recent);
  const prevAvg = avg(previous);
  const direction =
    recentAvg === null || prevAvg === null
      ? 'unknown'
      : recentAvg > prevAvg + 0.3
        ? 'up'
        : recentAvg < prevAvg - 0.3
          ? 'down'
          : 'flat';

  const counts = new Map<string, number>();
  checkins.forEach((c) => counts.set(c.mood, (counts.get(c.mood) ?? 0) + 1));
  const topMoods = [...counts.entries()]
    .map(([mood, count]) => ({ mood, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    total: checkins.length,
    averageValence: avg(checkins) ?? 0,
    recentAverage: recentAvg,
    previousAverage: prevAvg,
    direction,
    topMoods,
    recent: checkins.slice(0, 5)
  };
}
