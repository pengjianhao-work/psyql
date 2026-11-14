/**
 * 离线生成 LLM Wiki：
 *   npx ts-node server/scripts/build-llm-wiki.ts --per-category=8
 *   npx ts-node server/scripts/build-llm-wiki.ts --category=academic_stress --dry-run
 * 生成结果写 wiki_documents；报告写 server/data/llm_wiki_build_report.json。
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { ProblemCategory } from '../src/services/psych/emotionService';
import { buildLlmWiki, BuildOptions } from '../src/services/wiki/wikiGenerator';

function parseArgs(argv: string[]): BuildOptions & { dryRun: boolean } {
  const options: BuildOptions & { dryRun: boolean } = { dryRun: false };
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, raw] = arg.slice(2).split('=');
    const value = raw ?? 'true';
    if (key === 'category') options.category = value as ProblemCategory | 'all';
    if (key === 'categories') {
      options.categories = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean) as ProblemCategory[];
    }
    if (key === 'per-category') options.perCategory = Number(value) || 8;
    if (key === 'provider') options.provider = value === 'ollama' ? 'ollama' : 'zhipu';
    if (key === 'model') options.model = value;
    if (key === 'sleep-ms') options.sleepMs = Number(value) || 0;
    if (key === 'max-pages') options.maxPages = Number(value) || undefined;
    if (key === 'dry-run') options.dryRun = value !== 'false';
    if (key === 'force') options.force = value !== 'false';
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log('[wiki] 开始生成', JSON.stringify(options));
  const report = await buildLlmWiki(options);
  const reportPath = path.join(__dirname, '..', 'data', 'llm_wiki_build_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(
    '[wiki] 完成：published=' + report.totals.published +
    ' draft=' + report.totals.drafts +
    ' skipped=' + report.totals.skipped +
    ' failed=' + report.totals.failed
  );
  for (const [category, stat] of Object.entries(report.perCategory)) {
    console.log('  ' + category + ': ' + JSON.stringify(stat));
  }
  if (report.samples.length) {
    console.log('[wiki] 样例：');
    report.samples.forEach((sample) => console.log('  - ' + sample.title + '：' + sample.summary));
  }
  console.log('[wiki] 报告：' + reportPath);
  if (report.totals.published + report.totals.drafts + report.totals.skipped === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[wiki] 生成失败：', err);
  process.exit(1);
});
