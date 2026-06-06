import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { runAnnualReports, previousYearKey } from '../src/services/userAgentSummaryService';

async function main(): Promise<void> {
  const yearArg = process.argv.find((a) => a.startsWith('--year='))?.split('=')[1];
  const userId = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1];
  const year = yearArg || previousYearKey();

  console.log(`[user:annual_report] 目标年份 ${year}`);
  const results = await runAnnualReports({ year, userId });

  const done = results.filter((r) => !r.skipped && r.report);
  const skipped = results.filter((r) => r.skipped);
  console.log(`完成 ${done.length} 人，跳过 ${skipped.length} 人`);
  for (const r of done) {
    console.log(`\n=== ${r.userId} ${r.year} ===\n${r.report.slice(0, 400)}...\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
