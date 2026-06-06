import fs from 'fs';
import path from 'path';
import { resolveDataFile } from '../../config/paths';

export type AnalyticsEvent =
  | 'ask_start'
  | 'ask_done'
  | 'ask_abort'
  | 'rag_miss'
  | 'llm_fallback'
  | 'alert_created';

export interface AnalyticsRecord {
  event: AnalyticsEvent;
  userId?: string;
  meta?: Record<string, unknown>;
  at: string;
}

const logPath = path.join(path.dirname(resolveDataFile('analytics.jsonl')), 'analytics.jsonl');

export function recordAnalytics(event: AnalyticsEvent, userId?: string, meta?: Record<string, unknown>): void {
  if (process.env.PSYQA_ANALYTICS === '0') return;
  const line: AnalyticsRecord = { event, userId, meta, at: new Date().toISOString() };
  try {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`, 'utf8');
  } catch {
    /* best-effort */
  }
}

export function readRecentAnalytics(limit = 100): AnalyticsRecord[] {
  try {
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').slice(-limit);
    return lines.map((l) => JSON.parse(l) as AnalyticsRecord);
  } catch {
    return [];
  }
}
