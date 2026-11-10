/**
 * 检查规则层会不会把危机送进安全路径。
 * 不调用模型，也不产生盲测分数。
 *
 * 默认跑仓库里的安全回归题（含所有者描述的第 19、20 题）。
 * 那次 DeepSeek-V3.2 的 20 题原文不在仓库里。有原题时：
 *   cd PsyQA && npm run eval:safety -- --file /path/to/blind20.json
 * JSON 每项为 { "id": "19", "text": "...", "expectSafety": true }。
 * 没写 expectSafety 的题目只打印路由，不判分。
 */
import fs from 'fs';
import path from 'path';
import { assessRisk } from '../src/services/psych/emotionService';
import { classifyIntent } from '../src/services/psych/intentService';
import { buildSafetyReply, requiresSafetyPath } from '../src/services/psych/safetyReply';

interface SafetyCase {
  id?: string;
  text?: string;
  question?: string;
  expectSafety?: boolean;
  expectType?: string;
}

function resolveFile(): string {
  const flag = process.argv.indexOf('--file');
  if (flag >= 0 && process.argv[flag + 1]) {
    return path.resolve(process.argv[flag + 1]);
  }
  return path.resolve(__dirname, '../src/__tests__/fixtures/ownerSafetyCases.json');
}

function main(): number {
  const file = resolveFile();
  if (!fs.existsSync(file)) {
    console.error(`找不到题目文件：${file}`);
    console.error('DeepSeek-V3.2 那次 20 题盲测的原题不在这个仓库里，所以这里不能重跑那 20 题，也不会写分数。');
    console.error('把原题存成 JSON 数组后执行：npm run eval:safety -- --file <文件>');
    return 2;
  }

  const rows = JSON.parse(fs.readFileSync(file, 'utf8')) as SafetyCase[];
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error('题目文件是空的。');
    return 2;
  }

  console.log(`路由检查 ${rows.length} 题，来源 ${file}`);
  console.log('这不是盲测打分。没有调用 Qwen，也没有相关性、共情或下一步分数。');

  let failed = 0;
  rows.forEach((row, index) => {
    const text = String(row.text || row.question || '').trim();
    const id = row.id || String(index + 1);
    if (!text) {
      console.error(`${id}\t空题目`);
      failed += 1;
      return;
    }
    const risk = assessRisk(text);
    const safety = requiresSafetyPath(risk) || classifyIntent(text).kind === 'crisis';
    const reply = safety ? buildSafetyReply(risk) : '';
    const hotline = reply.includes('400-161-9995');
    console.log(
      `${id}\tlevel=${risk.level}\ttypes=${(risk.crisisTypes || []).join(',') || '-'}\tsafety=${safety}\thotline=${hotline}`
    );
    if (row.expectSafety !== undefined && row.expectSafety !== safety) {
      console.error(`${id} 期望 safety=${row.expectSafety}，实际 ${safety}`);
      failed += 1;
    }
    if (row.expectType && !(risk.crisisTypes || []).includes(row.expectType)) {
      console.error(`${id} 期望类型 ${row.expectType}`);
      failed += 1;
    }
    if (safety && !hotline) {
      console.error(`${id} 走了安全路径，但回复里没有 400-161-9995`);
      failed += 1;
    }
  });

  if (failed > 0) {
    console.error(`未通过 ${failed} 项`);
    return 1;
  }
  console.log('路由检查通过');
  return 0;
}

process.exit(main());
