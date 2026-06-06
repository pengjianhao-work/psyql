import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getDialogsPendingVectorization } from '../src/db/userAgentStore';
import { indexUserDialogMemory } from '../src/services/userMemoryService';
import type { PsychSnapshot } from '../src/types/psychHistory';

async function main(): Promise<void> {
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 200);
  const userFilter = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1];

  const pending = getDialogsPendingVectorization(limit).filter(
    (row) => !userFilter || row.userId === userFilter
  );

  if (!pending.length) {
    console.log('[chat:save_emb] 无待向量化对话');
    return;
  }

  console.log(`[chat:save_emb] 待处理 ${pending.length} 条对话`);
  let ok = 0;
  let fail = 0;

  for (const row of pending) {
    let psych: PsychSnapshot | undefined;
    if (row.psychJson) {
      try {
        psych = JSON.parse(row.psychJson) as PsychSnapshot;
      } catch {
        /* ignore */
      }
    }
    try {
      await indexUserDialogMemory({
        userId: row.userId,
        dialogTime: row.dialogTime,
        userText: row.userText,
        botText: row.botText,
        psych
      });
      ok += 1;
      process.stdout.write('.');
    } catch (err) {
      fail += 1;
      console.warn('\nfail', row.userId, row.dialogTime, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n[chat:save_emb] 完成 ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
