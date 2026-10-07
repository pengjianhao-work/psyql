/**
 * 为 vector_documents 批量生成 BGE-M3 嵌入向量
 * 用法: npx ts-node server/scripts/build-embeddings.ts [--limit 500] [--all]
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getDb } from '../src/db/database';
import { runJsonMigrationIfNeeded } from '../src/db/migrateFromJson';
import { embedTexts, resolveEmbedRoutes, saveStoredEmbedding, countEmbeddingsInDb } from '../src/services/embeddingService';
import { vectorDb } from '../src/services/vectorDBService';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 整批失败或个别空向量时退避重试，避免限流把新增条目留空。 */
async function embedSliceWithRetry(texts: string[], attempts = 5): Promise<Array<number[] | null>> {
  let vectors = await embedTexts(texts);
  for (let attempt = 1; attempt < attempts && vectors.some((item) => !item); attempt++) {
    const wait = 1500 * attempt;
    console.warn(`批次有空向量，${wait}ms 后重试 (${attempt}/${attempts - 1})`);
    await delay(wait);
    const again = await embedTexts(texts);
    vectors = vectors.map((item, index) => item || again[index]);
  }
  return vectors;
}

async function main(): Promise<void> {
  runJsonMigrationIfNeeded();
  const allFlag = process.argv.includes('--all');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = allFlag ? 999999 : Number(limitArg || 300);
  const count = vectorDb.getDocumentCount();
  const route = resolveEmbedRoutes()[0];
  console.log(`嵌入路线: ${route ? `${route.provider}:${route.model}` : '无'}`);
  if (process.argv.includes('--probe')) {
    const [vec] = await embedTexts(['最近学习压力很大']);
    console.log(`probe 维度: ${vec?.length ?? '失败'}`);
    if (!vec || vec.length < 8) process.exit(1);
    return;
  }
  console.log(`向量文档总数: ${count}，已有嵌入: ${countEmbeddingsInDb()}`);

  const rows = getDb()
    .prepare(
      `SELECT id, content FROM vector_documents WHERE embedding_json IS NULL LIMIT ?`
    )
    .all(limit) as Array<{ id: string; content: string }>;

  if (!rows.length) {
    console.log('无需生成（请先确保 documents.json 已加载）');
    return;
  }

  let done = 0;
  let failed = 0;
  const total = rows.length;
  const batchSize = 16;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const slice = rows.slice(offset, offset + batchSize);
    const vectors = await embedSliceWithRetry(slice.map((row) => row.content));
    slice.forEach((row, index) => {
      const emb = vectors[index];
      if (emb) {
        saveStoredEmbedding(row.id, emb);
        done++;
      } else {
        failed++;
      }
    });
    if (done % 64 < batchSize || offset + batchSize >= rows.length) {
      console.log(`已生成 ${done}/${total}（失败 ${failed}）`);
    }
    await delay(250);
  }
  console.log(`完成：本次写入 ${done} 条嵌入，失败 ${failed}，库内合计 ${countEmbeddingsInDb()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
