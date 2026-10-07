import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../../db/database';
import { resolveDataFile, vectorDbPath } from '../../config/paths';
import { SparseIndex } from './sparseIndex';
import { fuseHybridResults } from './hybridRetrieval';

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
  private sparse = new SparseIndex();
  private storagePath: string;

  constructor() {
    this.storagePath = vectorDbPath();
    this.load();
  }

  addDocument(question: string, answer: string): void {
    const content = `${question} ${answer}`;
    this.documents.push({
      id: Date.now().toString(),
      question,
      answer,
      content,
      tokens: []
    });
    this.sparse.add(question, answer);
  }

  addDocuments(items: Array<{ question: string; answer: string }>): void {
    items.forEach((item) => this.addDocument(item.question, item.answer));
    this.save();
    console.log(`Added ${items.length} documents to vector database`);
  }

  searchSparse(query: string, topK = 5): SearchResult[] {
    if (this.documents.length === 0) return [];
    return this.sparse.search(query, topK).flatMap((hit) => {
      const doc = this.documents[hit.index];
      if (!doc) return [];
      return [{ id: doc.id, question: doc.question, answer: doc.answer, similarity: hit.similarity }];
    });
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
        this.sparse.clear();
        this.documents = data.map((doc) => ({
          ...doc,
          tokens: []
        }));
        for (const doc of this.documents) {
          this.sparse.add(doc.question, doc.answer);
        }
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
    this.sparse.clear();
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
  const pool = Math.max(topK * 4, 12);
  const { isQdrantEnabled, searchQdrant } = await import('./qdrantVectorService');
  const densePromise = isQdrantEnabled() ? searchQdrant(query, pool) : Promise.resolve([]);
  const sparseHits = vectorDb.searchSparse(query, pool);
  const denseHits = await densePromise;
  const fused = fuseHybridResults(denseHits, sparseHits, pool);
  const { rerankResults } = await import('./rerankService');
  return rerankResults(query, fused, topK);
}

export const addToVectorDb = (question: string, answer: string): void => {
  vectorDb.addDocument(question, answer);
};

export const populateVectorDb = (items: Array<{ question: string; answer: string }>): void => {
  vectorDb.addDocuments(items);
};

export const reloadVectorDatabase = (): number => vectorDb.reloadFromDisk();
