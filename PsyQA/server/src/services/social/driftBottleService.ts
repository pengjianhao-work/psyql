import { getDb } from '../../db/database';
import { assessRisk } from '../psych/emotionService';
import { recordRiskAlert } from '../school/schoolAlertService';
import { JOURNAL_MOOD_TAGS } from '../user/journalService';

/**
 * 匿名漂流瓶：drift_bottles 存所有瓶子，bottle_picks 记录每次「捞」动作（用于限次）。
 * - 扔瓶子依次做：长度校验 → 每日限次 → 联系方式轻过滤 → 规则层风险扫描
 * - assessRisk 命中 high/critical 的瓶子写入 status='held' 留档并走校园预警通道，
 *   永远不会被捞到；给扔出者回一段温和的照护话术，而不是把瓶子丢进海里
 * - 捞瓶子只返回 body/mood_tag/created_at，绝不返回 sender_id，保持双向匿名
 */

export interface DriftBottleInput {
  body: string;
  moodTag?: string | null;
}

export interface BottleCare {
  message: string;
  hotline: string;
}

export type ThrowBottleResult =
  | { ok: true; intercepted: false }
  | { ok: true; intercepted: true; care: BottleCare }
  | { ok: false; reason: 'rate_limited' | 'contact_info' };

/** 捞到的瓶子对外的匿名视图（与服务端返回结构一致，snake_case 由接口约定） */
export interface PickedBottle {
  body: string;
  mood_tag: string | null;
  created_at: string;
}

export type PickBottleResult =
  | { ok: true; bottle: PickedBottle | null; seed?: { text: string } }
  | { ok: false; reason: 'rate_limited' };

const MIN_BODY_LEN = 5;
const MAX_BODY_LEN = 500;
const MAX_THROWS_PER_DAY = 3;
const MAX_PICKS_PER_DAY = 5;
const PICK_CANDIDATES = 5;
const MAX_SIGNAL_LIMIT = 100;

/** 联系方式/外链的轻过滤：带协议或 www 的网址、常见域名后缀、11 位手机号 */
const CONTACT_INFO_PATTERN =
  /(?:https?:\/\/|www\.)[^\s]+|[\w-]+\.(?:com|cn|net|org|io|me|cc|top|xyz|vip|link)\b|(?<!\d)1\d{10}(?!\d)/i;

export function containsContactInfo(text: string): boolean {
  return CONTACT_INFO_PATTERN.test(text);
}

/** 池子为空时兜底的一片「海」：泛泛、温暖、第一人称，不写成临床建议 */
export const SEED_BOTTLES: readonly string[] = [
  '愿你今天也能睡个好觉。',
  '陌生人，辛苦了，你已经做得很好了。',
  '今天也要记得吃饭、喝水，照顾好自己。',
  '把心事写进瓶子的那一刻，它们就已经轻了一点。',
  '无论今天过得怎么样，明天总是新的一天。',
  '我在海的这一头，为你留了一点温柔。',
  '慢慢来，不着急，你已经在往前走了。',
  '愿你被这个世界温柔以待，也愿你温柔对待自己。'
];

const INTERCEPT_CARE_MESSAGE =
  '这段话先留在我这里，没有丢进海里。你现在还好吗？如果心里很难受，可以先和身边可信任的人说说，也可以拨打全国心理援助热线。';

interface BottleRow {
  id: number;
  sender_id: string;
  body: string;
  mood_tag: string | null;
  status: string;
  created_at: string;
  picked_at: string | null;
  picked_by: string | null;
}

