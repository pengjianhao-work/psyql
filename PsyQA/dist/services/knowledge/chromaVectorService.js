"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.isChromaEnabled = isChromaEnabled;
exports.getChromaStatus = getChromaStatus;
exports.searchChroma = searchChroma;
exports.upsertChromaBatch = upsertChromaBatch;
exports.resetChromaCache = resetChromaCache;
exports.searchPublicChromaCollection = searchPublicChromaCollection;
exports.searchUserChromaCollection = searchUserChromaCollection;
exports.upsertUserDialogVector = upsertUserDialogVector;
const embeddingService_1 = require("./embeddingService");
const COLLECTION = process.env.CHROMA_COLLECTION || 'psyqa_knowledge';
const CHROMA_URL = (process.env.CHROMA_URL || 'http://localhost:8000').replace(/\/$/, '');
let clientPromise = null;
let collectionPromise = null;
let chromaAvailable = null;
function isChromaEnabled() {
    return process.env.PSYQA_CHROMA_ENABLED === '1' || process.env.PSYQA_CHROMA_ENABLED === 'true';
}
function getClient() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isChromaEnabled())
            return null;
        if (chromaAvailable === false)
            return null;
        if (!clientPromise) {
            clientPromise = (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { ChromaClient } = yield Promise.resolve().then(() => __importStar(require('chromadb')));
                    const client = new ChromaClient({ path: CHROMA_URL });
                    yield client.heartbeat();
                    chromaAvailable = true;
                    return client;
                }
                catch (err) {
                    chromaAvailable = false;
                    console.warn('[chroma] unavailable:', err instanceof Error ? err.message : err);
                    return null;
                }
            }))();
        }
        return clientPromise;
    });
}
function getCollection() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!collectionPromise) {
            collectionPromise = (() => __awaiter(this, void 0, void 0, function* () {
                const client = yield getClient();
                if (!client)
                    return null;
                try {
                    return yield client.getOrCreateCollection({
                        name: COLLECTION,
                        metadata: { source: 'psyqa', hnsw_space: 'cosine' }
                    });
                }
                catch (err) {
                    console.warn('[chroma] collection error:', err instanceof Error ? err.message : err);
                    chromaAvailable = false;
                    return null;
                }
            }))();
        }
        return collectionPromise;
    });
}
function getChromaStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        const enabled = isChromaEnabled();
        if (!enabled) {
            return { enabled: false, connected: false, url: CHROMA_URL, collection: COLLECTION };
        }
        const col = yield getCollection();
        if (!col) {
            return { enabled: true, connected: false, url: CHROMA_URL, collection: COLLECTION };
        }
        try {
            const count = yield col.count();
            return { enabled: true, connected: true, url: CHROMA_URL, collection: COLLECTION, count };
        }
        catch (_a) {
            return { enabled: true, connected: false, url: CHROMA_URL, collection: COLLECTION };
        }
    });
}
function searchChroma(query_1) {
    return __awaiter(this, arguments, void 0, function* (query, topK = 5) {
        var _a, _b, _c, _d, _e, _f;
        const col = yield getCollection();
        if (!col)
            return [];
        const queryEmbedding = yield (0, embeddingService_1.embedText)(query);
        if (!queryEmbedding)
            return [];
        try {
            const result = yield col.query({
                queryEmbeddings: [queryEmbedding],
                nResults: topK,
                include: ['metadatas', 'distances']
            });
            const ids = (_b = (_a = result.ids) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : [];
            const metas = (_d = (_c = result.metadatas) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : [];
            const distances = (_f = (_e = result.distances) === null || _e === void 0 ? void 0 : _e[0]) !== null && _f !== void 0 ? _f : [];
            return ids.map((id, i) => {
                var _a, _b, _c, _d;
                const meta = ((_a = metas[i]) !== null && _a !== void 0 ? _a : {});
                const dist = (_b = distances[i]) !== null && _b !== void 0 ? _b : 1;
                const similarity = Math.max(0, 1 - dist);
                return {
                    id,
                    question: (_c = meta.question) !== null && _c !== void 0 ? _c : '',
                    answer: (_d = meta.answer) !== null && _d !== void 0 ? _d : '',
                    similarity
                };
            }).filter((r) => r.question && r.answer);
        }
        catch (err) {
            console.warn('[chroma] query failed:', err instanceof Error ? err.message : err);
            return [];
        }
    });
}
function upsertChromaBatch(items) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const col = yield getCollection();
        if (!col || items.length === 0)
            return 0;
        const ready = [];
        for (const item of items) {
            let emb = (_a = item.embedding) !== null && _a !== void 0 ? _a : (0, embeddingService_1.loadStoredEmbedding)(item.id);
            if (!emb) {
                emb = yield (0, embeddingService_1.embedText)(item.content);
            }
            if (emb) {
                ready.push(Object.assign(Object.assign({}, item), { embedding: emb }));
            }
        }
        if (!ready.length)
            return 0;
        yield col.upsert({
            ids: ready.map((r) => r.id),
            embeddings: ready.map((r) => r.embedding),
            documents: ready.map((r) => r.content),
            metadatas: ready.map((r) => ({ question: r.question, answer: r.answer }))
        });
        return ready.length;
    });
}
function resetChromaCache() {
    clientPromise = null;
    collectionPromise = null;
    chromaAvailable = null;
}
function sanitizeUserCollectionName(userId) {
    return `user_${userId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
}
function getUserCollection(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield getClient();
        if (!client)
            return null;
        try {
            return yield client.getOrCreateCollection({
                name: sanitizeUserCollectionName(userId),
                metadata: { source: 'psyqa_user', userId, hnsw_space: 'cosine' }
            });
        }
        catch (err) {
            console.warn('[chroma] user collection error:', err instanceof Error ? err.message : err);
            return null;
        }
    });
}
function searchPublicChromaCollection(query_1) {
    return __awaiter(this, arguments, void 0, function* (query, topK = 5) {
        return searchChroma(query, topK);
    });
}
function searchUserChromaCollection(userId_1, query_1) {
    return __awaiter(this, arguments, void 0, function* (userId, query, topK = 5) {
        var _a, _b, _c, _d, _e, _f;
        const col = yield getUserCollection(userId);
        if (!col)
            return [];
        const queryEmbedding = yield (0, embeddingService_1.embedText)(query);
        if (!queryEmbedding)
            return [];
        try {
            const result = yield col.query({
                queryEmbeddings: [queryEmbedding],
                nResults: topK,
                include: ['metadatas', 'distances']
            });
            const ids = (_b = (_a = result.ids) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : [];
            const metas = (_d = (_c = result.metadatas) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : [];
            const distances = (_f = (_e = result.distances) === null || _e === void 0 ? void 0 : _e[0]) !== null && _f !== void 0 ? _f : [];
            return ids.map((id, i) => {
                var _a, _b, _c, _d, _e;
                const meta = ((_a = metas[i]) !== null && _a !== void 0 ? _a : {});
                const dist = (_b = distances[i]) !== null && _b !== void 0 ? _b : 1;
                const similarity = Math.max(0, 1 - dist);
                return {
                    id,
                    question: (_d = (_c = meta.userPreview) !== null && _c !== void 0 ? _c : meta.question) !== null && _d !== void 0 ? _d : '',
                    answer: (_e = meta.content) !== null && _e !== void 0 ? _e : '',
                    similarity
                };
            }).filter((r) => r.question || r.answer);
        }
        catch (err) {
            console.warn('[chroma] user query failed:', err instanceof Error ? err.message : err);
            return [];
        }
    });
}
function upsertUserDialogVector(userId, item) {
    return __awaiter(this, void 0, void 0, function* () {
        const col = yield getUserCollection(userId);
        if (!col)
            return false;
        try {
            yield col.upsert({
                ids: [item.id],
                embeddings: [item.embedding],
                documents: [item.content],
                metadatas: [Object.assign(Object.assign({}, item.metadata), { content: item.content.slice(0, 500) })]
            });
            return true;
        }
        catch (err) {
            console.warn('[chroma] user upsert failed:', err instanceof Error ? err.message : err);
            return false;
        }
    });
}
