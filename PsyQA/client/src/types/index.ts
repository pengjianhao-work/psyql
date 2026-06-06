export type EmotionType = 'happy' | 'sad' | 'anxious' | 'angry' | 'lonely' | 'neutral' 
  | 'hopeful' | 'confused' | 'frustrated' | 'guilty' | 'shameful' | 'proud';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ProblemCategory = 
  | 'academic_stress'     // 学业压力
  | 'interpersonal'       // 人际关系
  | 'family_relationship' // 家庭关系
  | 'romantic_relationship' // 恋爱关系
  | 'career_future'       // 职业未来
  | 'self_identity'       // 自我认同
  | 'emotion_regulation'  // 情绪调节
  | 'body_image'          // 身体意象
  | 'addiction'           // 成瘾问题
  | 'trauma'              // 创伤经历
  | 'other';              // 其他

export interface EmotionAnalysis {
  emotion: EmotionType;
  confidence: number;
  keywords: string[];
  secondaryEmotions: EmotionType[];
}

export interface RiskAssessment {
  level: RiskLevel;
  keywords: string[];
  warningMessage: string;
  hotline: string;
}

export interface ProblemAnalysis {
  category: ProblemCategory;
  confidence: number;
  keywords: string[];
  subcategories: string[];
}

export interface EmotionStyle {
  greeting: string;
  tone: string;
  color: string;
  emoji: string;
}

export interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  knowledgeSources?: KnowledgeItem[];
  similarQuestions?: SimilarQuestion[];
  emotion?: EmotionAnalysis;
  risk?: RiskAssessment;
  problem?: ProblemAnalysis;
  emotionStyle?: EmotionStyle;
  report?: string;
  timestamp?: string;
  /** 本条回复由大模型生成 */
  llmUsed?: boolean;
  /** 使用 ReAct 推理链生成 */
  reactUsed?: boolean;
  reactTrace?: ReActStep[];
}

export interface ReActStep {
  step: number;
  thought?: string;
  action: string;
  actionInput: Record<string, unknown>;
  observation: string;
}

export interface KnowledgeItem {
  question: string;
  answer: string;
}

export interface SimilarQuestion {
  question: string;
  description: string;
  keywords: string;
  answers: Answer[];
  similarity: number;
}

export interface Answer {
  answer_text: string;
  has_label: boolean;
  labels_sequence: string[];
}

export interface InterventionInfo {
  frameworkId: string;
  frameworkName: string;
}

export interface CarePlanSuggestion {
  categoryName: string;
  suggestion: string;
}

export interface AnalysisSources {
  emotion: 'rule' | 'llm' | 'hybrid';
  risk: 'rule' | 'llm' | 'hybrid';
  problem: 'rule' | 'llm' | 'hybrid';
}

export type MetricLevel = 'low' | 'moderate' | 'high' | 'severe';
export type TrendDirection = 'improving' | 'stable' | 'worsening' | 'insufficient_data';

export interface MetricDetail {
  value: number;
  level: MetricLevel;
  levelText: string;
  percentile?: number;
  baselineDelta?: number;
  description: string;
}

export interface TrendStat {
  metric: string;
  metricKey: 'stress' | 'anxiety' | 'mood' | 'distress' | 'wellbeing';
  current: number;
  previous?: number;
  delta?: number;
  slopePerSession?: number;
  movingAvg3?: number;
  ewma?: number;
  volatility?: number;
  trend: TrendDirection;
}

export interface PsychStatModel {
  sessionIndex: number;
  totalSessions: number;
  showAdvancedStats: boolean;
  statsReliability: 'low' | 'medium' | 'high';
  personalBaseline?: {
    stress: number;
    anxiety: number;
    mood: number;
    samples: number;
  };
  indices: {
    stress: MetricDetail;
    anxiety: MetricDetail;
    moodStability: MetricDetail;
    distress: MetricDetail;
    wellbeing: MetricDetail;
    functionalCapacity: MetricDetail;
  };
  compositeScores: {
    riskScore: number;
    riskLevel: RiskLevel;
    emotionIntensity: number;
    problemSalience: number;
    modelConfidence: number;
  };
  distributions: {
    emotionFreq: Array<{ emotion: string; count: number; share: number }>;
    problemFreq: Array<{ category: string; count: number; share: number }>;
    riskFreq: Array<{ level: string; count: number; share: number }>;
  };
  trends: TrendStat[];
  correlations: {
    stressAnxiety?: number;
    moodDistress?: number;
    note: string;
    visible: boolean;
  };
  intelligentModel?: {
    architectureVersion: string;
    fusionWeights: { statistical: number; machineLearning: number; neuralNetwork: number };
    mlCluster: string;
    mlClusterId: string;
    dynamicWeights: { stress: number; anxiety: number; moodInstability: number };
    bayesianApplied: boolean;
    predictions: { nextStress: number; nextAnxiety: number };
    hiddenRisk: { score: number; flag: boolean };
    primaryConcern: string;
    featureAttention: Record<string, number>;
    layerScores: {
      statistical: { distress: number; wellbeing: number; functional: number };
      ml: { distress: number; wellbeing: number; functional: number };
      neural: { distress: number; wellbeing: number; functional: number };
      fused: { distress: number; wellbeing: number; functional: number };
    };
    ewmaSmoothed: { stress: number; anxiety: number; mood: number };
  };
  advancedMathematics?: {
    emotionEntropy: number;
    emotionEntropyNote: string;
    stressAutocorr: number;
    anxietyAutocorr: number;
    stressZScore: number;
    anxietyZScore: number;
    mahalanobisDistance: number;
    kalmanStressEstimate: number;
    stressCoefficientOfVariation: number;
    anomalyScore: number;
    formulas: string[];
  };
  summaryLines: string[];
}

