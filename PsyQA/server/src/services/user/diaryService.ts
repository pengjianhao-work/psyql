import { getDb } from '../../db/database';

export interface DiaryEntry {
  date: string;
  content: string;
  updatedAt: string;
}

const MAX_DIARY_LEN = 2000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 校验日记日期：格式必须为 YYYY-MM-DD，且不能是未来日期。 */
export function assertDiaryDate(date: string): string {
  const clean = date.trim();
  if (!DATE_PATTERN.test(clean)) {
    throw new Error('日期格式应为 YYYY-MM-DD');
  }
  const [y, m, d] = clean.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    throw new Error('日期不存在');
  }
  if (clean > localDateKey()) {
    throw new Error('还不能给未来日期写日记');
  }
  return clean;
}

/** 按日期新建或覆盖当天日记；正文为空时删除当天记录。 */
export function upsertDiary(userId: string, date: string, content: string): DiaryEntry | null {
  const entryDate = assertDiaryDate(date);
  const clean = content.trim().slice(0, MAX_DIARY_LEN);
  const db = getDb();
  if (!clean) {
    db.prepare('DELETE FROM diary_entries WHERE user_id = ? AND entry_date = ?').run(userId, entryDate);
    return null;
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO diary_entries(user_id, entry_date, content, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(user_id, entry_date)
     DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(userId, entryDate, clean, now, now);
  return { date: entryDate, content: clean, updatedAt: now };
}

interface DiaryRow {
  entry_date: string;
  content: string;
  updated_at: string;
}

function toEntry(row: DiaryRow): DiaryEntry {
  return { date: row.entry_date, content: row.content, updatedAt: row.updated_at };
}

/** 查询某月（默认当前月）的日记，供日历标记与按天编辑。 */
export function listDiaries(userId: string, month?: string): DiaryEntry[] {
  const targetMonth = month && MONTH_PATTERN.test(month) ? month : localDateKey().slice(0, 7);
  const rows = getDb()
    .prepare(
      `SELECT entry_date, content, updated_at FROM diary_entries
       WHERE user_id = ? AND entry_date LIKE ?
       ORDER BY entry_date ASC`
    )
    .all(userId, `${targetMonth}-%`) as DiaryRow[];
  return rows.map(toEntry);
}

/** 查询全部日记，供「导出我的数据」使用。 */
export function listAllDiaries(userId: string): DiaryEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT entry_date, content, updated_at FROM diary_entries
       WHERE user_id = ?
       ORDER BY entry_date DESC`
    )
    .all(userId) as DiaryRow[];
  return rows.map(toEntry);
}
