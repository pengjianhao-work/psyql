"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
exports.cacheGetOrSet = cacheGetOrSet;
exports.cacheDeletePrefix = cacheDeletePrefix;
const store = new Map();
const MAX_ENTRIES = 500;
function prune() {
    const now = Date.now();
    for (const [k, v] of store) {
        if (v.expiresAt <= now)
            store.delete(k);
    }
    if (store.size <= MAX_ENTRIES)
        return;
    const keys = [...store.keys()].slice(0, store.size - MAX_ENTRIES);
    keys.forEach((k) => store.delete(k));
}
function cacheGet(key) {
    const hit = store.get(key);
    if (!hit)
        return undefined;
    if (hit.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
    }
    return hit.value;
}
function cacheSet(key, value, ttlMs) {
    prune();
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
function cacheGetOrSet(key, ttlMs, factory) {
    return __awaiter(this, void 0, void 0, function* () {
        const cached = cacheGet(key);
        if (cached !== undefined)
            return cached;
        const value = yield factory();
        cacheSet(key, value, ttlMs);
        return value;
    });
}
function cacheDeletePrefix(prefix) {
    for (const k of store.keys()) {
        if (k.startsWith(prefix))
            store.delete(k);
    }
}
