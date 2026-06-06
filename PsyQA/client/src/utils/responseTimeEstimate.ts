const STORAGE_KEY = 'psyqa_response_times_v1';
const MAX_SAMPLES = 20;
const DEFAULT_ESTIMATE_SEC = 18;

export function recordResponseTimeMs(ms: number): void {
  if (typeof window === 'undefined' || ms < 500 || ms > 300_000) return;
  try {
    const prev = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as number[];
    const next = [...prev, ms].slice(-MAX_SAMPLES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getEstimatedWaitSec(): number {
  if (typeof window === 'undefined') return DEFAULT_ESTIMATE_SEC;
  try {
    const samples = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as number[];
    if (!samples.length) return DEFAULT_ESTIMATE_SEC;
    const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;
    return Math.max(8, Math.min(90, Math.round(avgMs / 1000)));
  } catch {
    return DEFAULT_ESTIMATE_SEC;
  }
}
