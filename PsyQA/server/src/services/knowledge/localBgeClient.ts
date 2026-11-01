import axios from 'axios';
import type { HybridEncoded } from './qdrantHybrid';

const DEFAULT_URL = 'http://127.0.0.1:8091';

let healthCache: { ok: boolean; at: number } | null = null;

export function localBgeUrl(): string {
  return (process.env.BGE_M3_URL || DEFAULT_URL).replace(/\/$/, '');
}

export function resetLocalBgeCache(): void {
  healthCache = null;
}

async function ping(timeoutMs: number): Promise<boolean> {
  try {
    const { data } = await axios.get(`${localBgeUrl()}/health`, { timeout: timeoutMs });
    return data?.ok === true;
  } catch {
    return false;
  }
}

/** 编码服务没起来时快速返回，避免每条检索都等满超时。 */
export async function localBgeReady(): Promise<boolean> {
  const now = Date.now();
  if (healthCache) {
    const freshFor = healthCache.ok ? 15_000 : 3_000;
    if (now - healthCache.at < freshFor) return healthCache.ok;
  }
  const ok = await ping(800);
  healthCache = { ok, at: now };
  return ok;
}

export async function embedMultiLocal(text: string, colbertK = 128): Promise<HybridEncoded | null> {
  const input = text.trim().slice(0, 2000);
  if (!input || !(await localBgeReady())) return null;
  try {
    const { data } = await axios.post(
      `${localBgeUrl()}/embed`,
      { texts: [input], max_length: 768, colbert_k: colbertK },
      { timeout: 30_000 }
    );
    const item = data?.items?.[0];
    if (!Array.isArray(item?.dense) || item.dense.length < 8) return null;
    const indices = Array.isArray(item.sparse?.indices) ? (item.sparse.indices as number[]) : [];
    const values = Array.isArray(item.sparse?.values) ? (item.sparse.values as number[]) : [];
    const colbert = Array.isArray(item.colbert) ? (item.colbert as number[][]) : [];
    return { dense: item.dense as number[], sparse: { indices, values }, colbert };
  } catch (err) {
    healthCache = { ok: false, at: Date.now() };
    console.warn('[bge-m3] 本机编码失败:', err instanceof Error ? err.message : err);
    return null;
  }
}
