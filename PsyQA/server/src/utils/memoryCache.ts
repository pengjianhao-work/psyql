type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 500;

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  if (store.size <= MAX_ENTRIES) return;
  const keys = [...store.keys()].slice(0, store.size - MAX_ENTRIES);
  keys.forEach((k) => store.delete(k));
}

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  prune();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T> | T
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await factory();
  cacheSet(key, value, ttlMs);
  return value;
}

export function cacheDeletePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
