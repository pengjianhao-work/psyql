/**
 * LLM Wiki 的生成提示词与硬性约束。
 * 生成的是"心理科普 + 自助支持"主题页，不是个案评估；任何诊断/药物/治疗替代说法都不允许。
 */

import { WikiSourceRef } from './wikiTypes';

export const REQUIRED_HEADINGS = ['常见表现', '可能的成因', '可以尝试的做法', '什么时候该求助'] as const;

export const WIKI_SYSTEM_PROMPT = [
  '你是校园心理支持知识库的编辑，只写"心理科普 + 自助支持"主题页，不面向任何具体个人。',
  '硬性规则（违反任意一条即视为不合格）：',
  '1. 不诊断、不评估个人、不判断病情轻重、不写"你患有/你得的是/你的症状是"。',
  '2. 不开药、不写药名、不写剂量、不写处方、不建议停药或换药、不写治疗或康复步骤。',
  '3. 不替代专业帮助；涉及就医时只说"可以联系学校心理中心或正规医疗机构"，不要虚构学校名称、电话、地址。',
  '4. 危机相关主题（自伤、自杀、创伤）必须写：立即联系身边可信的人，拨打全国心理援助热线 400-161-9995 或 120。',
  '5. 只使用给出的参考知识里的事实，不编造统计数字、研究、机构或热线。',
  '6. 用平实、短句、第二人称或无人称，不煽情，不写"我理解你"这类陪伴话术。',
  '7. 每个 section 必须写成完整句子，按汉字计不少于 80 字，不能只写短语或关键词；不足视为不合格。'
].join('\n');

export function buildWikiUserPrompt(params: {
  seedQuestion: string;
  categoryLabel: string;
  sources: WikiSourceRef[];
}): string {
  const sourceLines = params.sources.map((source, index) => {
    return (index + 1) + '. [' + source.docId + '] 问：' + source.question + '\n   答：' + source.answer;
  });
  const schema = [
    '{',
    '  "title": "通用主题名，4-20 字，不能出现「我/我的/你/怎么办/吗/呢/？」；例如把「和室友关系不好怎么办」写成「室友关系冲突的应对」",',
    '  "summary": "一句话理解，20-60 字，客观平实",',
    '  "sections": [',
    '    {"heading": "常见表现", "body": "100-180 字，至少 3 句"},',
    '    {"heading": "可能的成因", "body": "100-180 字，至少 3 句"},',
    '    {"heading": "可以尝试的做法", "body": "120-220 字，至少 3 句，给 1-3 个具体、当天可做的小行动，不用编号"},',
    '    {"heading": "什么时候该求助", "body": "80-180 字，至少 3 句，说明什么信号出现时联系学校心理中心或专业机构；涉及危机时写上 400-161-9995 或 120"}',
    '  ],',
    '  "relatedQuestions": ["2-3 个用户可能接着问的问题，每个不超过 20 字"]',
    '}'
  ].join('\n');

  return [
    '主题种子问题：' + params.seedQuestion,
    '所属分类：' + params.categoryLabel,
    '参考知识（来自本仓库知识库，只能据此提炼）：',
    sourceLines.join('\n'),
    '',
    '请输出一个 JSON 对象，不要 markdown 代码块，字段如下：',
    schema,
    '要求：总字数 450-700 字；title 必须是通用主题名，不能复述个案问题、不能出现「我/我的/你/怎么办/吗/呢/？」；四个 section 标题必须与上面完全一致、顺序一致；每段必须是完整句子，按汉字计不少于 80 字，不足视为不合格；不要输出 JSON 以外的任何文字。'
  ].join('\n');
}

export function buildPromptHash(inputs: string[]): string {
  // 使用同步哈希，生成端只做幂等判断
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(inputs.join('\n')).digest('hex').slice(0, 16);
}
