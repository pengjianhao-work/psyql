import { checkOllamaHealth } from './ollamaClient';

/** 常见 LoRA 微调后导入 Ollama 的模型名 */
export const LORA_MODEL_ALIASES = ['psyqa-counsel', 'mental-counsel', 'mental_lora'] as const;

let resolvedCache: { model: string; fineTuned: boolean; until: number } | null = null;
const CACHE_MS = 60_000;

export function getConfiguredLoraModelName(): string {
  return (process.env.PSYQA_LORA_MODEL || 'psyqa-counsel').trim();
}

export function shouldPreferLoraModel(): boolean {
  if (process.env.PSYQA_PREFER_LORA === '1') return true;
  const provider = (process.env.PSYQA_LLM_PROVIDER || 'auto').trim().toLowerCase();
  return provider === 'ollama' || provider === 'lora';
}

function matchesLoraName(name: string): boolean {
  const lower = name.toLowerCase();
  const lora = getConfiguredLoraModelName().toLowerCase();
  if (lower === lora || lower.startsWith(`${lora}:`)) return true;
  return LORA_MODEL_ALIASES.some((a) => lower === a || lower.startsWith(`${a}:`));
}

export function pickOllamaModelFromTags(
  tags: string[],
  explicitModel?: string
): { model: string; fineTuned: boolean } {
  const explicit = (explicitModel || process.env.OLLAMA_MODEL || '').trim();

  if (explicit && explicit !== 'qwen:7b' && !shouldPreferLoraModel()) {
    return { model: explicit, fineTuned: matchesLoraName(explicit) };
  }

  const loraName = getConfiguredLoraModelName();
  const candidates = [loraName, ...LORA_MODEL_ALIASES];

  if (shouldPreferLoraModel() || !explicit) {
    for (const c of candidates) {
      const hit = tags.find((t) => t === c || t.startsWith(`${c}:`));
      if (hit) return { model: hit, fineTuned: true };
    }
  }

  if (explicit) {
    return { model: explicit, fineTuned: matchesLoraName(explicit) };
  }

  const qwen = tags.find((t) => t.startsWith('qwen'));
  return { model: qwen || 'qwen:7b', fineTuned: false };
}

export async function resolveOllamaModel(forceRefresh = false): Promise<{
  model: string;
  fineTuned: boolean;
}> {
  const now = Date.now();
  if (!forceRefresh && resolvedCache && now < resolvedCache.until) {
    return { model: resolvedCache.model, fineTuned: resolvedCache.fineTuned };
  }

  const health = await checkOllamaHealth();
  if (!health.ok || !health.models.length) {
    const fallback = process.env.OLLAMA_MODEL || 'qwen:7b';
    return { model: fallback, fineTuned: matchesLoraName(fallback) };
  }

  const picked = pickOllamaModelFromTags(health.models);
  resolvedCache = { ...picked, until: now + CACHE_MS };
  return picked;
}

export function clearOllamaModelCache(): void {
  resolvedCache = null;
}
