/**
 * 从 vector_db/documents.json 全量重建 SQLite vector_documents（嵌入清空后重算）
 * 用法: ts-node server/scripts/resync-vector-sqlite.ts
 */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { runJsonMigrationIfNeeded } from '../src/db/migrateFromJson';

function main(): void {
  runJsonMigrationIfNeeded();
  const jsonPath = path.join(__dirname, '..', '..', 'vector_db', 'documents.json');
  // Prefer PsyQA/vector_db (app root); fall back to monorepo root vector_db
  const altPath = path.join(__dirname, '..', '..', '..', 'vector_db', 'documents.json');
  const resolved = fs.existsSync(jsonPath) ? jsonPath : altPath;
  if (!fs.existsSync(resolved)) {
    console.error('未找到 vector_db/documents.json，请先运行 expand:knowledge');
    process.exit(1);
  }

  const docs = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as Array<{
    id: string;
    question: string;
    answer: string;
    content?: string;
  }>;
  console.log(`读取 ${resolved} → ${docs.length} 条`);

  const db = getDb();
  db.prepare('DELETE FROM vector_documents').run();
  const insert = db.prepare(
    `INSERT INTO vector_documents(id, question, answer, content, embedding_json)
     VALUES(?, ?, ?, ?, NULL)`
  );
  const tx = db.transaction((rows: typeof docs) => {
    for (const d of rows) {
      insert.run(
        d.id,
        d.question,
        d.answer,
        d.content || `${d.question} ${d.answer}`
      );
    }
  });
  tx(docs);
  console.log(`已重建 vector_documents: ${docs.length} 条（嵌入待生成）`);
}

main();
