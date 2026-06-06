import { getDb } from './database';
import type { SchoolAlert } from '../services/schoolAlertService';

export function readAllAlertsFromDb(): SchoolAlert[] {
  const rows = getDb()
    .prepare('SELECT data_json FROM school_alerts ORDER BY created_at DESC')
    .all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as SchoolAlert);
}

export function writeAllAlertsToDb(alerts: SchoolAlert[]): void {
  const db = getDb();
  const tx = db.transaction((list: SchoolAlert[]) => {
    db.prepare('DELETE FROM school_alerts').run();
    const insert = db.prepare(
      'INSERT INTO school_alerts(id, data_json, org_id, status, student_id, created_at) VALUES(?, ?, ?, ?, ?, ?)'
    );
    for (const a of list) {
      insert.run(a.id, JSON.stringify(a), a.orgId, a.status, a.studentId, a.createdAt);
    }
  });
  tx(alerts);
}

export function insertAlertInDb(alert: SchoolAlert): void {
  getDb()
    .prepare(
      'INSERT INTO school_alerts(id, data_json, org_id, status, student_id, created_at) VALUES(?, ?, ?, ?, ?, ?)'
    )
    .run(alert.id, JSON.stringify(alert), alert.orgId, alert.status, alert.studentId, alert.createdAt);
}

export function updateAlertInDb(alert: SchoolAlert): void {
  getDb()
    .prepare(
      `UPDATE school_alerts SET data_json = ?, org_id = ?, status = ?, student_id = ?
       WHERE id = ?`
    )
    .run(JSON.stringify(alert), alert.orgId, alert.status, alert.studentId, alert.id);
}
