/**
 * 修 wiki 页质量：扫描已生成页，把标题是个案提问/含污名化词的页按新规则重新生成，
 * 用该页原有 sourceRefs 作为来源（不需要重新选种），保持 slug 不变；失败就降为 draft。
 *
 *   npx ts-node server/scripts/fix-wiki-quality.ts --dry-run
 *   npx ts-node server/scripts/fix-wiki-quality.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { callLlmGenerate } from '../src/services/llm/llmClient';
import { embedText } from '../src/services/knowledge/embeddingService';
import { buildWikiUserPrompt, WIKI_SYSTEM_PROMPT, buildPromptHash } from '../src/services/wiki/wikiPrompt';
import { validateDraft } from '../src/services/wiki/wikiValidator';
import { listWikiPages, getWikiPage, upsertWikiPage } from '../src/services/wiki/wikiStore';
import { getCategoryName, ProblemCategory } from '../src/services/psych/emotionService';

const TITLE_BAD = /(我的|(?<!自)我|你|怎么办|吗|呢|？|\?)/;
const SHAME = /(精神病|疯子|神经病|变态)/;
// 医疗/危机敏感种子不重生成，保留 draft 等人工判断，避免 LLM 把个案写成科普甚至医疗建议
const SENSITIVE = /(精神病|幻觉|抑郁|自杀|自伤|轻生|想死|不想活|离开|崩溃|生病|症状|诊断|药)/;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const includeDrafts = process.argv.includes('--include-drafts');
  const published = listWikiPages({ pageSize: 100, status: 'published' }).items;
  const drafts = includeDrafts ? listWikiPages({ pageSize: 100, status: 'draft' }).items : [];

  const badPublished = published.filter(
    (item) => TITLE_BAD.test(item.title) || SHAME.test(item.title) || SHAME.test(item.summary)
  );
  const draftCandidates = drafts.filter((item) => {
    const page = getWikiPage(item.slug);
    const errors = page?.sections?.[0]?.body || '';
    return errors.includes('太像个案提问') && !SENSITIVE.test(item.title);
  });
  const skippedSensitive = drafts.filter((item) => SENSITIVE.test(item.title));
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
  const onlySlug = onlyArg ? onlyArg.slice('--only='.length) : '';
  const bad = [...badPublished, ...draftCandidates].filter((item) => !onlySlug || item.slug === onlySlug);

  console.log('published:', published.length, 'badPublished:', badPublished.length);
  if (includeDrafts) {
    console.log('drafts:', drafts.length, 'regenerate:', draftCandidates.length, 'skipSensitive:', skippedSensitive.length);
    if (skippedSensitive.length) {
      console.log('保留 draft（医疗/危机敏感，需人工审核）:');
      skippedSensitive.forEach((item) => console.log('  -', item.title));
    }
  }
  bad.forEach((item) => console.log('plan:', item.slug, '|', item.title));
  if (dryRun) return;

  const model = process.env.WIKI_LLM_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
  let fixed = 0;
  let failed = 0;
  for (const summary of bad) {
    const page = getWikiPage(summary.slug);
    if (!page || page.sourceRefs.length < 3) {
      failed += 1;
      continue;
    }
    const prompt = buildWikiUserPrompt({
      seedQuestion: page.title,
      categoryLabel: getCategoryName(page.category as ProblemCategory),
      sources: page.sourceRefs
    });
    const raw = await callLlmGenerate(prompt, {
      provider: 'zhipu',
      model,
      systemPrompt: WIKI_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 1800,
      timeoutMs: 120000
    });
    const validation = raw ? validateDraft(raw, getCategoryName(page.category as ProblemCategory)) : { ok: false, errors: ['无输出'] };
    if (!validation.ok || !validation.draft) {
      const rawTitle = (raw || '').match(/"title"\s*:\s*"([^"]{0,80})"/)?.[1] || '(none)';
      console.warn('fix failed:', page.slug, '| model title:', rawTitle, '|', validation.errors.join('；'));
      // 先降为 draft，保证线上不再检索到这页
      upsertWikiPage({ ...page, status: 'draft', updatedAt: new Date().toISOString() }, null);
      failed += 1;
      continue;
    }
    const draft = validation.draft;
    const next = {
      ...page,
      title: draft.title,
      summary: draft.summary,
      sections: draft.sections,
      relatedQuestions: draft.relatedQuestions,
      status: 'published' as const,
      promptHash: buildPromptHash([prompt, ...page.sourceRefs.map((s) => s.docId)]),
      updatedAt: new Date().toISOString()
    };
    const embedding = await embedText([next.title, next.summary, ...next.sections.map((s) => s.heading + s.body)].join('\n'));
    upsertWikiPage(next, embedding);
    fixed += 1;
    console.log('fixed:', next.title);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log('fixed:', fixed, 'failed:', failed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
