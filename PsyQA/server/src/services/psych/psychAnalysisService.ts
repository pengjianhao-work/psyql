import {
  analyzeEmotion,
  assessRisk,
  analyzeProblem,
  EmotionAnalysis,
  RiskAssessment,
  ProblemAnalysis,
  EmotionType,
  RiskLevel,
  ProblemCategory
} from './emotionService';
import { callOllamaGenerate, extractJsonObject } from '../llm/ollamaClient';

export type AnalysisSource = 'rule' | 'llm' | 'hybrid';

export interface PsychAnalysisBundle {
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem: ProblemAnalysis;
  sources: {
    emotion: AnalysisSource;
    risk: AnalysisSource;
    problem: AnalysisSource;
  };
  llmUsed: boolean;
  llmRationale?: string;
}

const EMOTION_SET = new Set<EmotionType>([
  'happy', 'sad', 'anxious', 'angry', 'lonely', 'neutral',
  'hopeful', 'confused', 'frustrated', 'guilty', 'shameful', 'proud'
]);

const RISK_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

const PROBLEM_SET = new Set<ProblemCategory>([
  'academic_stress', 'interpersonal', 'family_relationship', 'romantic_relationship',
  'career_future', 'self_identity', 'emotion_regulation', 'body_image', 'addiction', 'trauma', 'other'
]);

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

interface LlmPsychJson {
  emotion?: string;
  secondaryEmotions?: string[];
  confidence?: number;
  risk?: string;
  problem?: string;
  rationale?: string;
}

async function analyzeWithLlm(text: string): Promise<LlmPsychJson | null> {
  const prompt = `你是心理咨询助理。仅根据用户表述输出 JSON，不要其它文字。

用户文本：
"""
${text.slice(0, 1500)}
"""

字段说明：
- emotion: 主情绪，只能是 happy|sad|anxious|angry|lonely|neutral|hopeful|confused|frustrated|guilty|shameful|proud
- secondaryEmotions: 次要情绪数组，最多3个
- confidence: 0到1之间小数
- risk: low|medium|high|critical（无自伤意图勿用 critical）
- problem: academic_stress|interpersonal|family_relationship|romantic_relationship|career_future|self_identity|emotion_regulation|body_image|addiction|trauma|other
- rationale: 一句中文理由

示例输出：
{"emotion":"anxious","secondaryEmotions":["sad"],"confidence":0.72,"risk":"low","problem":"academic_stress","rationale":"提及考试压力与失眠"}

请输出 JSON：`;

  const raw = await callOllamaGenerate(prompt, { temperature: 0.1, maxTokens: 280 });
  if (!raw) return null;
  const obj = extractJsonObject(raw);
  if (!obj) return null;
  return obj as LlmPsychJson;
}

function mergeEmotion(rule: EmotionAnalysis, llm: LlmPsychJson | null): { emotion: EmotionAnalysis; source: AnalysisSource } {
  if (!llm?.emotion || !EMOTION_SET.has(llm.emotion as EmotionType)) {
    return { emotion: rule, source: 'rule' };
  }
  const primary = llm.emotion as EmotionType;
  const secondary = (llm.secondaryEmotions || [])
    .filter((e): e is EmotionType => EMOTION_SET.has(e as EmotionType) && e !== primary)
    .slice(0, 3) as EmotionType[];
  const conf = typeof llm.confidence === 'number'
    ? Math.min(0.95, Math.max(0.2, llm.confidence))
    : Math.max(rule.confidence, 0.5);

  if (rule.confidence >= 0.55 && rule.emotion !== 'neutral' && rule.emotion !== primary) {
    return {
      emotion: {
        emotion: primary,
        confidence: conf * 0.65 + rule.confidence * 0.35,
        keywords: rule.keywords,
        secondaryEmotions: [...new Set([...secondary, ...rule.secondaryEmotions])].slice(0, 3)
      },
      source: 'hybrid'
    };
  }

  return {
    emotion: {
      emotion: primary,
      confidence: conf,
      keywords: rule.keywords,
      secondaryEmotions: secondary.length ? secondary : rule.secondaryEmotions
    },
    source: rule.confidence < 0.45 ? 'llm' : 'hybrid'
  };
}

function mergeRisk(rule: RiskAssessment, llm: LlmPsychJson | null): { risk: RiskAssessment; source: AnalysisSource } {
  if (!llm?.risk || !RISK_ORDER.includes(llm.risk as RiskLevel)) {
    return { risk: rule, source: 'rule' };
  }
  const llmLevel = llm.risk as RiskLevel;
  const level = maxRisk(rule.level, llmLevel);
  if (level === rule.level) {
    return { risk: rule, source: 'rule' };
  }
  if (level === llmLevel && llmLevel !== rule.level) {
    return {
      risk: {
        ...rule,
        level,
        warningMessage: rule.warningMessage || '模型评估提示需要额外关注，建议与信任的人沟通或寻求专业支持。'
      },
      source: 'llm'
    };
  }
  return { risk: rule, source: 'hybrid' };
}

function mergeProblem(rule: ProblemAnalysis, llm: LlmPsychJson | null): { problem: ProblemAnalysis; source: AnalysisSource } {
  if (!llm?.problem || !PROBLEM_SET.has(llm.problem as ProblemCategory)) {
    return { problem: rule, source: 'rule' };
  }
  const cat = llm.problem as ProblemCategory;
  if (rule.category !== 'other' && rule.category !== cat && rule.confidence >= 0.5) {
    return { problem: rule, source: 'hybrid' };
  }
  return {
    problem: {
      ...rule,
      category: cat,
      confidence: Math.max(rule.confidence, typeof llm.confidence === 'number' ? llm.confidence * 0.5 : 0.45)
    },
    source: rule.confidence < 0.45 ? 'llm' : 'hybrid'
  };
}

export async function analyzePsychState(
  text: string,
  prior?: Pick<EmotionAnalysis, 'emotion' | 'confidence'>,
  options?: { tryLlm?: boolean }
): Promise<PsychAnalysisBundle> {
  const ruleEmotion = analyzeEmotion(text, prior);
  const ruleRisk = assessRisk(text);
  const ruleProblem = analyzeProblem(text);

  const tryLlm = options?.tryLlm !== false;
  let llm: LlmPsychJson | null = null;
  if (tryLlm) {
    llm = await analyzeWithLlm(text);
  }

  const { emotion, source: emotionSource } = mergeEmotion(ruleEmotion, llm);
  const { risk, source: riskSource } = mergeRisk(ruleRisk, llm);
  const { problem, source: problemSource } = mergeProblem(ruleProblem, llm);

  return {
    emotion,
    risk,
    problem,
    sources: {
      emotion: emotionSource,
      risk: riskSource,
      problem: problemSource
    },
    llmUsed: Boolean(llm),
    llmRationale: typeof llm?.rationale === 'string' ? llm.rationale : undefined
  };
}
