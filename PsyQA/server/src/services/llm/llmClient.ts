import { callZhipuGenerate, callZhipuGenerateStream, checkZhipuHealth, getZhipuModel, isZhipuConfigured } from './zhipuClient';
import { callOllamaGenerateOnly, resolveOllamaModel } from './ollamaClient';
import { checkOllamaHealth } from './ollamaClient';
import { isProviderCircuitOpen, recordLlmFailure, recordLlmSuccess } from './llmCircuitBreaker';

export type LlmProvider = 'zhipu' | 'ollama';
export type LlmMode = 'zhipu' | 'ollama' | 'fallback' | 'fast';

let lastActiveProvider: LlmProvider | null = null;

const inflight = new Map<string, Promise<string | null>>();

function dedupeKey(prompt: string, provider: string): string {
  return `${provider}:${prompt.slice(0, 120)}`;
}
export function shouldUseLlm(): boolean {
  if (process.env.PSYQA_SKIP_OLLAMA === '1' || process.env.PSYQA_FAST_ANSWER === '1') {
    return false;
  }
  return true;
}

/** @deprecated use shouldUseLlm */
export function shouldUseOllamaLlm(): boolean {
  return shouldUseLlm();
}

function resolveProviderPreference(): 'auto' | LlmProvider {
  const raw = (process.env.PSYQA_LLM_PROVIDER || 'auto').trim().toLowerCase();
  if (raw === 'zhipu' || raw === 'ollama') return raw;
  return 'auto';
}

export function getLastActiveLlmProvider(): LlmProvider | null {
  return lastActiveProvider;
}

async function isZhipuReady(forceRefresh: boolean): Promise<boolean> {
  if (!isZhipuConfigured()) return false;
  if (isProviderCircuitOpen('zhipu')) return false;
  const pref = resolveProviderPreference();
  if (pref === 'ollama') return false;
  const health = await checkZhipuHealth(forceRefresh);
  return health.ok;
}

async function isOllamaReady(forceRefresh: boolean): Promise<boolean> {
  if (process.env.PSYQA_SKIP_OLLAMA === '1') return false;
  if (isProviderCircuitOpen('ollama')) return false;
  const health = await checkOllamaHealth();
  if (!health.ok) return false;
  const { model } = await resolveOllamaModel(forceRefresh);
  return health.models.some(
    (m) => m === model || m.startsWith(`${model}:`) || m.startsWith(`${model.split(':')[0]}:`)
  );
}

export async function isLlmAvailable(forceRefresh = false): Promise<boolean> {
  if (!shouldUseLlm()) return false;
  const pref = resolveProviderPreference();

  if (pref === 'zhipu') {
    return isZhipuReady(forceRefresh);
  }
  if (pref === 'ollama') {
    return isOllamaReady(forceRefresh);
  }

  if (await isZhipuReady(forceRefresh)) return true;
  return isOllamaReady(forceRefresh);
}

export async function resolveActiveLlmProvider(forceRefresh = false): Promise<LlmProvider | null> {
  if (!shouldUseLlm()) return null;
  const pref = resolveProviderPreference();

  if (pref === 'zhipu') {
    return (await isZhipuReady(forceRefresh)) ? 'zhipu' : null;
  }
  if (pref === 'ollama') {
    return (await isOllamaReady(forceRefresh)) ? 'ollama' : null;
  }

  if (await isZhipuReady(forceRefresh)) return 'zhipu';
  if (await isOllamaReady(forceRefresh)) return 'ollama';
  return null;
}

export async function getActiveLlmModel(): Promise<string> {
  const provider = await resolveActiveLlmProvider();
  if (provider === 'zhipu') return getZhipuModel();
  if (provider === 'ollama') {
    const { model, fineTuned } = await resolveOllamaModel();
    return fineTuned ? `${model}+LoRA` : model;
  }
  if (isZhipuConfigured()) return getZhipuModel();
  const { model } = await resolveOllamaModel();
  return model;
}

export async function getLlmStatus(forceRefresh = false): Promise<{
  provider: LlmProvider | null;
  model: string;
  fineTuned: boolean;
  mode: LlmMode;
}> {
  const mode = await resolveLlmMode(forceRefresh);
  const provider = await resolveActiveLlmProvider(forceRefresh);
  if (provider === 'zhipu') {
    return { provider, model: getZhipuModel(), fineTuned: false, mode };
  }
  if (provider === 'ollama') {
    const { model, fineTuned } = await resolveOllamaModel(forceRefresh);
    return { provider, model, fineTuned, mode };
  }
  const { model, fineTuned } = await resolveOllamaModel(forceRefresh);
  return { provider: null, model, fineTuned, mode };
}

export async function resolveLlmMode(forceRefresh = false): Promise<LlmMode> {
  if (!shouldUseLlm()) return 'fast';
  const provider = await resolveActiveLlmProvider(forceRefresh);
  if (provider === 'zhipu') return 'zhipu';
  if (provider === 'ollama') return 'ollama';
  return 'fallback';
}

export async function callLlmGenerate(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    provider?: LlmProvider | 'auto';
  }
): Promise<string | null> {
  if (!shouldUseLlm()) return null;

  const pref = options?.provider || resolveProviderPreference();
  const tryZhipu = pref === 'zhipu' || (pref === 'auto' && isZhipuConfigured());
  const tryOllama = pref === 'ollama' || pref === 'auto';

  const run = async (): Promise<string | null> => {
    if (tryZhipu && !isProviderCircuitOpen('zhipu')) {
      const text = await callZhipuGenerate(prompt, {
        model: options?.model,
        systemPrompt: options?.systemPrompt,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        timeoutMs: options?.timeoutMs
      });
      if (text) {
        lastActiveProvider = 'zhipu';
        recordLlmSuccess('zhipu');
        return text;
      }
      recordLlmFailure('zhipu');
      if (pref === 'zhipu') return null;
    }

    if (tryOllama && process.env.PSYQA_SKIP_OLLAMA !== '1' && !isProviderCircuitOpen('ollama')) {
      const text = await callOllamaGenerateOnly(prompt, {
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        timeoutMs: options?.timeoutMs
      });
      if (text) {
        lastActiveProvider = 'ollama';
        recordLlmSuccess('ollama');
        return text;
      }
      recordLlmFailure('ollama');
    }

    return null;
  };

  if (process.env.PSYQA_LLM_DEDUPE === '1') {
    const key = dedupeKey(prompt, pref);
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = run().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return run();
}

export async function callLlmGenerateStream(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    provider?: LlmProvider | 'auto';
    onToken?: (chunk: string) => void;
  }
): Promise<string | null> {
  if (!shouldUseLlm()) return null;

  const pref = options?.provider || resolveProviderPreference();
  const tryZhipu = pref === 'zhipu' || (pref === 'auto' && isZhipuConfigured());

  if (tryZhipu && !isProviderCircuitOpen('zhipu')) {
    const text = await callZhipuGenerateStream(prompt, {
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      timeoutMs: options?.timeoutMs,
      onToken: options?.onToken
    });
    if (text) {
      lastActiveProvider = 'zhipu';
      recordLlmSuccess('zhipu');
      return text;
    }
    recordLlmFailure('zhipu');
  }

  const text = await callLlmGenerate(prompt, options);
  if (text && options?.onToken) {
    options.onToken(text);
  }
  return text;
}
