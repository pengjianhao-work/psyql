import { findSimilarQuestions, loadQuestions } from '../src/services/question/questionCatalog';
import {
  filterSimilarQuestionsForDisplay,
  hasDirectTopicOverlap
} from '../src/utils/relevanceFilter';
import { computeTextRelevance } from '../src/utils/textProcessor';

async function main() {
  const qs = await loadQuestions();
  const cases = ['今天和舍友打架了', '今天天气真好', '最近失眠睡不着'];
  for (const query of cases) {
    const similar = findSimilarQuestions(query, qs, 3);
    const display = filterSimilarQuestionsForDisplay(query, undefined, similar, 2);
    console.log(`\n【${query}】`);
    console.log(`  命中 ${similar.length} 条，展示 ${display.length} 条`);
    display.forEach((s) => {
      const ov = hasDirectTopicOverlap(query, s.question);
      console.log(`  · [overlap=${ov} score=${s.similarity?.toFixed(1)}] ${s.question.slice(0, 48)}`);
    });
    if (display.length === 0) console.log('  （无推荐 — 符合「宁缺毋滥」）');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
