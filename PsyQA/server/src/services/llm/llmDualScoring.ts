import { isOllamaAvailable } from './ollamaAvailability';
import { isZhipuConfigured, callZhipuGenerate } from './zhipuClient';
import { callOllamaGenerate } from './ollamaClient';

export interface DualLlmResult {
  answer: string;
  provider: 'zhipu' | 'ollama' | 'single';
  zhipuScore?: number;
  ollamaScore?: number;
  dualMode: boolean;
}

function scoreAnswerRelevance(question: string, answer: string): number {
  if (!answer || answer.length < 20) return 0;
  const qTokens = new Set(question.replace(/\s+/g, '').slice(0, 80));
  let overlap = 0;
  for (const ch of answer.replace(/\s+/g, '').slice(0, 400)) {
    if (qTokens.has(ch)) overlap += 1;
  }
  const lenScore = Math.min(answer.length / 600, 1) * 30;
  const overlapScore = Math.min(overlap / 12, 1) * 40;
  const structureScore = /【|建议|可以|理解/.test(answer) ? 20 : 5;
  const ethicsScore = /专业|诊断|热线|支持/.test(answer) ? 10 : 0;
  return Math.round(lenScore + overlapScore + structureScore + ethicsScore);
}

export function isDualLlmEnabled(): boolean {
  return process.env.PSYQA_DUAL_LLM === '1';
}

/** 智谱 + Ollama 并行预推理，相关性打分择优 */
export async function generateWithDualScoring(
  prompt: string,
  question: string,
  options?: { temperature?: number; timeoutMs?: number }
): Promise<DualLlmResult> {
  if (!isDualLlmEnabled()) {
    return { answer: '', provider: 'single', dualMode: false };
  }

  const zhipuOk = isZhipuConfigured();
  const ollamaOk = await isOllamaAvailable();
  if (!zhipuOk && !ollamaOk) {
    return { answer: '', provider: 'single', dualMode: false };
  }
  if (zhipuOk && !ollamaOk) {
    const answer = (await callZhipuGenerate(prompt, options)) || '';
    return { answer, provider: 'zhipu', dualMode: false };
  }
  if (!zhipuOk && ollamaOk) {
    const answer = (await callOllamaGenerate(prompt, options)) || '';
    return { answer, provider: 'ollama', dualMode: false };
  }

  const [zhipuAns, ollamaAns] = await Promise.all([
    callZhipuGenerate(prompt, options).catch(() => ''),
    callOllamaGenerate(prompt, options).catch(() => '')
  ]);

  const zhipuText = zhipuAns || '';
  const ollamaText = ollamaAns || '';
  const zhipuScore = scoreAnswerRelevance(question, zhipuText);
  const ollamaScore = scoreAnswerRelevance(question, ollamaText);

  if (zhipuScore >= ollamaScore) {
    return {
      answer: zhipuText || ollamaText,
      provider: 'zhipu',
      zhipuScore,
      ollamaScore,
      dualMode: true
    };
  }
  return {
    answer: ollamaText || zhipuText,
    provider: 'ollama',
    zhipuScore,
    ollamaScore,
    dualMode: true
  };
}
