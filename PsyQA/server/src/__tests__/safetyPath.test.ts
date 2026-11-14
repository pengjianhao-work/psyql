import fs from 'fs';
import path from 'path';
import { assessRisk } from '../services/psych/emotionService';
import { classifyIntent, formatIntentDirective } from '../services/psych/intentService';
import { buildSafetyReply, requiresSafetyPath } from '../services/psych/safetyReply';
import { CAMPUS_REPLY_REQUIREMENT } from '../services/llm/counselReplyPolicy';

interface SafetyCase {
  id: string;
  text: string;
  expectSafety: boolean;
  expectType?: string;
}

const cases = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/ownerSafetyCases.json'), 'utf8')
) as SafetyCase[];

describe('owner safety cases', () => {
  test.each(cases)('$id', (item) => {
    const risk = assessRisk(item.text);
    expect(requiresSafetyPath(risk)).toBe(item.expectSafety);
    expect(classifyIntent(item.text).kind === 'crisis').toBe(item.expectSafety);
    if (item.expectType) {
      expect(risk.crisisTypes).toContain(item.expectType);
    }
    if (item.expectSafety) {
      const reply = buildSafetyReply(risk);
      expect(reply).toContain('400-161-9995');
      expect(reply).not.toMatch(/你有抑郁症|建议停药|可以停药/);
      expect(reply).not.toMatch(/\n1\.\s/);
    }
  });
});

describe('answer shape instructions', () => {
  test('asks for two-block empathy plus 2-3 concrete suggestions, forbids invented history', () => {
    expect(CAMPUS_REPLY_REQUIREMENT).toContain('这一轮');
    expect(CAMPUS_REPLY_REQUIREMENT).toContain('3–4 条具体建议');
    expect(CAMPUS_REPLY_REQUIREMENT).toContain('350–600 字');
    expect(CAMPUS_REPLY_REQUIREMENT).toContain('送礼');
    expect(CAMPUS_REPLY_REQUIREMENT).not.toContain('一个今天能做完的小行动');
    expect(formatIntentDirective(classifyIntent('室友又吵起来了，我好难受'))).toContain('3–4 条具体建议');
    expect(formatIntentDirective(classifyIntent('室友又吵起来了，我好难受'))).not.toContain('不要步骤清单');
  });
});
