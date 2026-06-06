/** 两年长效个性化 Agent · 结构化画像与阶段 */
export type AgentPhase = 'collect' | 'shape' | 'mature';

export interface UserStaticProfile {
  age?: number | string;
  occupation?: string;
  familyBackground?: string;
  majorLifeEvents?: string[];
  notes?: string;
}

export interface EmotionTimelineEntry {
  month: string;
  dominantEmotions: string[];
  triggers: string[];
  notes?: string;
}

export interface InterventionProfile {
  effectiveApproaches: string[];
  avoidPhrases: string[];
  sensitiveTopics: string[];
  preferredTone?: 'gentle' | 'rational' | 'brief' | string;
}

export interface UserAgentProfileRow {
  userId: string;
  basicJson: UserStaticProfile | null;
  emotionTimelineJson: EmotionTimelineEntry[];
  interventionJson: InterventionProfile | null;
  agentSystemPrompt: string | null;
  agentPhase: AgentPhase;
  firstDialogAt: string | null;
  monthlySummariesJson: Array<{ month: string; summary: string; createdAt: string }>;
  annualReportsJson: Array<{ year: string; report: string; createdAt: string }>;
  updatedAt: string;
}

export interface RagBlendWeights {
  user: number;
  public: number;
  phase: AgentPhase;
  label: string;
  /** 自首条咨询起的月数 */
  monthsElapsed: number;
  /** 已向量化的对话条数 */
  memoryCount: number;
  /** 时间轴插值得到的私有权重（未加记忆加成） */
  timelineUser: number;
  /** 记忆密度加成 */
  memoryBoost: number;
}

export interface UserDialogVectorMeta {
  month: string;
  emotion: string;
  trigger: string;
  tag: string;
  dialogTime: string;
}
