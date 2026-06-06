import { getDb } from './database';
import type { ConversationPortrait, PsychSnapshot } from '../services/historyManager';

export interface DialogRow {
  time: string;
  user: string;
  bot: string;
  summary: string;
  report?: string;
  psych?: PsychSnapshot;
  portrait?: ConversationPortrait;
}

export interface UserData {
  dialogs: DialogRow[];
  summaries: Array<{ time: string; summary: string }>;
  total_times: number;
}

function parseDialog(row: {
  dialog_time: string;
  user_text: string;
  bot_text: string;
  summary: string;
  report: string | null;
  psych_json: string | null;
  portrait_json: string | null;
}): DialogRow {
  return {
    time: row.dialog_time,
    user: row.user_text,
    bot: row.bot_text,
    summary: row.summary,
    report: row.report ?? undefined,
    psych: row.psych_json ? (JSON.parse(row.psych_json) as PsychSnapshot) : undefined,
    portrait: row.portrait_json ? (JSON.parse(row.portrait_json) as ConversationPortrait) : undefined
  };
}

export function getUserHistoryFromDb(user_id: string): UserData | null {
  const dialogs = getDb()
    .prepare(
      `SELECT dialog_time, user_text, bot_text, summary, report, psych_json, portrait_json
       FROM dialogs WHERE user_id = ? ORDER BY id ASC`
    )
    .all(user_id) as Array<{
    dialog_time: string;
    user_text: string;
    bot_text: string;
    summary: string;
    report: string | null;
    psych_json: string | null;
    portrait_json: string | null;
  }>;

  if (!dialogs.length) {
    const summaryOnly = getDb()
      .prepare('SELECT summary_time, summary FROM dialog_summaries WHERE user_id = ?')
      .all(user_id) as Array<{ summary_time: string; summary: string }>;
    if (!summaryOnly.length) return null;
    return { dialogs: [], summaries: summaryOnly.map((s) => ({ time: s.summary_time, summary: s.summary })), total_times: 0 };
  }

  const summaries = getDb()
    .prepare('SELECT summary_time, summary FROM dialog_summaries WHERE user_id = ? ORDER BY id ASC')
    .all(user_id) as Array<{ summary_time: string; summary: string }>;

  return {
    dialogs: dialogs.map(parseDialog),
    summaries: summaries.map((s) => ({ time: s.summary_time, summary: s.summary })),
    total_times: dialogs.length
  };
}

export function saveDialogToDb(
  user_id: string,
  user_query: string,
  assistant_reply: string,
  summary: string,
  psych?: PsychSnapshot,
  report?: string,
  dialogTime?: string
): string {
  const now =
    dialogTime ??
    new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

  const db = getDb();
  db.prepare(
    `INSERT INTO dialogs(user_id, dialog_time, user_text, bot_text, summary, report, psych_json, portrait_json)
     VALUES(?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    user_id,
    now,
    user_query,
    assistant_reply,
    summary,
    report ?? null,
    psych ? JSON.stringify(psych) : null
  );
  db.prepare('INSERT INTO dialog_summaries(user_id, summary_time, summary) VALUES(?, ?, ?)').run(user_id, now, summary);
  return now;
}

export function clearUserHistoryInDb(user_id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM dialogs WHERE user_id = ?').run(user_id);
  db.prepare('DELETE FROM dialog_summaries WHERE user_id = ?').run(user_id);
}

export function updateDialogPsychInDb(
  user_id: string,
  dialogTime: string | undefined,
  psych: PsychSnapshot
): boolean {
  const db = getDb();
  let row: { dialog_time: string; psych_json: string | null } | undefined;
  if (dialogTime) {
    row = db
      .prepare('SELECT dialog_time, psych_json FROM dialogs WHERE user_id = ? AND dialog_time = ?')
      .get(user_id, dialogTime) as typeof row;
  } else {
    row = db
      .prepare('SELECT dialog_time, psych_json FROM dialogs WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(user_id) as typeof row;
  }
  if (!row?.psych_json) return false;
  db.prepare('UPDATE dialogs SET psych_json = ? WHERE user_id = ? AND dialog_time = ?').run(
    JSON.stringify(psych),
    user_id,
    row.dialog_time
  );
  return true;
}

export function updateDialogPortraitInDb(
  user_id: string,
  dialogTime: string,
  portrait: ConversationPortrait
): boolean {
  const result = getDb()
    .prepare('UPDATE dialogs SET portrait_json = ? WHERE user_id = ? AND dialog_time = ?')
    .run(JSON.stringify(portrait), user_id, dialogTime);
  if (result.changes > 0) return true;
  const last = getDb()
    .prepare('SELECT dialog_time FROM dialogs WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(user_id) as { dialog_time: string } | undefined;
  if (!last) return false;
  getDb()
    .prepare('UPDATE dialogs SET portrait_json = ? WHERE user_id = ? AND dialog_time = ?')
    .run(JSON.stringify(portrait), user_id, last.dialog_time);
  return true;
}
