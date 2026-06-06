import { checkOllamaHealth, getOllamaModel } from './ollamaClient';
import { isZhipuConfigured } from './zhipuClient';
import { isLlmAvailable, shouldUseLlm } from './llmClient';

let cache: { ok: boolean; until: number } = { ok: true, until: 0 };

export function markOllamaUnavailable(cooldownMs = 120_000): void {
  cache = { ok: false, until: Date.now() + cooldownMs };
}

/** 默认优先大模型；设 PSYQA_FAST_ANSWER=1 或 PSYQA_SKIP_OLLAMA=1 可关闭 */
export function shouldUseOllamaLlm(): boolean {
  return shouldUseLlm();
}

export function clearOllamaAvailabilityCache(): void {
  cache = { ok: true, until: 0 };
}

/** 智谱 API 或 Ollama 任一可用即返回 true */
export async function isOllamaAvailable(forceRefresh = false): Promise<boolean> {
  if (!shouldUseLlm()) return false;
  if (process.env.PSYQA_SKIP_OLLAMA === '1' && !isZhipuConfigured()) return false;

  const now = Date.now();
  if (!forceRefresh && now < cache.until) return cache.ok;

  const ok = await isLlmAvailable(forceRefresh);
  cache = { ok, until: now + 90_000 };
  return ok;
}

export async function isOllamaOnlyAvailable(forceRefresh = false): Promise<boolean> {
  if (!shouldUseLlm() || process.env.PSYQA_SKIP_OLLAMA === '1') return false;
  const model = getOllamaModel();
  const health = await checkOllamaHealth();
  return (
    health.ok &&
    health.models.some((m) => m === model || m.startsWith(`${model}:`) || m.startsWith(`${model}-`))
  );
}
