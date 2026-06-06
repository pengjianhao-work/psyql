import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import { buildEmotionRhythmCalendar } from '../services/psych/emotionRhythmService';
import { pickCbtModule, scoreCbtCompletion } from '../services/psych/cbtMicroModuleService';
import { mineImplicitNeeds } from '../services/psych/implicitNeedsService';
import { getSeasonalRagBoost } from '../services/knowledge/seasonalRagPolicy';
import {
  listMemoryMeta,
  upsertMemoryMeta,
  batchArchiveMemories,
  MemoryTopicTag
} from '../services/user/memoryTagService';
import { buildSchoolHeatmap } from '../services/school/schoolHeatmapService';
import {
  listInterventionLedgers,
  updateInterventionLedger,
  getOverdueFollowUps
} from '../services/school/interventionLedgerService';
import {
  submitKnowledgeReview,
  listKnowledgeReviews,
  ReviewVerdict
} from '../services/knowledge/knowledgeReviewService';
import { batchCreateTranscriptRequests, batchResolveTranscriptRequests } from '../services/school/transcriptRequestService';
import { updateStudentProfile } from '../services/user/accountService';

export function getEmotionRhythm(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const month = req.query.month ? String(req.query.month) : undefined;
  res.json(buildEmotionRhythmCalendar(userId, month));
}

export function getCbtModule(req: AuthRequest, res: Response): void {
  const problem = req.query.problem ? String(req.query.problem) : undefined;
  const emotion = req.query.emotion ? String(req.query.emotion) : undefined;
  res.json({ module: pickCbtModule(problem, emotion) });
}

export function postCbtComplete(req: AuthRequest, res: Response): void {
  const module = pickCbtModule(req.body?.problem, req.body?.emotion);
  const selections = (req.body?.selections || {}) as Record<number, string>;
  const result = scoreCbtCompletion(module, selections);
  res.json({ ...result, bonus: module.completionBonus });
}

export function getMemoryTags(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const tag = req.query.tag ? (String(req.query.tag) as MemoryTopicTag) : undefined;
  res.json({ memories: listMemoryMeta(userId, tag) });
}

export function patchMemoryTag(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const dialogTime = String(req.body?.dialogTime || '');
  if (!dialogTime) {
    res.status(400).json({ error: '缺少 dialogTime' });
    return;
  }
  const entry = upsertMemoryMeta(userId, dialogTime, {
    tags: req.body?.tags,
    locked: req.body?.locked,
    archived: req.body?.archived
  });
  res.json({ memory: entry });
}

export function postMemoryBatchArchive(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const dialogTimes = Array.isArray(req.body?.dialogTimes) ? (req.body.dialogTimes as string[]) : [];
  const archived = req.body?.archived !== false;
  const count = batchArchiveMemories(userId, dialogTimes, archived);
  res.json({ message: `已${archived ? '归档' : '取消归档'} ${count} 条`, count });
}

export function getSeasonalRag(req: AuthRequest, res: Response): void {
  res.json(getSeasonalRagBoost());
}

export function getImplicitNeeds(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const question = String(req.query.question || '');
  res.json({ hints: mineImplicitNeeds(userId, question) });
}

export async function getSchoolHeatmap(req: AuthRequest, res: Response): Promise<void> {
  const month = req.query.month ? String(req.query.month) : undefined;
  const payload = await buildSchoolHeatmap(req.authUser!, month);
  res.json(payload);
}

export function getInterventionLedgers(req: AuthRequest, res: Response): void {
  const user = req.authUser!;
  const orgIds =
    user.role === 'admin'
      ? undefined
      : user.managedOrgIds?.length
        ? user.managedOrgIds
        : user.orgId
          ? [user.orgId]
          : undefined;
  res.json({
    records: listInterventionLedgers(orgIds),
    overdue: getOverdueFollowUps(orgIds)
  });
}

export function patchInterventionLedger(req: AuthRequest, res: Response): void {
  const id = String(req.params.id || '');
  const updated = updateInterventionLedger(id, {
    status: req.body?.status,
    meetingNotes: req.body?.meetingNotes,
    measures: req.body?.measures,
    nextFollowUpAt: req.body?.nextFollowUpAt,
    closedAt: req.body?.closedAt
  });
  if (!updated) {
    res.status(404).json({ error: '未找到台账' });
    return;
  }
  res.json({ record: updated });
}

export function postKnowledgeReview(req: AuthRequest, res: Response): void {
  const user = req.authUser!;
  const verdict = String(req.body?.verdict || 'partial') as ReviewVerdict;
  const entry = submitKnowledgeReview({
    knowledgeQuestion: String(req.body?.question || ''),
    knowledgeAnswerPreview: String(req.body?.answerPreview || '').slice(0, 500),
    verdict,
    reviewerId: user.id,
    reviewerName: user.displayName,
    comment: req.body?.comment ? String(req.body.comment) : undefined
  });
  res.status(201).json({ review: entry });
}

export function getKnowledgeReviews(_req: AuthRequest, res: Response): void {
  res.json({ reviews: listKnowledgeReviews() });
}

export function postBatchTranscriptRequest(req: AuthRequest, res: Response): void {
  const user = req.authUser!;
  if (user.role !== 'counselor' && user.role !== 'admin') {
    res.status(403).json({ error: '仅辅导员可批量申请' });
    return;
  }
  const studentIds = Array.isArray(req.body?.studentIds) ? (req.body.studentIds as string[]) : [];
  if (!studentIds.length) {
    res.status(400).json({ error: '缺少 studentIds' });
    return;
  }
  const created = batchCreateTranscriptRequests({
    studentIds,
    counselorId: user.id,
    counselorName: user.displayName,
    orgId: user.orgId || 'default',
    reason: String(req.body?.reason || '班级建档批量授权申请')
  });
  res.status(201).json({ message: `已提交 ${created.length} 条授权申请`, requests: created });
}

export async function postBatchResolveTranscript(req: AuthRequest, res: Response): Promise<void> {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const requestIds = Array.isArray(req.body?.requestIds) ? (req.body.requestIds as string[]) : [];
  const approve = req.body?.approve === true;
  const count = batchResolveTranscriptRequests(userId, requestIds, approve);
  if (approve && count > 0) {
    await updateStudentProfile(userId, { allowSchoolTranscriptView: true });
  }
  res.json({ message: approve ? `已同意 ${count} 条` : `已拒绝 ${count} 条`, count });
}
