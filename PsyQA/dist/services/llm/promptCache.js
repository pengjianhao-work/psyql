"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedSystemPrompt = getCachedSystemPrompt;
exports.setCachedSystemPrompt = setCachedSystemPrompt;
exports.buildPromptCacheKey = buildPromptCacheKey;
exports.getPromptCacheStats = getPromptCacheStats;
const MAX_ENTRIES = 48;
const cache = new Map();
function getCachedSystemPrompt(key) {
    const hit = cache.get(key);
    if (!hit)
        return null;
    hit.at = Date.now();
    return hit.systemPrompt;
}
function setCachedSystemPrompt(key, systemPrompt) {
    if (cache.size >= MAX_ENTRIES) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest)
            cache.delete(oldest[0]);
    }
    cache.set(key, { systemPrompt, at: Date.now() });
}
function buildPromptCacheKey(category, tone) {
    return `counsel:${category}:${tone}`;
}
function getPromptCacheStats() {
    return { size: cache.size, max: MAX_ENTRIES };
}
