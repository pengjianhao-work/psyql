const STORAGE_KEY = 'psyqa_response_times_v1';
const MAX_SAMPLES = 20;
const DEFAULT_ESTIMATE_SEC = 18;

export interface WaitEstimateFactors {
  fastAnswer?: boolean;
  llmAvailable?: boolean;
  llmMode?: string;
  knowledgeCount?: number;
  activeAskRequests?: number;
  maxAskRequests?: number;
  reactStepsExpected?: number;
}

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

/** 历史均值 + 知识库规模 + 后端负载 + 模式修正 */
export function computeDynamicWaitSec(factors: WaitEstimateFactors = {}): number {
  if (factors.fastAnswer || factors.llmMode === 'fast') {
    return 3;
  }

  let sec = getEstimatedWaitSec();

  if (factors.llmAvailable === false || factors.llmMode === 'fallback') {
    sec += 4;
  }

  const kb = factors.knowledgeCount ?? 1200;
  if (kb >= 2000) sec += 2;
  else if (kb < 400) sec -= 2;

  const active = factors.activeAskRequests ?? 0;
  const max = factors.maxAskRequests ?? 4;
  if (active >= max - 1) sec += 6;
  else if (active >= 2) sec += 3;

  if (factors.reactStepsExpected && factors.reactStepsExpected > 2) {
    sec += 5;
  }

  return Math.max(3, Math.min(120, sec));
}
