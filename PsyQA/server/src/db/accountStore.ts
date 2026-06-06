import { getDb } from './database';
import type { AccountRecord } from '../services/accountService';

export function readAllAccountsFromDb(): AccountRecord[] {
  const rows = getDb().prepare('SELECT data_json, password_hash FROM accounts').all() as Array<{
    data_json: string;
    password_hash: string;
  }>;
  return rows.map((r) => {
    const partial = JSON.parse(r.data_json) as Omit<AccountRecord, 'passwordHash'>;
    return { ...partial, passwordHash: r.password_hash } as AccountRecord;
  });
}

export function writeAllAccountsToDb(users: AccountRecord[]): void {
  const db = getDb();
  const tx = db.transaction((list: AccountRecord[]) => {
    db.prepare('DELETE FROM accounts').run();
    const insert = db.prepare(
      'INSERT INTO accounts(id, username, password_hash, data_json, created_at) VALUES(?, ?, ?, ?, ?)'
    );
    for (const u of list) {
      const { passwordHash, ...rest } = u;
      insert.run(u.id, u.username, passwordHash, JSON.stringify(rest), u.createdAt);
    }
  });
  tx(users);
}

export function upsertAccountInDb(user: AccountRecord): void {
  const { passwordHash, ...rest } = user;
  getDb()
    .prepare(
      `INSERT INTO accounts(id, username, password_hash, data_json, created_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         password_hash = excluded.password_hash,
         data_json = excluded.data_json`
    )
    .run(user.id, user.username, passwordHash, JSON.stringify(rest), user.createdAt);
}
