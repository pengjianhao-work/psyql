import fs from 'fs';
import { getDb, getMeta, setMeta } from './database';
import { AccountRecord } from '../services/accountService';
import { SchoolAlert } from '../services/schoolAlertService';
import { resolveDataFile, userHistoryJsonPath } from '../config/paths';

interface HistoryJson {
  users: Record<
    string,
    {
      dialogs: Array<{
        time: string;
        user: string;
        bot: string;
        summary: string;
        report?: string;
        psych?: unknown;
        portrait?: unknown;
      }>;
      summaries: Array<{ time: string; summary: string }>;
      total_times: number;
    }
  >;
}

export function runJsonMigrationIfNeeded(): void {
  if (getMeta('json_migrated_v1') === '1') return;

  const db = getDb();
  const migrate = db.transaction(() => {
    migrateAccounts(db);
    migrateHistory(db);
    migrateAlerts(db);
    setMeta('json_migrated_v1', '1');
  });
  migrate();
  console.log('SQLite: JSON 数据已迁移至', process.env.PSYQA_DB_PATH || 'server/data/psyqa.db');
}

function migrateAccounts(db: ReturnType<typeof getDb>): void {
  const file = resolveDataFile('accounts.json');
  if (!fs.existsSync(file)) return;

  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { users: AccountRecord[] };
  const insert = db.prepare(`
    INSERT OR IGNORE INTO accounts(id, username, password_hash, data_json, created_at)
    VALUES(?, ?, ?, ?, ?)
  `);
  for (const u of data.users || []) {
    const { passwordHash, ...rest } = u;
    insert.run(u.id, u.username, passwordHash, JSON.stringify(rest), u.createdAt);
  }
}

function migrateHistory(db: ReturnType<typeof getDb>): void {
  const file = userHistoryJsonPath();
  if (!fs.existsSync(file)) return;

  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as HistoryJson;
  const insertDialog = db.prepare(`
    INSERT OR IGNORE INTO dialogs(user_id, dialog_time, user_text, bot_text, summary, report, psych_json, portrait_json)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSummary = db.prepare(`
    INSERT INTO dialog_summaries(user_id, summary_time, summary) VALUES(?, ?, ?)
  `);

  for (const [userId, userData] of Object.entries(data.users || {})) {
    for (const d of userData.dialogs || []) {
      insertDialog.run(
        userId,
        d.time,
        d.user,
        d.bot,
        d.summary,
        d.report ?? null,
        d.psych ? JSON.stringify(d.psych) : null,
        d.portrait ? JSON.stringify(d.portrait) : null
      );
    }
    for (const s of userData.summaries || []) {
      insertSummary.run(userId, s.time, s.summary);
    }
  }
}

function migrateAlerts(db: ReturnType<typeof getDb>): void {
  const file = resolveDataFile('school_alerts.json');
  if (!fs.existsSync(file)) return;

  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { alerts: SchoolAlert[] };
  const insert = db.prepare(`
    INSERT OR IGNORE INTO school_alerts(id, data_json, org_id, status, student_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `);
  for (const a of data.alerts || []) {
    insert.run(a.id, JSON.stringify(a), a.orgId, a.status, a.studentId, a.createdAt);
  }
}
