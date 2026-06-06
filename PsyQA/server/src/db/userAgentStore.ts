import { getDb } from './database';
import type {
  AgentPhase,
  EmotionTimelineEntry,
  InterventionProfile,
  UserAgentProfileRow,
  UserStaticProfile
} from '../types/userAgent';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getUserAgentProfile(userId: string): UserAgentProfileRow | null {
  const row = getDb()
    .prepare(
      `SELECT user_id, basic_json, emotion_timeline_json, intervention_json,
              agent_system_prompt, agent_phase, first_dialog_at,
              monthly_summaries_json, annual_reports_json, updated_at
       FROM user_agent_profile WHERE user_id = ?`
    )
    .get(userId) as
    | {
        user_id: string;
        basic_json: string | null;
        emotion_timeline_json: string;
        intervention_json: string | null;
        agent_system_prompt: string | null;
        agent_phase: string;
        first_dialog_at: string | null;
        monthly_summaries_json: string;
        annual_reports_json: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    userId: row.user_id,
    basicJson: parseJson<UserStaticProfile | null>(row.basic_json, null),
    emotionTimelineJson: parseJson<EmotionTimelineEntry[]>(row.emotion_timeline_json, []),
    interventionJson: parseJson<InterventionProfile | null>(row.intervention_json, null),
    agentSystemPrompt: row.agent_system_prompt,
    agentPhase: (row.agent_phase as AgentPhase) || 'collect',
    firstDialogAt: row.first_dialog_at,
    monthlySummariesJson: parseJson(row.monthly_summaries_json, []),
    annualReportsJson: parseJson(row.annual_reports_json, []),
    updatedAt: row.updated_at
  };
}

export function ensureUserAgentProfile(userId: string): UserAgentProfileRow {
  const existing = getUserAgentProfile(userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO user_agent_profile(user_id, emotion_timeline_json, monthly_summaries_json,
       annual_reports_json, agent_phase, updated_at)
       VALUES(?, '[]', '[]', '[]', 'collect', ?)`
    )
    .run(userId, now);

  return getUserAgentProfile(userId)!;
}

export function updateUserAgentProfile(
  userId: string,
  patch: Partial<{
    basicJson: UserStaticProfile | null;
    emotionTimelineJson: EmotionTimelineEntry[];
    interventionJson: InterventionProfile | null;
    agentSystemPrompt: string | null;
    agentPhase: AgentPhase;
    firstDialogAt: string | null;
    monthlySummariesJson: Array<{ month: string; summary: string; createdAt: string }>;
    annualReportsJson: Array<{ year: string; report: string; createdAt: string }>;
  }>
): UserAgentProfileRow {
  ensureUserAgentProfile(userId);
  const current = getUserAgentProfile(userId)!;
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `UPDATE user_agent_profile SET
         basic_json = ?,
         emotion_timeline_json = ?,
         intervention_json = ?,
         agent_system_prompt = ?,
         agent_phase = ?,
         first_dialog_at = ?,
         monthly_summaries_json = ?,
         annual_reports_json = ?,
         updated_at = ?
       WHERE user_id = ?`
    )
    .run(
      patch.basicJson !== undefined
        ? JSON.stringify(patch.basicJson)
        : current.basicJson
          ? JSON.stringify(current.basicJson)
          : null,
      JSON.stringify(patch.emotionTimelineJson ?? current.emotionTimelineJson),
      patch.interventionJson !== undefined
        ? patch.interventionJson
          ? JSON.stringify(patch.interventionJson)
          : null
        : current.interventionJson
          ? JSON.stringify(current.interventionJson)
          : null,
      patch.agentSystemPrompt !== undefined ? patch.agentSystemPrompt : current.agentSystemPrompt,
      patch.agentPhase ?? current.agentPhase,
      patch.firstDialogAt !== undefined ? patch.firstDialogAt : current.firstDialogAt,
      JSON.stringify(patch.monthlySummariesJson ?? current.monthlySummariesJson),
      JSON.stringify(patch.annualReportsJson ?? current.annualReportsJson),
      now,
      userId
    );

  return getUserAgentProfile(userId)!;
}

export function recordDialogVectorMeta(input: {
  userId: string;
  dialogTime: string;
  chromaId: string;
  collectionName: string;
  month: string;
  emotion?: string;
  triggerTag?: string;
  contentPreview?: string;
}): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO user_dialog_vectors(
         user_id, dialog_time, chroma_id, collection_name, month,
         emotion, trigger_tag, content_preview, created_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, dialog_time) DO UPDATE SET
         chroma_id = excluded.chroma_id,
         collection_name = excluded.collection_name,
         month = excluded.month,
         emotion = excluded.emotion,
         trigger_tag = excluded.trigger_tag,
         content_preview = excluded.content_preview,
         created_at = excluded.created_at`
    )
    .run(
      input.userId,
      input.dialogTime,
      input.chromaId,
      input.collectionName,
      input.month,
      input.emotion ?? null,
      input.triggerTag ?? null,
      input.contentPreview?.slice(0, 200) ?? null,
      now
    );
}

