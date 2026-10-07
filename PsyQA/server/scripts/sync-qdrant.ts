/**
 * 将 SQLite 中已有的 BGE-M3 嵌入同步到 Qdrant
 * 用法: npm run sync:qdrant:reset
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getDb } from '../src/db/database';
import {
  deleteQdrantCollection,
  ensureQdrantCollection,
  getQdrantStatus,
  resetQdrantCache,
  upsertQdrantBatch
} from '../src/services/knowledge/qdrantVectorService';

const BATCH = 64;

interface DocRow {
  id: string;
  question: string;
  answer: string;
  content: string;
  embedding_json: string | null;
}

async function main(): Promise<void> {
  if (process.env.PSYQA_QDRANT_ENABLED !== '1' && process.env.PSYQA_QDRANT_ENABLED !== 'true') {
    console.log('Set PSYQA_QDRANT_ENABLED=1 in .env');
    process.exit(1);
  }

  resetQdrantCache();
  if (process.argv.includes('--reset')) {
    const deleted = await deleteQdrantCollection();
    console.log(`Reset collection: ${deleted ? 'deleted or absent' : 'failed'}`);
    resetQdrantCache();
  }

  const ready = await ensureQdrantCollection();
  if (!ready) {
    const status = await getQdrantStatus();
    console.error('Qdrant not reachable at', status.url);
    console.error('Start with: npm run start:qdrant');
    process.exit(1);
  }

  const rows = getDb()
    .prepare(
      'SELECT id, question, answer, content, embedding_json FROM vector_documents WHERE embedding_json IS NOT NULL'
    )
    .all() as DocRow[];
  console.log(`Syncing ${rows.length} stored embeddings to Qdrant...`);

  let synced = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const batch = slice.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      content: row.content,
      embedding: row.embedding_json ? (JSON.parse(row.embedding_json) as number[]) : null
    }));
    const n = await upsertQdrantBatch(batch);
    synced += n;
    console.log(`  batch ${Math.floor(i / BATCH) + 1}: ${n}/${slice.length} (total ${synced})`);
  }

  const finalStatus = await getQdrantStatus();
  console.log(`Done. Qdrant collection "${finalStatus.collection}" count: ${finalStatus.count ?? '?'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