export const STATS_RELIABILITY_NAMES: Record<PsychStatModel['statsReliability'], string> = {
  low: '仅供参考',
  medium: '较为可靠',
  high: '相当可靠'
};

export const METRIC_LEVEL_NAMES: Record<MetricLevel, string> = {
  low: '低',
  moderate: '中等',
  high: '偏高',
  severe: '高'
};

export const TREND_DIRECTION_NAMES: Record<TrendDirection, string> = {
  improving: '改善中',
  stable: '基本稳定',
  worsening: '需关注',
  insufficient_data: '数据不足'
};

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

export interface QuestionResponse {
  question: string;
  description?: string;
  answer: string;
  knowledgeSources: KnowledgeItem[];
  similarQuestions: SimilarQuestion[];
  summary: string;
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem: ProblemAnalysis;
  emotionStyle: EmotionStyle;
  intervention?: InterventionInfo;
  carePlan?: CarePlanSuggestion;
  analysisSources?: AnalysisSources;
  llmUsed?: boolean;
  reactUsed?: boolean;
  reactTrace?: ReActStep[];
  report: string;
  statModel?: PsychStatModel;
  responseTimeMs?: number;
  dialogId?: string;
  portrait?: ConversationPortrait;
  /** 画像异步生成中时为 true */
  portraitPending?: boolean;
  /** 完整评估报告异步生成中时为 true */
  reportPending?: boolean;
}

export interface GroupedHistoryItem {
  time: string;
  user: string;
  bot: string;
  summary: string;
  tags: string[];
  group: string;
  portrait?: ConversationPortrait;
  psych?: {
    emotion: EmotionType;
    risk: RiskLevel;
    problem: ProblemCategory;
    confidence: number;
    stressLevel: number;
    anxietyLevel: number;
    moodStability: number;
  };
}

export interface LatestAssessment {
  emotion: EmotionAnalysis;
  risk: RiskAssessment;
  problem: ProblemAnalysis;
  report: string;
  statModel: PsychStatModel;
  emotionStyle: EmotionStyle;
}

export interface UserProgress {
  totalTimes: number;
  latestAssessment?: LatestAssessment;
  history: Array<{
    time: string;
    user: string;
    bot: string;
    summary: string;
    report?: string;
    stressLevel?: number;
    anxietyLevel?: number;
    moodStability?: number;
    emotion?: string;
    risk?: string;
    problem?: string;
    portrait?: Pick<ConversationPortrait, 'summary' | 'emotionalPresentation' | 'recommendedFocus' | 'llmUsed'>;
  }>;
}

export interface HistoryDataPoint {
  date: string;
  stressLevel: number;
  anxietyLevel: number;
  moodStability: number;
}

export const EMOTION_NAMES: Record<EmotionType, string> = {
  happy: '开心',
  sad: '低落',
  anxious: '焦虑',
  angry: '愤怒',
  lonely: '孤独',
  neutral: '平稳',
  hopeful: '充满希望',
  confused: '迷茫困惑',
  frustrated: '挫败',
  guilty: '内疚',
  shameful: '羞愧',
  proud: '自豪'
};

export const PROBLEM_CATEGORY_NAMES: Record<ProblemCategory, string> = {
  academic_stress: '学业压力',
  interpersonal: '人际关系',
  family_relationship: '家庭关系',
  romantic_relationship: '恋爱关系',
  career_future: '职业未来',
  self_identity: '自我认同',
  emotion_regulation: '情绪调节',
  body_image: '身体意象',
  addiction: '成瘾问题',
  trauma: '创伤经历',
  other: '其他'
};

export const RISK_LEVEL_NAMES: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重'
};
