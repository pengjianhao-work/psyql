import axios from 'axios';
import { resolveOllamaModel, clearOllamaModelCache } from './loraModelRegistry';

export { resolveOllamaModel, clearOllamaModelCache };
export { getConfiguredLoraModelName, shouldPreferLoraModel } from './loraModelRegistry';

/** 兼容 .env 里写 http://localhost:11434 或完整 /api/generate 路径 */
export function resolveOllamaGenerateUrl(): string {
  const raw = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  if (raw.includes('/api/generate')) return raw;
  return `${raw.replace(/\/$/, '')}/api/generate`;
}

export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || 'qwen:7b';
}

const DEFAULT_API = resolveOllamaGenerateUrl();

export async function checkOllamaHealth(): Promise<{
  ok: boolean;
  models: string[];
  error?: string;
}> {
  const base = (process.env.OLLAMA_API_URL || 'http://localhost:11434').replace(/\/api\/generate\/?$/, '');
  try {
    const { data } = await axios.get(`${base.replace(/\/$/, '')}/api/tags`, { timeout: 5000 });
    const models = Array.isArray(data?.models)
      ? data.models.map((m: { name?: string }) => m.name).filter(Boolean)
      : [];
    return { ok: true, models };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, models: [], error: msg };
  }
}

/** 仅调用本地 Ollama（不经过智谱优先链） */
export async function callOllamaGenerateOnly(
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }
): Promise<string | null> {
  const { model } = await resolveOllamaModel();
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(
        DEFAULT_API,
        {
          model,
          prompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.15,
            num_predict: options?.maxTokens ?? 512
          }
        },
        { timeout: options?.timeoutMs ?? 45000 }
      );
      const text = response.data?.response;
      return typeof text === 'string' ? text.trim() : null;
    } catch (error) {
      console.warn(`Ollama generate failed (${attempt}/${maxAttempts}, model=${model}):`, error);
      clearOllamaModelCache();
      try {
        const { markOllamaUnavailable } = await import('./ollamaAvailability');
        markOllamaUnavailable();
      } catch {
        /* ignore */
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  return null;
}

/** 优先智谱 AI，回退 Ollama */
export async function callOllamaGenerate(
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    systemPrompt?: string;
  }
): Promise<string | null> {
  const { callLlmGenerate } = await import('./llmClient');
  return callLlmGenerate(prompt, options);
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
