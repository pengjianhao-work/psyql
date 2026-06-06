import { PsychSnapshot } from '../common/historyManager';
import {
  getCategoryName,
  getEmotionLabel,
  getRiskLabel,
  ProblemCategory,
  RiskLevel
} from '../psych/emotionService';
import { PsychStatModel } from '../psych/psychStatsService';
import { callOllamaGenerate, extractJsonObject } from '../llm/ollamaClient';

export interface ConversationPortrait {
  summary: string;
  emotionalPresentation: string;
  coreConcerns: string[];
  observedPatterns: string[];
  strengths: string[];
  supportNeeds: string[];
  recommendedFocus: string;
  confidence: 'low' | 'medium' | 'high';
  llmUsed: boolean;
  generatedAt: string;
}

function asStringArray(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
}

function buildRulePortrait(
  userQuery: string,
  psych: PsychSnapshot,
  statModel?: PsychStatModel
): ConversationPortrait {
  const emotion = getEmotionLabel(psych.emotion);
  const problem = getCategoryName(psych.problem as ProblemCategory);
  const risk = getRiskLabel(psych.risk as RiskLevel);
  const snippet = userQuery.replace(/\s+/g, ' ').slice(0, 80);

  const patterns: string[] = [];
  if (psych.stressLevel >= 70) patterns.push('当前压力负荷偏高');
  if (psych.anxietyLevel >= 65) patterns.push('焦虑反应较为明显');
  if (psych.moodStability <= 45) patterns.push('情绪波动需持续关注');
  if (psych.confidence < 0.5) patterns.push('表达中情绪信号不够清晰');

  const strengths: string[] = ['主动寻求倾诉与帮助'];
  if (userQuery.length > 40) strengths.push('愿意具体描述自身困扰');

  const supportNeeds: string[] = [`${problem}相关支持与疏导`];
  if (psych.risk === 'high' || psych.risk === 'critical') {
    supportNeeds.unshift('优先建立安全支持与及时联系');
  }

  const sessionNote = statModel
    ? `本次为第 ${statModel.sessionIndex} 次咨询，综合风险分 ${statModel.compositeScores.riskScore}。`
    : '';

  return {
    summary: `用户呈现${emotion}情绪，主要困扰集中在${problem}，当前风险等级为${risk}。${sessionNote}`.trim(),
    emotionalPresentation: `${emotion}（模型置信 ${Math.round(psych.confidence * 100)}%）`,
    coreConcerns: [problem, snippet].filter(Boolean),
    observedPatterns: patterns.length ? patterns : ['情绪表达尚在初步梳理阶段'],
    strengths,
    supportNeeds,
    recommendedFocus: psych.risk === 'high' || psych.risk === 'critical'
      ? '优先确认安全状态并链接可联系的支持资源'
      : `围绕「${problem}」提供共情与可执行的小步建议`,
    confidence: psych.confidence >= 0.6 ? 'medium' : 'low',
    llmUsed: false,
    generatedAt: new Date().toISOString()
  };
}

async function buildLlmPortrait(
  userQuery: string,
  botReply: string,
  psych: PsychSnapshot,
  priorContext: string,
  statModel?: PsychStatModel
): Promise<ConversationPortrait | null> {
  const prompt = `你是高校心理咨询助理，请基于单次对话生成「学生心理画像」（非医学诊断）。

【用户提问】
${userQuery.slice(0, 800)}

【系统结构化评估】
- 主情绪：${getEmotionLabel(psych.emotion)}
- 问题领域：${getCategoryName(psych.problem as ProblemCategory)}
- 风险等级：${getRiskLabel(psych.risk as RiskLevel)}
- 压力/焦虑/平稳度：${psych.stressLevel}/${psych.anxietyLevel}/${psych.moodStability}
${statModel ? `- 咨询次数：第 ${statModel.sessionIndex} 次` : ''}

【历史脉络（如有）】
${priorContext.slice(0, 600) || '暂无'}

【助手回复摘要】
${botReply.slice(0, 400)}

请输出 JSON（不要其它文字）：
{
  "summary": "2-3句中文画像总述，温暖客观",
  "emotionalPresentation": "情绪呈现方式一句话",
  "coreConcerns": ["核心困扰1","核心困扰2"],
  "observedPatterns": ["可观察模式1","模式2"],
  "strengths": ["资源与优势1"],
  "supportNeeds": ["支持需求1"],
  "recommendedFocus": "下次关注重点一句话",
  "confidence": "low|medium|high"
}

要求：不做诊断、不贴病理标签、不编造用户未表达的内容。`;

  const raw = await callOllamaGenerate(prompt, { temperature: 0.25, maxTokens: 520, timeoutMs: 35000 });
  if (!raw) return null;

  const obj = extractJsonObject(raw);
  if (!obj || typeof obj.summary !== 'string') return null;

  return {
    summary: String(obj.summary).trim(),
    emotionalPresentation: String(obj.emotionalPresentation || getEmotionLabel(psych.emotion)).trim(),
    coreConcerns: asStringArray(obj.coreConcerns, 4),
    observedPatterns: asStringArray(obj.observedPatterns, 4),
    strengths: asStringArray(obj.strengths, 4),
    supportNeeds: asStringArray(obj.supportNeeds, 4),
    recommendedFocus: String(obj.recommendedFocus || '').trim() || '继续倾听并巩固支持资源',
    confidence: normalizeConfidence(obj.confidence),
    llmUsed: true,
    generatedAt: new Date().toISOString()
  };
}

export async function generateConversationPortrait(params: {
  userQuery: string;
  botReply: string;
  psych: PsychSnapshot;
  userId: string;
  priorContext?: string;
  statModel?: PsychStatModel;
  tryLlm?: boolean;
}): Promise<ConversationPortrait> {
  const fallback = buildRulePortrait(params.userQuery, params.psych, params.statModel);
  if (params.tryLlm === false) return fallback;

  try {
    const llmPortrait = await buildLlmPortrait(
      params.userQuery,
      params.botReply,
      params.psych,
      params.priorContext || '',
      params.statModel
    );
    if (llmPortrait?.summary) {
      return {
        ...llmPortrait,
        coreConcerns: llmPortrait.coreConcerns.length ? llmPortrait.coreConcerns : fallback.coreConcerns,
        observedPatterns: llmPortrait.observedPatterns.length
          ? llmPortrait.observedPatterns
          : fallback.observedPatterns,
        strengths: llmPortrait.strengths.length ? llmPortrait.strengths : fallback.strengths,
        supportNeeds: llmPortrait.supportNeeds.length ? llmPortrait.supportNeeds : fallback.supportNeeds
      };
    }
  } catch (err) {
    console.warn('Portrait LLM failed, using rule fallback:', err);
  }

  return fallback;
}