export function getFirstDialogTime(userId: string): string | null {
  const row = getDb()
    .prepare('SELECT MIN(dialog_time) as t FROM dialogs WHERE user_id = ?')
    .get(userId) as { t: string | null } | undefined;
  return row?.t ?? null;
}

export function countUserDialogVectors(userId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as c FROM user_dialog_vectors WHERE user_id = ?')
    .get(userId) as { c: number } | undefined;
  return row?.c ?? 0;
}

export function listUserIdsWithDialogs(): string[] {
  const rows = getDb()
    .prepare('SELECT DISTINCT user_id FROM dialogs WHERE user_id IS NOT NULL AND user_id != ?')
    .all('default_user') as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

function monthLikePattern(ym: string): string {
  return `${ym.replace('-', '/').slice(0, 7)}/%`;
}

export function getDialogsForMonth(
  userId: string,
  month: string
): Array<{ userText: string; botText: string; summary: string; psychJson: string | null }> {
  return getDb()
    .prepare(
      `SELECT user_text as userText, bot_text as botText, summary, psych_json as psychJson
       FROM dialogs WHERE user_id = ? AND dialog_time LIKE ? ORDER BY id ASC`
    )
    .all(userId, monthLikePattern(month)) as Array<{
    userText: string;
    botText: string;
    summary: string;
    psychJson: string | null;
  }>;
}

export function getDialogsForYear(
  userId: string,
  year: string
): Array<{ userText: string; botText: string; summary: string; psychJson: string | null }> {
  return getDb()
    .prepare(
      `SELECT user_text as userText, bot_text as botText, summary, psych_json as psychJson
       FROM dialogs WHERE user_id = ? AND dialog_time LIKE ? ORDER BY id ASC`
    )
    .all(userId, `${year}/%`) as Array<{
    userText: string;
    botText: string;
    summary: string;
    psychJson: string | null;
  }>;
}

export function clearUserAgentData(userId: string): void {
  getDb().prepare('DELETE FROM user_agent_profile WHERE user_id = ?').run(userId);
  getDb().prepare('DELETE FROM user_dialog_vectors WHERE user_id = ?').run(userId);
}

export function listUserDialogVectorMeta(userId: string): Array<{
  dialogTime: string;
  chromaId: string;
  month: string;
  emotion: string | null;
  contentPreview: string | null;
  createdAt: string;
}> {
  return getDb()
    .prepare(
      `SELECT dialog_time as dialogTime, chroma_id as chromaId, month,
              emotion, content_preview as contentPreview, created_at as createdAt
       FROM user_dialog_vectors WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(userId) as Array<{
    dialogTime: string;
    chromaId: string;
    month: string;
    emotion: string | null;
    contentPreview: string | null;
    createdAt: string;
  }>;
}

export function deleteUserDialogVectorMeta(userId: string, dialogTime: string): boolean {
  const r = getDb()
    .prepare('DELETE FROM user_dialog_vectors WHERE user_id = ? AND dialog_time = ?')
    .run(userId, dialogTime);
  return r.changes > 0;
}
