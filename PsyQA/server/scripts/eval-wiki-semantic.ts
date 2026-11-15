/**
 * 对比 PSYQA_WIKI_SEMANTIC 关/开时 wiki 检索的命中差异。
 * 只读 wiki_documents 已发布页；语义分依赖 embedText 可用的嵌入路线
 * （云端 SiliconFlow 或本机 Ollama）。拿不到查询向量时自动退回关键词，
 * 脚本会先探测 embedText，避免把"没嵌入"误报成"语义无收益"。
 *
 *   cd PsyQA && npx ts-node server/scripts/eval-wiki-semantic.ts
 */
import '../src/config/env';
import { searchWiki } from '../src/services/wiki/wikiService';
import { embedText } from '../src/services/knowledge/embeddingService';

interface Case {
  q: string;
  expect: string; // 期望命中的标题关键词
  category?: string;
}

const CASES: Case[] = [
  { q: '一到考试就心慌手抖，脑子一片空白', expect: '考试焦虑', category: 'academic_stress' },
  { q: '总是忍不住刷手机，越刷越焦虑', expect: '手机使用过度', category: 'academic_stress' },
  { q: '和室友关系很僵，住在一起很压抑', expect: '宿舍关系', category: 'interpersonal' },
  { q: '晚上睡不着，半夜醒了就再也睡不着', expect: '失眠', category: 'addiction' },
  { q: '觉得自己不够好，老是自我否定', expect: '自我否定', category: 'emotion_regulation' },
  { q: '想跟爸妈说看心理医生，他们不同意很生气', expect: '心理医生', category: 'family_relationship' },
  { q: '一被领导或老师批评就特别慌', expect: '批评', category: 'self_identity' },
  { q: '事情总是拖到最后一天才做', expect: '拖延', category: 'career_future' },
  { q: '网恋奔现前特别焦虑，怕对方看到真实的自己', expect: '网恋', category: 'body_image' },
  { q: '吃完就想吐，暴食之后又特别后悔', expect: '暴食', category: 'body_image' },
  { q: '小时候被凶过，现在一被凶就发抖', expect: '批评', category: 'self_identity' },
  { q: '谈恋爱总是吵架，和好了又吵', expect: '争吵', category: 'romantic_relationship' }
];

interface Row {
  q: string;
  top1: string;
  top1Score: number;
  hit: boolean;
  ms: number;
}

async function runOnce(semantic: boolean): Promise<Row[]> {
  process.env.PSYQA_WIKI_SEMANTIC = semantic ? '1' : '0';
  const rows: Row[] = [];
  for (const c of CASES) {
    const t0 = Date.now();
    const hits = await searchWiki(c.q, { category: c.category, topK: 2 });
    const ms = Date.now() - t0;
    const top = hits[0];
    rows.push({
      q: c.q,
      top1: top ? `${top.title} (${top.score.toFixed(3)})` : '(无命中)',
      top1Score: top ? top.score : 0,
      hit: Boolean(top && top.title.includes(c.expect)),
      ms
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const probe = await embedText('嵌入服务探测');
  const probeMs = Date.now() - t0;
  if (!probe) {
    console.error('embedText 返回 null：没有可用嵌入路线，语义分不会生效。');
    console.error('检查 PSYQA_EMBED_PROVIDER / SILICONFLOW key / Ollama，或改用关键词模式结论。');
    process.exit(2);
  }
  console.log(`[probe] embedText 可用，维度 ${probe.length}，耗时 ${probeMs}ms\n`);

  const off = await runOnce(false);
  const on = await runOnce(true);

  let offHit = 0;
  let onHit = 0;
  let changed = 0;
  let offMs = 0;
  let onMs = 0;
  console.log('query'.padEnd(34) + 'OFF top1'.padEnd(40) + 'ON top1'.padEnd(40) + 'ms');
  for (let i = 0; i < CASES.length; i++) {
    const o = off[i];
    const n = on[i];
    if (o.hit) offHit++;
    if (n.hit) onHit++;
    if (o.top1 !== n.top1) changed++;
    offMs += o.ms;
    onMs += n.ms;
    console.log(
      o.q.slice(0, 16).padEnd(18) +
        (o.hit ? '✓' : '✗') + o.top1.slice(0, 36).padEnd(38) +
        (n.hit ? '✓' : '✗') + n.top1.slice(0, 36).padEnd(38) +
        `${o.ms}/${n.ms}`
    );
  }
  console.log('\n=== 汇总 ===');
  console.log(`期望命中 top1：关键词 ${offHit}/${CASES.length} → 语义 ${onHit}/${CASES.length}`);
  console.log(`top1 发生变化的查询：${changed}/${CASES.length}`);
  console.log(`平均耗时：关键词 ${(offMs / CASES.length).toFixed(0)}ms → 语义 ${(onMs / CASES.length).toFixed(0)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
