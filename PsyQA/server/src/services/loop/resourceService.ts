import { getDb } from '../../db/database';

export type ResourceKind = 'skill' | 'selfhelp' | 'campus';

export interface ResourceItem {
  id: number;
  kind: ResourceKind;
  title: string;
  body: string;
  sourceRef: string;
  active: boolean;
  updatedAt: string;
}

const KINDS: ResourceKind[] = ['skill', 'selfhelp', 'campus'];
const clean = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

const map = (r: Record<string, unknown>): ResourceItem => ({
  id: r.id as number,
  kind: r.kind as ResourceKind,
  title: String(r.title),
  body: String(r.body),
  sourceRef: String(r.source_ref ?? ''),
  active: r.active === 1,
  updatedAt: String(r.updated_at)
});

export function listResources(kind?: ResourceKind, includeInactive = false, limit = 50): ResourceItem[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (kind && KINDS.includes(kind)) {
    where.push('kind = ?');
    args.push(kind);
  }
  if (!includeInactive) where.push('active = 1');
  const sql = `SELECT * FROM resource_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT ?`;
  const rows = getDb().prepare(sql).all(...args, limit) as Array<Record<string, unknown>>;
  return rows.map(map);
}

export function createResource(
  input: { kind: ResourceKind; title: string; body: string; sourceRef?: string }
): ResourceItem {
  if (!KINDS.includes(input.kind)) throw new Error('kind 必须是 skill/selfhelp/campus');
  const title = clean(input.title, 80);
  const body = clean(input.body, 2000);
  if (!title || !body) throw new Error('标题与内容不能为空');
  const ts = new Date().toISOString();
  const res = getDb()
    .prepare(
      `INSERT INTO resource_items (kind, title, body, source_ref, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(input.kind, title, body, clean(input.sourceRef, 200), ts, ts);
  return { id: Number(res.lastInsertRowid), kind: input.kind, title, body, sourceRef: clean(input.sourceRef, 200), active: true, updatedAt: ts };
}

export function setResourceActive(id: number, active: boolean): boolean {
  const res = getDb()
    .prepare('UPDATE resource_items SET active = ?, updated_at = ? WHERE id = ?')
    .run(active ? 1 : 0, new Date().toISOString(), id);
  return res.changes > 0;
}