function localToday(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function cleanBody(raw: string): string {
  const body = raw.trim();
  if (body.length < MIN_BODY_LEN || body.length > MAX_BODY_LEN) {
    throw new Error(`瓶子里的话需要 ${MIN_BODY_LEN}–${MAX_BODY_LEN} 字`);
  }
  return body;
}

function cleanMoodTag(raw: string | null | undefined): string | null {
  const tag = (raw ?? '').trim();
  if (!tag) return null;
  if (!JOURNAL_MOOD_TAGS.includes(tag)) {
    throw new Error('无效的心情标签');
  }
  return tag;
}

function countTodayThrows(userId: string): number {
  const row = getDb()
    .prepare(
      'SELECT COUNT(*) AS n FROM drift_bottles WHERE sender_id = ? AND date(created_at) = date(?)'
    )
    .get(userId, localToday()) as { n: number };
  return row.n;
}

export function throwBottle(userId: string, input: DriftBottleInput): ThrowBottleResult {
  const body = cleanBody(input.body);
  const moodTag = cleanMoodTag(input.moodTag);

  if (countTodayThrows(userId) >= MAX_THROWS_PER_DAY) {
    return { ok: false, reason: 'rate_limited' };
  }
  if (containsContactInfo(body)) {
    return { ok: false, reason: 'contact_info' };
  }

  const now = new Date().toISOString();
  const assessment = assessRisk(body);
  const held = assessment.level === 'high' || assessment.level === 'critical';

  const result = getDb()
    .prepare(
      'INSERT INTO drift_bottles(sender_id, body, mood_tag, status, created_at) VALUES(?, ?, ?, ?, ?)'
    )
    .run(userId, body, moodTag, held ? 'held' : 'pooled', now);

  if (held) {
    try {
      recordRiskAlert({
        studentId: userId,
        riskLevel: assessment.level,
        summary: `漂流瓶内容命中风险词：${body.slice(0, 120)}`,
        riskKeywords: assessment.keywords,
        dialogId: `bottle_${Number(result.lastInsertRowid)}`,
        dialogTime: now
      });
    } catch {
      /* 预警通道异常不阻断给用户的照护回应 */
    }
    return {
      ok: true,
      intercepted: true,
      care: {
        message: INTERCEPT_CARE_MESSAGE,
        hotline: assessment.hotline
      }
    };
  }

  return { ok: true, intercepted: false };
}

export function pickBottle(userId: string): PickBottleResult {
  const db = getDb();
  const today = localToday();

  const picksRow = db
    .prepare('SELECT COUNT(*) AS n FROM bottle_picks WHERE user_id = ? AND date(created_at) = date(?)')
    .get(userId, today) as { n: number };
  if (picksRow.n >= MAX_PICKS_PER_DAY) {
    return { ok: false, reason: 'rate_limited' };
  }

  const candidates = db
    .prepare(
      "SELECT * FROM drift_bottles WHERE status = 'pooled' AND sender_id != ? ORDER BY RANDOM() LIMIT ?"
    )
    .all(userId, PICK_CANDIDATES) as BottleRow[];

  const now = new Date().toISOString();
  for (const row of candidates) {
    if (containsContactInfo(row.body)) continue;
    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE drift_bottles SET status = 'picked', picked_at = ?, picked_by = ? WHERE id = ? AND status = 'pooled'"
      ).run(now, userId, row.id);
      db.prepare('INSERT INTO bottle_picks(user_id, bottle_id, created_at) VALUES(?, ?, ?)').run(
        userId,
        row.id,
        now
      );
    });
    tx();
    return {
      ok: true,
      bottle: { body: row.body, mood_tag: row.mood_tag, created_at: row.created_at }
    };
  }

  // 池子空或候选都被过滤：仍记一次捞取（bottle_id=NULL），保证每日限次真实生效
  db.prepare('INSERT INTO bottle_picks(user_id, bottle_id, created_at) VALUES(?, NULL, ?)').run(
    userId,
    now
  );
  const seed = SEED_BOTTLES[Math.floor(Math.random() * SEED_BOTTLES.length)];
  return { ok: true, bottle: null, seed: { text: seed } };
}

export interface BottleSignalRow {
  body: string;
  createdAt: string;
}

/** 信号层只读已入池/已被捞的瓶子；'held' 拦截瓶永不进信号，由预警通道覆盖 */
export function listBottleSignalRows(userId: string, limit = 20): BottleSignalRow[] {
  const rows = getDb()
    .prepare(
      "SELECT body, created_at FROM drift_bottles WHERE sender_id = ? AND status IN ('pooled','picked') ORDER BY created_at DESC LIMIT ?"
    )
    .all(userId, Math.max(1, Math.min(MAX_SIGNAL_LIMIT, limit))) as Array<{
    body: string;
    created_at: string;
  }>;
  return rows.map((r) => ({ body: r.body, createdAt: r.created_at }));
}

export interface MyBottle {
  id: number;
  body: string;
  moodTag: string | null;
  status: 'pooled' | 'picked';
  createdAt: string;
}

/** 「我扔过的瓶子」——只回显入池/被捞的；'held' 拦截瓶不回显（扔瓶时已给照护回应） */
export function listMyBottles(userId: string, limit = 20): MyBottle[] {
  const rows = getDb()
    .prepare(
      "SELECT id, body, mood_tag, status, created_at FROM drift_bottles WHERE sender_id = ? AND status IN ('pooled','picked') ORDER BY created_at DESC LIMIT ?"
    )
    .all(userId, Math.max(1, Math.min(50, limit))) as Array<{
    id: number;
    body: string;
    mood_tag: string | null;
    status: 'pooled' | 'picked';
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    moodTag: r.mood_tag,
    status: r.status,
    createdAt: r.created_at
  }));
}
