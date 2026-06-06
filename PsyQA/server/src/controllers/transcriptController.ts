import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import { updateStudentProfile } from '../services/user/accountService';
import {
  createTranscriptRequest,
  listTranscriptRequestsForCounselor,
  listTranscriptRequestsForStudent,
  resolveTranscriptRequest
} from '../services/school/transcriptRequestService';

export function postCounselorTranscriptRequest(req: AuthRequest, res: Response): void {
  const user = req.authUser!;
  if (user.role !== 'counselor' && user.role !== 'admin') {
    res.status(403).json({ error: '仅辅导员可发起申请' });
    return;
  }
  const studentId = String(req.body?.studentId || '');
  const reason = String(req.body?.reason || '工作需要查看对话原文');
  if (!studentId) {
    res.status(400).json({ error: '缺少 studentId' });
    return;
  }
  const reqRow = createTranscriptRequest({
    studentId,
    counselorId: user.id,
    counselorName: user.displayName,
    orgId: user.orgId || 'default',
    reason
  });
  res.status(201).json({ message: '已提交查看申请，等待学生确认', request: reqRow });
}

export function getStudentTranscriptRequests(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json({ requests: listTranscriptRequestsForStudent(userId) });
}

export async function postResolveTranscriptRequest(req: AuthRequest, res: Response): Promise<void> {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const requestId = String(req.body?.requestId || '');
  const approve = req.body?.approve === true;
  if (!requestId) {
    res.status(400).json({ error: '缺少 requestId' });
    return;
  }
  const updated = resolveTranscriptRequest(requestId, userId, approve);
  if (!updated) {
    res.status(404).json({ error: '未找到申请' });
    return;
  }
  if (approve) {
    await updateStudentProfile(userId, { allowSchoolTranscriptView: true });
  }
  res.json({
    message: approve ? '已授权辅导员查看对话原文' : '已拒绝该申请',
    request: updated
  });
}

export function getCounselorTranscriptRequests(req: AuthRequest, res: Response): void {
  const user = req.authUser!;
  res.json({ requests: listTranscriptRequestsForCounselor(user.id) });
}
