/**
 * 将 SQLite / vector_db 中的文档同步到 Chroma 向量库
 * 用法: PSYQA_CHROMA_ENABLED=1 npm run sync:chroma
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getDb } from '../src/db/database';
import { upsertChromaBatch, getChromaStatus, resetChromaCache, deletePublicChromaCollection, getPublicCollectionName } from '../src/services/chromaVectorService';
import { loadStoredEmbedding, saveStoredEmbedding, embedText } from '../src/services/embeddingService';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const BATCH = 40;

interface DocRow {
  id: string;
  question: string;
  answer: string;
  content: string;
  embedding_json: string | null;
}

async function loadDocuments(storedOnly: boolean): Promise<DocRow[]> {
  const db = getDb();
  const sql = storedOnly
    ? 'SELECT id, question, answer, content, embedding_json FROM vector_documents WHERE embedding_json IS NOT NULL'
    : 'SELECT id, question, answer, content, embedding_json FROM vector_documents';
  const rows = db.prepare(sql).all() as DocRow[];

  if (rows.length > 0) return rows;

  const jsonPath = path.join(__dirname, '..', '..', 'vector_db', 'documents.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('No vector_documents in SQLite and no vector_db/documents.json');
    return [];
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Array<{
    id: string;
    question: string;
    answer: string;
    content: string;
  }>;
  return data.map((d) => ({
    id: d.id,
    question: d.question,
    answer: d.answer,
    content: d.content || `${d.question} ${d.answer}`,
    embedding_json: null
  }));
}

async function main(): Promise<void> {
  const storedOnly = process.argv.includes('--stored-only');

  if (process.env.PSYQA_CHROMA_ENABLED !== '1' && process.env.PSYQA_CHROMA_ENABLED !== 'true') {
    console.log('Set PSYQA_CHROMA_ENABLED=1 in .env to enable Chroma sync');
    process.exit(1);
  }

  resetChromaCache();
  const status = await getChromaStatus();
  console.log('Chroma:', status);

  if (process.argv.includes('--reset')) {
    const deleted = await deletePublicChromaCollection();
    console.log(`Reset public collection "${getPublicCollectionName()}": ${deleted ? 'deleted' : 'failed or missing'}`);
    resetChromaCache();
  }

  const connected = (await getChromaStatus()).connected;
  if (!connected) {
    console.error('Chroma not reachable at', status.url);
    console.error('Start with: npm run start:chroma  (or: chroma run --path ./chroma_data --port 8000)');
    process.exit(1);
  }

  const docs = await loadDocuments(storedOnly);
  console.log(`Syncing ${docs.length} documents${storedOnly ? ' (stored embeddings only)' : ''}...`);

  let synced = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    const batch = await Promise.all(
      slice.map(async (d) => {
        let embedding: number[] | null = null;
        if (d.embedding_json) {
          try {
            embedding = JSON.parse(d.embedding_json) as number[];
          } catch {
            embedding = null;
          }
        }
        if (!embedding) {
          embedding = await embedText(d.content);
          if (embedding) saveStoredEmbedding(d.id, embedding);
        }
        return {
          id: d.id,
          question: d.question,
          answer: d.answer,
          content: d.content,
          embedding
        };
      })
    );

    const n = await upsertChromaBatch(batch);
    synced += n;
    console.log(`  batch ${Math.floor(i / BATCH) + 1}: ${n}/${slice.length} (total ${synced})`);
  }

  const final = await getChromaStatus();
  console.log(`Done. Chroma collection "${final.collection}" count: ${final.count ?? '?'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
