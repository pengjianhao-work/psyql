import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { resolveDataFile } from '../../config/paths';
import { ProblemCategory } from '../psych/emotionService';

export type MemoryTopicTag =
  | 'academic'
  | 'relationship'
  | 'family'
  | 'romance'
  | 'crisis'
  | 'emotion'
  | 'other';

export interface MemoryMetaEntry {
  dialogTime: string;
  tags: MemoryTopicTag[];
  locked: boolean;
  archived: boolean;
  autoTagged: boolean;
  updatedAt: string;
}

interface MemoryMetaFile {
  byUser: Record<string, Record<string, MemoryMetaEntry>>;
}

const dataPath = resolveDataFile('memory_meta.json');

const TAG_KEYWORDS: Record<MemoryTopicTag, string[]> = {
  academic: ['考试', '学业', '成绩', '挂科', '论文', '考研', '作业', '复习'],
  relationship: ['同学', '朋友', '人际', '室友', '孤立', '被排挤', '社交'],
  family: ['父母', '家里', '家庭', '爸妈', '父亲', '母亲', '亲子'],
  romance: ['恋爱', '分手', '男朋友', '女朋友', '暗恋', '表白', '复合'],
  crisis: ['自杀', '自伤', '不想活', '跳楼', '割腕', '伤害自己'],
  emotion: ['焦虑', '抑郁', '失眠', '崩溃', '压力', '低落', '情绪'],
  other: []
};

function readAll(): MemoryMetaFile {
  return readJsonFileSync<MemoryMetaFile>(dataPath, { byUser: {} });
}

function writeAll(data: MemoryMetaFile): void {
  writeJsonFileSync(dataPath, data);
}

export function autoTagMemoryContent(text: string, problem?: string): MemoryTopicTag[] {
  const normalized = text.replace(/\s+/g, '');
  const tags = new Set<MemoryTopicTag>();

  for (const [tag, kws] of Object.entries(TAG_KEYWORDS) as Array<[MemoryTopicTag, string[]]>) {
    if (tag === 'other') continue;
    if (kws.some((kw) => normalized.includes(kw))) tags.add(tag);
  }

  if (problem === 'academic_stress') tags.add('academic');
  if (problem === 'interpersonal') tags.add('relationship');
  if (problem === 'family_relationship') tags.add('family');
  if (problem === 'romantic_relationship') tags.add('romance');
  if (problem === 'emotion_regulation') tags.add('emotion');

  if (!tags.size) tags.add('other');
  return [...tags];
}

export function upsertMemoryMeta(
  userId: string,
  dialogTime: string,
  patch: Partial<Pick<MemoryMetaEntry, 'tags' | 'locked' | 'archived'>> & { content?: string; problem?: string }
): MemoryMetaEntry {
  const data = readAll();
  if (!data.byUser[userId]) data.byUser[userId] = {};
  const existing = data.byUser[userId][dialogTime];
  const tags =
    patch.tags ||
    existing?.tags ||
    autoTagMemoryContent(patch.content || '', patch.problem);

  const entry: MemoryMetaEntry = {
    dialogTime,
    tags,
    locked: patch.locked ?? existing?.locked ?? false,
    archived: patch.archived ?? existing?.archived ?? false,
    autoTagged: !patch.tags && !existing,
    updatedAt: new Date().toISOString()
  };
  data.byUser[userId][dialogTime] = entry;
  writeAll(data);
  return entry;
}

export function listMemoryMeta(userId: string, filterTag?: MemoryTopicTag): MemoryMetaEntry[] {
  const data = readAll();
  const userMap = data.byUser[userId] || {};
  let items = Object.values(userMap);
  if (filterTag) items = items.filter((m) => m.tags.includes(filterTag));
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function batchArchiveMemories(userId: string, dialogTimes: string[], archived = true): number {
  const data = readAll();
  if (!data.byUser[userId]) return 0;
  let n = 0;
  for (const dt of dialogTimes) {
    const row = data.byUser[userId][dt];
    if (row) {
      row.archived = archived;
      row.updatedAt = new Date().toISOString();
      n += 1;
    }
  }
  writeAll(data);
  return n;
}

export function getLockedMemoryBoost(userId: string, dialogTime: string): number {
  const data = readAll();
  const entry = data.byUser[userId]?.[dialogTime];
  return entry?.locked ? 1.35 : 1;
}

export function isMemoryArchived(userId: string, dialogTime: string): boolean {
  const data = readAll();
  return Boolean(data.byUser[userId]?.[dialogTime]?.archived);
}
