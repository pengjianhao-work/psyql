"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordLlmSuccess = recordLlmSuccess;
exports.recordLlmFailure = recordLlmFailure;
exports.isProviderCircuitOpen = isProviderCircuitOpen;
exports.resetCircuitBreakers = resetCircuitBreakers;
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 120000;
const HALF_OPEN_PROBE_MS = 30000;
const breakers = {
    zhipu: { failures: 0, openUntil: 0, lastFailure: 0 },
    ollama: { failures: 0, openUntil: 0, lastFailure: 0 }
};
function recordLlmSuccess(provider) {
    breakers[provider].failures = 0;
    breakers[provider].openUntil = 0;
}
function recordLlmFailure(provider) {
    const s = breakers[provider];
    s.failures += 1;
    s.lastFailure = Date.now();
    if (s.failures >= FAILURE_THRESHOLD) {
        s.openUntil = Date.now() + COOLDOWN_MS;
    }
}
function isProviderCircuitOpen(provider) {
    const s = breakers[provider];
    const now = Date.now();
    if (now >= s.openUntil)
        return false;
    if (s.openUntil - now < COOLDOWN_MS - HALF_OPEN_PROBE_MS) {
        return false;
    }
    return true;
}
function resetCircuitBreakers() {
    for (const p of Object.keys(breakers)) {
        breakers[p] = { failures: 0, openUntil: 0, lastFailure: 0 };
    }
}
