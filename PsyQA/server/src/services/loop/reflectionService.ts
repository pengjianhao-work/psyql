import { getDb } from '../../db/database';

export type ReflectionScope = 'evening' | 'weekly';

export interface Reflection {
  id: number;
  scope: ReflectionScope;
  lines: string[];
  helped: string;
  notHelped: string;
  adjustNote: string;
  createdAt: string;
}

export interface SafetyPlan {
  contacts: string[];
  coping: string[];
  warningSigns: string[];
  updatedAt: string | null;
}

const clean = (v: unknown, max = 300): string => String(v ?? '').trim().slice(0, max);

export function addReflection(
  userId: string,
  input: {
    scope: ReflectionScope;
    lines?: string[];
    helped?: string;
    notHelped?: string;
    adjustNote?: string;
  }
): Reflection {
  if (input.scope !== 'evening' && input.scope !== 'weekly') throw new Error('scope 必须是 evening 或 weekly');
  const lines = (input.lines ?? []).map((l) => clean(l)).filter(Boolean).slice(0, 3);
  const helped = clean(input.helped);
  const notHelped = clean(input.notHelped);
  const adjustNote = clean(input.adjustNote);
  if (lines.length === 0 && !helped && !notHelped && !adjustNote) throw new Error('复盘至少要写一点内容');
  const ts = new Date().toISOString();
  const res = getDb()
    .prepare(
      `INSERT INTO reflections (user_id, scope, line1, line2, line3, helped, not_helped, adjust_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, input.scope, lines[0] ?? '', lines[1] ?? '', lines[2] ?? '', helped, notHelped, adjustNote, ts);
  return { id: Number(res.lastInsertRowid), scope: input.scope, lines, helped, notHelped, adjustNote, createdAt: ts };
}

export function listReflections(userId: string, scope?: ReflectionScope, limit = 20): Reflection[] {
  const rows = (scope
    ? getDb()
        .prepare('SELECT * FROM reflections WHERE user_id = ? AND scope = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(userId, scope, limit)
    : getDb()
        .prepare('SELECT * FROM reflections WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(userId, limit)) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    scope: r.scope as ReflectionScope,
    lines: [r.line1, r.line2, r.line3].map((l) => String(l ?? '')).filter(Boolean),
    helped: String(r.helped ?? ''),
    notHelped: String(r.not_helped ?? ''),
    adjustNote: String(r.adjust_note ?? ''),
    createdAt: String(r.created_at)
  }));
}

const parseArr = (json: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.map(String).slice(0, 20) : [];
  } catch {
    return [];
  }
};

export function getSafetyPlan(userId: string): SafetyPlan {
  const row = getDb()
    .prepare('SELECT * FROM safety_plans WHERE user_id = ?')
    .get(userId) as Record<string, unknown> | undefined;
  return {
    contacts: parseArr(row?.contacts_json as string),
    coping: parseArr(row?.coping_json as string),
    warningSigns: parseArr(row?.warning_signs_json as string),
    updatedAt: (row?.updated_at as string | null) ?? null
  };
}

/** 用户自写的安全预案：难受时联系谁 / 可以做什么 / 自己的预警信号 */
export function upsertSafetyPlan(
  userId: string,
  input: { contacts?: string[]; coping?: string[]; warningSigns?: string[] }
): SafetyPlan {
  const norm = (arr?: string[]) =>
    JSON.stringify((arr ?? []).map((s) => clean(s, 120)).filter(Boolean).slice(0, 10));
  const ts = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO safety_plans (user_id, contacts_json, coping_json, warning_signs_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         contacts_json = excluded.contacts_json,
         coping_json = excluded.coping_json,
         warning_signs_json = excluded.warning_signs_json,
         updated_at = excluded.updated_at`
    )
    .run(userId, norm(input.contacts), norm(input.coping), norm(input.warningSigns), ts);
  return getSafetyPlan(userId);
}
