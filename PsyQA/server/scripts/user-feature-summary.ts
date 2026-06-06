import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { runMonthlyFeatureSummary, previousMonthKey } from '../src/services/userAgentSummaryService';

async function main(): Promise<void> {
  const monthArg = process.argv.find((a) => a.startsWith('--month='))?.split('=')[1];
  const userId = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1];
  const month = monthArg || previousMonthKey();

  console.log(`[user:feature_summary] 目标月份 ${month}`);
  const results = await runMonthlyFeatureSummary({ month, userId });

  const done = results.filter((r) => !r.skipped && r.summary);
  const skipped = results.filter((r) => r.skipped);
  console.log(`完成 ${done.length} 人，跳过 ${skipped.length} 人`);
  for (const r of done) {
    console.log(`- ${r.userId} ${r.month}: ${r.summary.slice(0, 80)}...`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
