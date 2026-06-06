import axios from 'axios';

const DEFAULT_BASE = 'https://open.bigmodel.cn/api/paas/v4';

export function getZhipuApiKey(): string | null {
  const key = (process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || '').trim();
  return key.length >= 8 ? key : null;
}

export function getZhipuModel(): string {
  return (process.env.ZHIPU_MODEL || 'glm-4-flash').trim();
}

export function getZhipuBaseUrl(): string {
  const raw = (process.env.ZHIPU_API_URL || DEFAULT_BASE).replace(/\/$/, '');
  return raw;
}

export function isZhipuConfigured(): boolean {
  return Boolean(getZhipuApiKey());
}

let healthCache: { ok: boolean; until: number } = { ok: false, until: 0 };

export function markZhipuUnavailable(cooldownMs = 120_000): void {
  healthCache = { ok: false, until: Date.now() + cooldownMs };
}

export function clearZhipuHealthCache(): void {
  healthCache = { ok: false, until: 0 };
}

export async function checkZhipuHealth(forceRefresh = false): Promise<{ ok: boolean; error?: string }> {
  const key = getZhipuApiKey();
  if (!key) return { ok: false, error: 'ZHIPU_API_KEY not set' };

  const now = Date.now();
  if (!forceRefresh && now < healthCache.until) {
    return healthCache.ok ? { ok: true } : { ok: false, error: 'cached unavailable' };
  }

  try {
    const { data } = await axios.post(
      `${getZhipuBaseUrl()}/chat/completions`,
      {
        model: getZhipuModel(),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        temperature: 0.1
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        timeout: 12_000
      }
    );
    const text = data?.choices?.[0]?.message?.content;
    const ok = typeof text === 'string' || data?.choices?.length > 0;
    healthCache = { ok, until: now + 90_000 };
    return ok ? { ok: true } : { ok: false, error: 'empty response' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    healthCache = { ok: false, until: now + 60_000 };
    return { ok: false, error: msg };
  }
}

export async function callZhipuGenerate(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }
): Promise<string | null> {
  const key = getZhipuApiKey();
  if (!key) return null;

  const model = options?.model || getZhipuModel();
  const messages: Array<{ role: string; content: string }> = [];
  if (options?.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: options.systemPrompt.trim() });
  }
  messages.push({ role: 'user', content: prompt });

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data } = await axios.post(
        `${getZhipuBaseUrl()}/chat/completions`,
        {
          model,
          messages,
          temperature: options?.temperature ?? 0.45,
          max_tokens: options?.maxTokens ?? 1024
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          timeout: options?.timeoutMs ?? 60_000
        }
      );
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text.trim()) {
        healthCache = { ok: true, until: Date.now() + 90_000 };
        return text.trim();
      }
    } catch (error) {
      console.warn(`Zhipu generate failed (${attempt}/${maxAttempts}):`, error);
      markZhipuUnavailable();
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 900 * attempt));
      }
    }
  }
  return null;
}

export async function callZhipuGenerateStream(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
  }
): Promise<string | null> {
  const key = getZhipuApiKey();
  if (!key) return null;

  const model = options?.model || getZhipuModel();
  const messages: Array<{ role: string; content: string }> = [];
  if (options?.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: options.systemPrompt.trim() });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const res = await axios.post(
      `${getZhipuBaseUrl()}/chat/completions`,
      {
        model,
        messages,
        temperature: options?.temperature ?? 0.45,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        timeout: options?.timeoutMs ?? 90_000,
        responseType: 'stream'
      }
    );

    let full = '';
    const stream = res.data as NodeJS.ReadableStream;

    await new Promise<void>((resolve, reject) => {
      let buffer = '';
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              full += delta;
              options?.onToken?.(delta);
            }
          } catch {
            /* skip malformed sse */
          }
        }
      });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    if (full.trim()) {
      healthCache = { ok: true, until: Date.now() + 90_000 };
      return full.trim();
    }
  } catch (error) {
    console.warn('Zhipu stream failed:', error);
    markZhipuUnavailable();
  }
  return null;
}
