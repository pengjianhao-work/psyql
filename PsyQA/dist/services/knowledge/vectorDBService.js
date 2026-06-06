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
exports.reloadVectorDatabase = exports.populateVectorDb = exports.addToVectorDb = exports.vectorDb = void 0;
exports.searchVectorDb = searchVectorDb;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const textProcessor_1 = require("../../utils/textProcessor");
const database_1 = require("../../db/database");
const embeddingService_1 = require("./embeddingService");
const paths_1 = require("../../config/paths");
class VectorDatabase {
    constructor() {
        this.documents = [];
        this.storagePath = (0, paths_1.vectorDbPath)();
        this.load();
    }
    tokenize(text) {
        const processed = (0, textProcessor_1.preprocessText)(text);
        const tokens = new Set();
        for (let i = 0; i < processed.length - 1; i++) {
            tokens.add(processed.substring(i, i + 2));
        }
        const words = processed.split(' ').filter((w) => w.length > 0);
        words.forEach((w) => tokens.add(w));
        return Array.from(tokens);
    }
    addDocument(question, answer) {
        const content = `${question} ${answer}`;
        const tokens = this.tokenize(content);
        this.documents.push({
            id: Date.now().toString(),
            question,
            answer,
            content,
            tokens
        });
    }
    addDocuments(items) {
        items.forEach((item) => this.addDocument(item.question, item.answer));
        this.save();
        console.log(`Added ${items.length} documents to vector database`);
    }
    tfIdfVector(tokens) {
        const tf = new Map();
        for (const t of tokens) {
            tf.set(t, (tf.get(t) || 0) + 1);
        }
        const vec = new Map();
        const docLen = tokens.length || 1;
        const n = this.documents.length || 1;
        for (const [term, count] of tf.entries()) {
            const df = this.documents.filter((d) => d.tokens.includes(term)).length;
            const idf = Math.log((n + 1) / (df + 1)) + 1;
            vec.set(term, (count / docLen) * idf);
        }
        return vec;
    }
    cosineSimilarity(a, b) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (const v of a.values())
            normA += v * v;
        for (const v of b.values())
            normB += v * v;
        for (const [k, va] of a.entries()) {
            const vb = b.get(k);
            if (vb)
                dot += va * vb;
        }
        if (!normA || !normB)
            return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    searchTfidf(query, topK = 5) {
        if (this.documents.length === 0)
            return [];
        const queryTokens = Array.from(new Set((0, textProcessor_1.extractChineseNGrams)(query)));
        const queryVec = this.tfIdfVector(queryTokens);
        const results = this.documents.map((doc) => {
            const docVec = this.tfIdfVector(doc.tokens);
            const tfidf = this.cosineSimilarity(queryVec, docVec);
            const relevance = (0, textProcessor_1.computeTextRelevance)(query, doc.question, doc.answer) / 12;
            const similarity = tfidf * 0.72 + relevance * 0.28;
            return { id: doc.id, question: doc.question, answer: doc.answer, similarity };
        });
        const sorted = results.filter((r) => r.similarity > 0.18).sort((a, b) => b.similarity - a.similarity);
        if (sorted.length === 0) {
            return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
        }
        const topScore = sorted[0].similarity;
        return sorted.filter((r) => r.similarity >= topScore * 0.55).slice(0, topK);
    }
    save() {
        try {
            fs.mkdirSync(this.storagePath, { recursive: true });
            const data = this.documents.map((doc) => ({
                id: doc.id,
                question: doc.question,
                answer: doc.answer,
                content: doc.content
            }));
            fs.writeFileSync(path.join(this.storagePath, 'documents.json'), JSON.stringify(data, null, 2), 'utf-8');
            console.log(`Vector database saved with ${this.documents.length} documents`);
        }
        catch (error) {
            console.error('Error saving vector database:', error);
        }
    }
    load() {
        try {
            const filePath = path.join(this.storagePath, 'documents.json');
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const data = JSON.parse(content);
                this.documents = data.map((doc) => (Object.assign(Object.assign({}, doc), { tokens: this.tokenize(doc.content) })));
                console.log(`Loaded ${this.documents.length} documents from vector database`);
                this.syncToSqlite();
            }
            else {
                this.initializeFromKnowledgeBase();
            }
        }
        catch (error) {
            console.error('Error loading vector database:', error);
            this.initializeFromKnowledgeBase();
        }
    }
    initializeFromKnowledgeBase() {
        const knowledgePath = (0, paths_1.resolveDataFile)('mental_dataset.json');
        try {
            if (fs.existsSync(knowledgePath)) {
                const content = fs.readFileSync(knowledgePath, 'utf-8');
                const dataset = JSON.parse(content);
                const knowledgeItems = dataset.knowledge || dataset;
                const items = knowledgeItems
                    .map((item) => ({ question: item.question || '', answer: item.answer || '' }))
                    .filter((item) => item.question && item.answer);
                this.addDocuments(items);
                console.log(`Initialized vector database from knowledge base: ${items.length} items`);
            }
        }
        catch (error) {
            console.error('Error initializing from knowledge base:', error);
        }
    }
    getDocumentCount() {
        return this.documents.length;
    }
    reloadFromDisk() {
        this.documents = [];
        this.load();
        return this.documents.length;
    }
    syncToSqlite() {
        try {
            const db = (0, database_1.getDb)();
            const insert = db.prepare(`INSERT OR IGNORE INTO vector_documents(id, question, answer, content, embedding_json)
         VALUES(?, ?, ?, ?, NULL)`);
            const tx = db.transaction((docs) => {
                for (const d of docs) {
                    insert.run(d.id, d.question, d.answer, d.content);
                }
            });
            tx(this.documents);
        }
        catch (e) {
            console.warn('Vector DB sqlite sync skipped:', e);
        }
    }
}
exports.vectorDb = new VectorDatabase();
function searchVectorDb(query_1) {
    return __awaiter(this, arguments, void 0, function* (query, topK = 5) {
        const { isChromaEnabled, searchChroma } = yield Promise.resolve().then(() => __importStar(require('./chromaVectorService')));
        if (isChromaEnabled()) {
            const chromaHits = yield searchChroma(query, topK);
            if (chromaHits.length > 0) {
                return chromaHits;
            }
        }
        const tfidf = exports.vectorDb.searchTfidf(query, Math.max(topK * 4, 12));
        const { isOllamaAvailable } = yield Promise.resolve().then(() => __importStar(require('../llm/ollamaAvailability')));
        if (!(yield isOllamaAvailable())) {
            return tfidf.slice(0, topK);
        }
        const queryEmbedding = yield (0, embeddingService_1.embedText)(query);
        if (!queryEmbedding)
            return tfidf.slice(0, topK);
        const candidates = tfidf.slice(0, 40);
        const rescored = [];
        for (const c of candidates) {
            const docEmb = (0, embeddingService_1.loadStoredEmbedding)(c.id);
            if (!docEmb) {
                rescored.push(c);
                continue;
            }
            const sim = (0, embeddingService_1.cosineSimilarity)(queryEmbedding, docEmb);
            rescored.push(Object.assign(Object.assign({}, c), { similarity: sim * 0.75 + c.similarity * 0.25 }));
        }
        return rescored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    });
}
const addToVectorDb = (question, answer) => {
    exports.vectorDb.addDocument(question, answer);
};
exports.addToVectorDb = addToVectorDb;
const populateVectorDb = (items) => {
    exports.vectorDb.addDocuments(items);
};
exports.populateVectorDb = populateVectorDb;
const reloadVectorDatabase = () => exports.vectorDb.reloadFromDisk();
exports.reloadVectorDatabase = reloadVectorDatabase;
