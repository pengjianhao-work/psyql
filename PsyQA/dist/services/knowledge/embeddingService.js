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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearEmbeddingCache = clearEmbeddingCache;
exports.embedText = embedText;
exports.cosineSimilarity = cosineSimilarity;
exports.loadStoredEmbedding = loadStoredEmbedding;
exports.saveStoredEmbedding = saveStoredEmbedding;
exports.countEmbeddingsInDb = countEmbeddingsInDb;
const axios_1 = __importDefault(require("axios"));
const database_1 = require("../../db/database");
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const embedCache = new Map();
function embedApiUrl() {
    const raw = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    const base = raw.replace(/\/api\/generate\/?$/, '').replace(/\/$/, '');
    return `${base}/api/embeddings`;
}
function cacheKey(text) {
    return `${EMBED_MODEL}:${text.slice(0, 500)}`;
}
function clearEmbeddingCache() {
    embedCache.clear();
}
function embedText(text) {
    return __awaiter(this, void 0, void 0, function* () {
        const input = text.slice(0, 2000);
        if (!input.trim())
            return null;
        const key = cacheKey(input);
        const cached = embedCache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
            return cached.vec;
        }
        try {
            const { data } = yield axios_1.default.post(embedApiUrl(), { model: EMBED_MODEL, prompt: input }, { timeout: 30000 });
            const vec = data === null || data === void 0 ? void 0 : data.embedding;
            if (!Array.isArray(vec) || vec.length < 8)
                return null;
            const result = vec;
            embedCache.set(key, { vec: result, at: Date.now() });
            if (embedCache.size > CACHE_MAX) {
                const oldest = embedCache.keys().next().value;
                if (oldest)
                    embedCache.delete(oldest);
            }
            return result;
        }
        catch (err) {
            console.warn('Ollama embedding failed:', err instanceof Error ? err.message : err);
            return null;
        }
    });
}
function cosineSimilarity(a, b) {
    if (a.length !== b.length || !a.length)
        return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (!na || !nb)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function loadStoredEmbedding(docId) {
    const row = (0, database_1.getDb)()
        .prepare('SELECT embedding_json FROM vector_documents WHERE id = ?')
        .get(docId);
    if (!(row === null || row === void 0 ? void 0 : row.embedding_json))
        return null;
    try {
        return JSON.parse(row.embedding_json);
    }
    catch (_a) {
        return null;
    }
}
function saveStoredEmbedding(docId, embedding) {
    (0, database_1.getDb)()
        .prepare('UPDATE vector_documents SET embedding_json = ? WHERE id = ?')
        .run(JSON.stringify(embedding), docId);
}
function countEmbeddingsInDb() {
    const row = (0, database_1.getDb)()
        .prepare('SELECT COUNT(*) as c FROM vector_documents WHERE embedding_json IS NOT NULL')
        .get();
    return row.c;
}
