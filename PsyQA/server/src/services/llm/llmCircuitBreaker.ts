import type { LlmProvider } from './llmClient';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 120_000;
const HALF_OPEN_PROBE_MS = 30_000;

interface BreakerState {
  failures: number;
  openUntil: number;
  lastFailure: number;
}

const breakers: Record<LlmProvider, BreakerState> = {
  zhipu: { failures: 0, openUntil: 0, lastFailure: 0 },
  ollama: { failures: 0, openUntil: 0, lastFailure: 0 }
};

export function recordLlmSuccess(provider: LlmProvider): void {
  breakers[provider].failures = 0;
  breakers[provider].openUntil = 0;
}

export function recordLlmFailure(provider: LlmProvider): void {
  const s = breakers[provider];
  s.failures += 1;
  s.lastFailure = Date.now();
  if (s.failures >= FAILURE_THRESHOLD) {
    s.openUntil = Date.now() + COOLDOWN_MS;
  }
}

export function isProviderCircuitOpen(provider: LlmProvider): boolean {
  const s = breakers[provider];
  const now = Date.now();
  if (now >= s.openUntil) return false;
  if (s.openUntil - now < COOLDOWN_MS - HALF_OPEN_PROBE_MS) {
    return false;
  }
  return true;
}

export function resetCircuitBreakers(): void {
  for (const p of Object.keys(breakers) as LlmProvider[]) {
    breakers[p] = { failures: 0, openUntil: 0, lastFailure: 0 };
  }
}
