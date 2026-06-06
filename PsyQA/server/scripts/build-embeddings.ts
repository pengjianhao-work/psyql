/**
 * 为 vector_documents 批量生成 Ollama 嵌入向量
 * 用法: npx ts-node server/scripts/build-embeddings.ts [--limit 500]
 */
import { getDb } from '../src/db/database';
import { runJsonMigrationIfNeeded } from '../src/db/migrateFromJson';
import { embedText, saveStoredEmbedding, countEmbeddingsInDb } from '../src/services/embeddingService';
import { vectorDb } from '../src/services/vectorDBService';

async function main(): Promise<void> {
  runJsonMigrationIfNeeded();
  const allFlag = process.argv.includes('--all');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = allFlag ? 999999 : Number(limitArg || 300);
  const count = vectorDb.getDocumentCount();
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
  for (const row of rows) {
    const emb = await embedText(row.content);
    if (emb) {
      saveStoredEmbedding(row.id, emb);
      done++;
      if (done % 50 === 0 || done === total) {
        console.log(`已生成 ${done}/${total}（失败 ${failed}）`);
      }
    } else {
      failed++;
      if (failed % 10 === 0) console.warn(`嵌入失败累计 ${failed} 条`);
    }
  }
  console.log(`完成：本次写入 ${done} 条嵌入，失败 ${failed}，库内合计 ${countEmbeddingsInDb()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
