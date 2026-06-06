import {
  rebuildReportFromPsych,
  getUserPsychSnapshots,
  updateDialogReport,
  updateDialogPsych,
  PsychSnapshot
} from './historyManager';
import {
  buildPsychStatModel,
  applyStatisticalFusion,
  refineMetricsWithSignals,
  formatStatisticalExecutiveSummary,
  formatStatisticalReportSection,
  PsychStatModel
} from '../psych/psychStatsService';
import {
  formatEmotionReport,
  EmotionAnalysis,
  RiskAssessment,
  ProblemAnalysis,
  EmotionType
} from '../psych/emotionService';
import { analyzePsychState } from '../psych/psychAnalysisService';
import { getInterventionPlan } from '../psych/interventionService';
import { isOllamaAvailable, shouldUseOllamaLlm } from '../llm/ollamaAvailability';
import { schedulePortraitGeneration } from '../user/portraitQueue';

export const REPORT_PENDING_MARKER = '详细心理评估报告生成中';

const inFlight = new Set<string>();

function buildFullReport(
  emotion: EmotionAnalysis,
  risk: RiskAssessment,
  problem: ProblemAnalysis,
  interventionName: string,
  statModel: PsychStatModel
): string {
  const base = formatEmotionReport(emotion, risk, problem, interventionName);
  return `${formatStatisticalExecutiveSummary(statModel)}\n\n${base}\n\n${formatStatisticalReportSection(statModel)}`;
}

export function buildPlaceholderReport(psych: PsychSnapshot): string {
  const brief = rebuildReportFromPsych(psych);
  return `📊 ${REPORT_PENDING_MARKER}…\n\n（以下为初步概览，完整统计与趋势稍后自动更新）\n\n${brief}`;
}

export function isReportPendingText(report: string | undefined): boolean {
  return Boolean(report?.includes(REPORT_PENDING_MARKER));
}

export function scheduleReportEnrichment(params: {
  userId: string;
  dialogTime: string;
  question: string;
  answer: string;
  fullText: string;
  priorEmotion?: { emotion: EmotionType; confidence: number };
  psychSnapshot: PsychSnapshot;
  frameworkId: string;
  frameworkName: string;
  loadTestFast: boolean;
}): void {
  const key = `${params.userId}:${params.dialogTime}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  void (async () => {
    try {
      const useLlm = !params.loadTestFast && shouldUseOllamaLlm();
      const ollamaOk = useLlm && (await isOllamaAvailable());

      const psychBundle = ollamaOk
        ? await analyzePsychState(params.fullText, params.priorEmotion, { tryLlm: true })
        : null;

      const emotion = psychBundle?.emotion ?? {
        emotion: params.psychSnapshot.emotion,
        confidence: params.psychSnapshot.confidence,
        keywords: [],
        secondaryEmotions: [] as EmotionType[]
      };
      const risk = psychBundle?.risk ?? {
        level: params.psychSnapshot.risk,
        keywords: [],
        warningMessage:
          params.psychSnapshot.risk === 'high' || params.psychSnapshot.risk === 'critical'
            ? '请关注当前风险等级，必要时寻求专业支持。'
            : '',
        hotline: '全国心理援助热线：400-161-9995'
      };
      const problem = psychBundle?.problem ?? {
        category: params.psychSnapshot.problem,
        confidence: 0.75,
        keywords: [],
        subcategories: [] as string[]
      };

      const historySnapshots = getUserPsychSnapshots(params.userId);
      const metrics = refineMetricsWithSignals(emotion, risk, problem);
      const statModel = buildPsychStatModel(emotion, risk, problem, metrics, historySnapshots);
      const fused = applyStatisticalFusion(emotion, risk, problem, statModel);
      statModel.compositeScores.riskLevel = fused.risk.level;

      const intervention = getInterventionPlan(
        fused.emotion.emotion,
        fused.problem.category,
        fused.risk.level
      );
      const fullReport = buildFullReport(
        fused.emotion,
        fused.risk,
        fused.problem,
        intervention.frameworkName,
        statModel
      );
      updateDialogReport(params.userId, params.dialogTime, fullReport);

      const refinedPsych: PsychSnapshot = {
        ...params.psychSnapshot,
        emotion: fused.emotion.emotion,
        risk: fused.risk.level,
        problem: fused.problem.category,
        confidence: fused.emotion.confidence,
        stressLevel: metrics.stressLevel,
        anxietyLevel: metrics.anxietyLevel,
        moodStability: metrics.moodStability,
        frameworkId: intervention.frameworkId,
        analysisSources: psychBundle?.sources ?? params.psychSnapshot.analysisSources
      };
      updateDialogPsych(params.userId, params.dialogTime, refinedPsych);

      schedulePortraitGeneration({
        userId: params.userId,
        dialogTime: params.dialogTime,
        question: params.question,
        answer: params.answer,
        psychSnapshot: refinedPsych,
        statModel,
        tryLlm: Boolean(psychBundle?.llmUsed) && ollamaOk
      });
    } catch (err) {
      console.warn('Async report enrichment failed:', err);
      const fallback = rebuildReportFromPsych(params.psychSnapshot);
      updateDialogReport(params.userId, params.dialogTime, fallback);
    } finally {
      inFlight.delete(key);
    }
  })();
}
