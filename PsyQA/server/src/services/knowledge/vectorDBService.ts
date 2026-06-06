import * as fs from 'fs';
import * as path from 'path';
import { preprocessText, computeTextRelevance, extractChineseNGrams } from '../../utils/textProcessor';
import { getDb } from '../../db/database';
import { embedText, loadStoredEmbedding, cosineSimilarity as embeddingCosine } from './embeddingService';
import { resolveDataFile, vectorDbPath } from '../../config/paths';

export type { SearchResult } from './searchTypes';
import type { SearchResult } from './searchTypes';

interface VectorDocument {
  id: string;
  question: string;
  answer: string;
  content: string;
  tokens: string[];
}

class VectorDatabase {
  private documents: VectorDocument[] = [];
  private storagePath: string;

  constructor() {
    this.storagePath = vectorDbPath();
    this.load();
  }

  private tokenize(text: string): string[] {
    const processed = preprocessText(text);
    const tokens = new Set<string>();
    for (let i = 0; i < processed.length - 1; i++) {
      tokens.add(processed.substring(i, i + 2));
    }
    const words = processed.split(' ').filter((w) => w.length > 0);
    words.forEach((w) => tokens.add(w));
    return Array.from(tokens);
  }

  addDocument(question: string, answer: string): void {
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

  addDocuments(items: Array<{ question: string; answer: string }>): void {
    items.forEach((item) => this.addDocument(item.question, item.answer));
    this.save();
    console.log(`Added ${items.length} documents to vector database`);
  }

  private tfIdfVector(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    const vec = new Map<string, number>();
    const docLen = tokens.length || 1;
    const n = this.documents.length || 1;
    for (const [term, count] of tf.entries()) {
      const df = this.documents.filter((d) => d.tokens.includes(term)).length;
      const idf = Math.log((n + 1) / (df + 1)) + 1;
      vec.set(term, (count / docLen) * idf);
    }
    return vec;
  }

  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const v of a.values()) normA += v * v;
    for (const v of b.values()) normB += v * v;
    for (const [k, va] of a.entries()) {
      const vb = b.get(k);
      if (vb) dot += va * vb;
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  searchTfidf(query: string, topK = 5): SearchResult[] {
    if (this.documents.length === 0) return [];

    const queryTokens = Array.from(new Set(extractChineseNGrams(query)));
    const queryVec = this.tfIdfVector(queryTokens);
    const results = this.documents.map((doc) => {
      const docVec = this.tfIdfVector(doc.tokens);
      const tfidf = this.cosineSimilarity(queryVec, docVec);
      const relevance = computeTextRelevance(query, doc.question, doc.answer) / 12;
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

  save(): void {
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
    } catch (error) {
      console.error('Error saving vector database:', error);
    }
  }

  load(): void {
    try {
      const filePath = path.join(this.storagePath, 'documents.json');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as Array<Omit<VectorDocument, 'tokens'>>;
        this.documents = data.map((doc) => ({
          ...doc,
          tokens: this.tokenize(doc.content)
        }));
        console.log(`Loaded ${this.documents.length} documents from vector database`);
        this.syncToSqlite();
      } else {
        this.initializeFromKnowledgeBase();
      }
    } catch (error) {
      console.error('Error loading vector database:', error);
      this.initializeFromKnowledgeBase();
    }
  }

  private initializeFromKnowledgeBase(): void {
    const knowledgePath = resolveDataFile('mental_dataset.json');
    try {
      if (fs.existsSync(knowledgePath)) {
        const content = fs.readFileSync(knowledgePath, 'utf-8');
        const dataset = JSON.parse(content) as { knowledge?: Array<{ question?: string; answer?: string }> };
        const knowledgeItems = dataset.knowledge || (dataset as unknown as Array<{ question?: string; answer?: string }>);
        const items = knowledgeItems
          .map((item) => ({ question: item.question || '', answer: item.answer || '' }))
          .filter((item) => item.question && item.answer);
        this.addDocuments(items);
        console.log(`Initialized vector database from knowledge base: ${items.length} items`);
      }
    } catch (error) {
      console.error('Error initializing from knowledge base:', error);
    }
  }

  getDocumentCount(): number {
    return this.documents.length;
  }

  reloadFromDisk(): number {
    this.documents = [];
    this.load();
    return this.documents.length;
  }

  private syncToSqlite(): void {
    try {
      const db = getDb();
      const insert = db.prepare(
        `INSERT OR IGNORE INTO vector_documents(id, question, answer, content, embedding_json)
         VALUES(?, ?, ?, ?, NULL)`
      );
      const tx = db.transaction((docs: VectorDocument[]) => {
        for (const d of docs) {
          insert.run(d.id, d.question, d.answer, d.content);
        }
      });
      tx(this.documents);
    } catch (e) {
      console.warn('Vector DB sqlite sync skipped:', e);
    }
  }
}

export const vectorDb = new VectorDatabase();

export async function searchVectorDb(query: string, topK = 5): Promise<SearchResult[]> {
  const { isChromaEnabled, searchChroma } = await import('./chromaVectorService');
  if (isChromaEnabled()) {
    const chromaHits = await searchChroma(query, topK);
    if (chromaHits.length > 0) {
      return chromaHits;
    }
  }

  const tfidf = vectorDb.searchTfidf(query, Math.max(topK * 4, 12));
  const { isOllamaAvailable } = await import('../llm/ollamaAvailability');
  if (!(await isOllamaAvailable())) {
    return tfidf.slice(0, topK);
  }

  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return tfidf.slice(0, topK);

  const candidates = tfidf.slice(0, 40);
  const rescored: SearchResult[] = [];
  for (const c of candidates) {
    const docEmb = loadStoredEmbedding(c.id);
    if (!docEmb) {
      rescored.push(c);
      continue;
    }
    const sim = embeddingCosine(queryEmbedding, docEmb);
    rescored.push({ ...c, similarity: sim * 0.75 + c.similarity * 0.25 });
  }
  return rescored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

export const addToVectorDb = (question: string, answer: string): void => {
  vectorDb.addDocument(question, answer);
};

export const populateVectorDb = (items: Array<{ question: string; answer: string }>): void => {
  vectorDb.addDocuments(items);
};

export const reloadVectorDatabase = (): number => vectorDb.reloadFromDisk();
