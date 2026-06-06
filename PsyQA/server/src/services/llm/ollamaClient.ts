import axios from 'axios';
import { Readable } from 'stream';
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

/** Ollama NDJSON 流式生成，逐 token 回调 */
export async function callOllamaGenerateStream(
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
  }
): Promise<string | null> {
  const { model } = await resolveOllamaModel();
  try {
    const response = await axios.post(
      DEFAULT_API,
      {
        model: options?.model || model,
        prompt,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.15,
          num_predict: options?.maxTokens ?? 512
        }
      },
      { responseType: 'stream', timeout: options?.timeoutMs ?? 90_000 }
    );

    return await new Promise<string | null>((resolve) => {
      let full = '';
      let buffer = '';
      const stream = response.data as Readable;

      const finish = (result: string | null) => {
        resolve(result);
      };

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed) as { response?: string; done?: boolean };
            if (typeof json.response === 'string' && json.response) {
              full += json.response;
              options?.onToken?.(json.response);
            }
          } catch {
            /* skip malformed line */
          }
        }
      });

      stream.on('end', () => finish(full.trim() || null));
      stream.on('error', (err) => {
        console.warn('Ollama stream error:', err);
        finish(full.trim() || null);
      });
    });
  } catch (error) {
    console.warn('Ollama stream failed:', error);
    clearOllamaModelCache();
    try {
      const { markOllamaUnavailable } = await import('./ollamaAvailability');
      markOllamaUnavailable();
    } catch {
      /* ignore */
    }
    return null;
  }
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
