import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { listUserDialogMemories } from '../src/services/user/userMemoryService';
import { listMoodCheckins } from '../src/services/user/moodCheckinService';

/**
 * 排查某个用户的记忆条目与情绪打卡：
 *   npx ts-node server/scripts/inspect-user-memory.ts --user=<userId> [--all]
 * 默认只列未归档条目，加 --all 显示全部（含 archived）。
 */
async function main(): Promise<void> {
  const userId = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1];
  if (!userId) {
    console.error('用法: ts-node server/scripts/inspect-user-memory.ts --user=<userId> [--all]');
    process.exit(1);
  }
  const showAll = process.argv.includes('--all');

  const memories = listUserDialogMemories(userId).filter((m) => showAll || !m.archived);
  console.log(`[memory:inspect] ${userId} 记忆条目 ${memories.length} 条${showAll ? '（含归档）' : '（未归档）'}`);
  for (const m of memories.slice(0, 50)) {
    const flags = [
      m.locked ? 'locked' : '',
      m.archived ? 'archived' : '',
      m.tags?.length ? `tags:${m.tags.join(',')}` : ''
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`- ${m.dialogTime} ${flags}`);
    console.log(`  ${(m.contentPreview || '').slice(0, 120)}`);
  }
  if (memories.length > 50) console.log(`  … 其余 ${memories.length - 50} 条略`);

  const checkins = listMoodCheckins(userId, 20);
  console.log(`[memory:inspect] ${userId} 情绪打卡 ${checkins.length} 条（最近）`);
  for (const c of checkins) {
    console.log(`- ${c.createdAt} ${c.mood}${c.note ? `（${c.note}）` : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
