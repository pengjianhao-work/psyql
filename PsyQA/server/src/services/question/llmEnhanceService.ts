import { extractJsonObject } from '../llm/ollamaClient';
import { callLlmGenerate } from '../llm/llmClient';
import { getCategoryName, ProblemCategory } from '../psych/emotionService';
import { SimilarQuestion } from '../../types';

/** 大模型生成的 1–2 个「继续聊」话术 */
export async function generateFollowUpQuestions(
  userQuery: string,
  botReply: string,
  problemLabel?: string
): Promise<string[]> {
  const prompt = `你是高校心理咨询助理。根据本轮对话，给出 2 个学生可能想继续聊的中文短问句。

要求：
- 必须紧扣用户原话与助手回复，不要泛泛的「如何调节情绪」
- 每个问句 12–18 字，像学生自己会输入的那种
- 不要重复用户已经问过的话
- 输出 JSON 数组，不要其它文字

【用户】${userQuery.slice(0, 400)}
${problemLabel ? `【主题】${problemLabel}` : ''}
【助手回复摘要】${botReply.slice(0, 350)}

示例：["和舍友冷战后怎么开口？","担心冲突再来怎么办？"]

请输出 JSON 数组：`;

  const raw = await callLlmGenerate(prompt, {
    temperature: 0.35,
    maxTokens: 180,
    timeoutMs: 14_000
  });
  if (!raw) return [];

  const obj = extractJsonObject(raw);
  if (obj && Array.isArray(obj.items)) {
    return sanitizeFollowUps(obj.items);
  }

  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) return sanitizeFollowUps(parsed);
    } catch {
      /* ignore */
    }
  }
  return [];
}

function sanitizeFollowUps(items: unknown[]): string[] {
  return items
    .map((x) => String(x).replace(/\s+/g, ' ').trim())
    .filter((q) => q.length >= 8 && q.length <= 60)
    .slice(0, 2);
}

export function mapFollowUpsToSimilarQuestions(questions: string[]): SimilarQuestion[] {
  return questions.map((q) => ({
    question: q,
    description: '结合本轮对话智能推荐',
    keywords: '大模型推荐',
    answers: [],
    similarity: 12
  }));
}

/** 报告顶部的学生可读摘要（大模型生成） */
export async function generateStudentReportBrief(params: {
  userQuery: string;
  emotionLabel: string;
  problemLabel: string;
  riskLabel: string;
  stressLevel: number;
}): Promise<string | null> {
  const prompt = `你是心理咨询助理。请用温暖、非诊断的语气，为学生写一段「本次咨询摘要」（80–120 汉字）。

要求：3 句话以内；第一句共情；第二句点出主要困扰与情绪；第三句一句可行建议或鼓励求助（若风险偏高须提示联系学校心理中心/热线，但不要恐吓）。

【用户原话】${params.userQuery.slice(0, 300)}
【情绪】${params.emotionLabel}
【困扰类型】${params.problemLabel}
【风险】${params.riskLabel}
【压力指数】${params.stressLevel}/100

直接输出摘要正文，不要标题、不用 JSON：`;

  const raw = await callLlmGenerate(prompt, {
    temperature: 0.4,
    maxTokens: 220,
    timeoutMs: 16_000
  });
  if (!raw) return null;
  const text = raw.replace(/^["'「]|["'」]$/g, '').trim();
  return text.length >= 20 ? text.slice(0, 280) : null;
}

export function getProblemLabel(category: ProblemCategory): string {
  return getCategoryName(category);
}
