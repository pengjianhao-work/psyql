const MAX_ENTRIES = 48;
const cache = new Map<string, { systemPrompt: string; at: number }>();

export function getCachedSystemPrompt(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  hit.at = Date.now();
  return hit.systemPrompt;
}

export function setCachedSystemPrompt(key: string, systemPrompt: string): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { systemPrompt, at: Date.now() });
}

export function buildPromptCacheKey(category: string, tone: string): string {
  return `counsel:${category}:${tone}`;
}

export function getPromptCacheStats(): { size: number; max: number } {
  return { size: cache.size, max: MAX_ENTRIES };
}
