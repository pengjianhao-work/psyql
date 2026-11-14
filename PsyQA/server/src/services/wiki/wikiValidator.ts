/**
 * LLM Wiki 生成结果校验：JSON 结构、字数、禁止说法、危机要素。
 * 校验不过的页只落 draft，不参与线上检索。
 */

import { WikiSection } from './wikiTypes';
import { REQUIRED_HEADINGS } from './wikiPrompt';

export interface WikiDraft {
  title: string;
  summary: string;
  sections: WikiSection[];
  relatedQuestions: string[];
}

const BANNED_RULES: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /(诊断|确诊|患有|得的是|症状是)/, message: '出现诊断性表述' },
  { pattern: /(药名|药物|用药|吃药|开药|处方|剂量|停药|换药)/, message: '出现药物/处方内容' },
  { pattern: /(治愈|根治|治疗方案|治疗步骤|康复步骤)/, message: '出现治疗/治愈承诺' },
  { pattern: /(舍曲林|氟西汀|帕罗西汀|阿普唑仑|艾司西酞普兰|劳拉西泮|奥氮平|利培酮|米氮平|文拉法辛|曲唑酮)/, message: '出现具体药名' },
  { pattern: /(精神病|疯子|神经病|变态)/, message: '出现污名化表述' }
];

const CRISIS_TERMS = /(自杀|自伤|轻生|想死|不想活|结束生命|割腕|创伤)/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  draft?: WikiDraft;
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function textLength(value: string): number {
  return value.replace(/\s+/g, '').length;
}

export function validateDraft(raw: string, categoryLabel: string): ValidationResult {
  const errors: string[] = [];
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['没有解析到 JSON'] };
  }
  const obj = parsed as Record<string, unknown>;
  const title = String(obj.title || '').trim();
  const summary = String(obj.summary || '').trim();
  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : [];
  const relatedRaw = Array.isArray(obj.relatedQuestions) ? obj.relatedQuestions : [];

  if (textLength(title) < 4 || textLength(title) > 24) errors.push('title 长度不在 4-24 字');
  if (/(我的|(?<!自)我|你|怎么办|吗|呢|？|\?)/.test(title)) {
    errors.push('title 太像个案提问，需要通用主题名');
  }
  if (textLength(summary) < 12 || textLength(summary) > 90) errors.push('summary 长度不在 12-90 字');

  const sections: WikiSection[] = [];
  for (const item of sectionsRaw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const heading = String(entry.heading || '').trim();
    const body = String(entry.body || '').trim();
    sections.push({ heading, body });
  }

  const headings = sections.map((section) => section.heading);
  if (headings.length !== REQUIRED_HEADINGS.length) {
    errors.push('section 数量必须是 4 个');
  }
  REQUIRED_HEADINGS.forEach((required, index) => {
    if (headings[index] !== required) errors.push('第 ' + (index + 1) + ' 个 section 标题应为「' + required + '」');
  });
  sections.forEach((section, index) => {
    const length = textLength(section.body);
    if (length < 40) errors.push('section ' + (index + 1) + ' 正文太短');
    if (length > 320) errors.push('section ' + (index + 1) + ' 正文太长');
  });

  const relatedQuestions = relatedRaw
    .map((item) => String(item).trim())
    .filter((item) => item.length >= 4 && item.length <= 30)
    .slice(0, 3);
  if (relatedQuestions.length < 2) errors.push('relatedQuestions 至少 2 条');

  const fullText = [title, summary, ...sections.map((section) => section.heading + section.body)].join('\n');
  BANNED_RULES.forEach((rule) => {
    if (rule.pattern.test(fullText)) errors.push(rule.message);
  });

  const crisisRelated = categoryLabel.includes('创伤') || CRISIS_TERMS.test(fullText);
  if (crisisRelated && !/(400-161-9995|120|心理中心|可信的人|专业帮助)/.test(fullText)) {
    errors.push('危机相关页缺少安全求助信息');
  }

  if (errors.length > 0) return { ok: false, errors: Array.from(new Set(errors)) };

  return {
    ok: true,
    errors: [],
    draft: { title, summary, sections, relatedQuestions }
  };
}
