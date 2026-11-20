import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import { addMoodCheckin, listMoodCheckins } from '../services/user/moodCheckinService';
import { buildUserDataExport, exportToMarkdown } from '../services/user/dataExportService';
import {
  getTaskBoard,
  addWellnessTask,
  toggleTaskDone,
  archiveWellnessTask,
  taskKindLabel,
  TaskKind
} from '../services/user/taskBoardService';

export function postMoodCheckin(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const mood = String(req.body?.mood || '').trim();
  if (!mood) {
    res.status(400).json({ error: '缺少 mood' });
    return;
  }
  try {
    const checkin = addMoodCheckin(userId, mood, req.body?.note ? String(req.body.note) : undefined);
    res.json({ checkin });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '保存失败' });
  }
}

export function getMoodCheckins(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const limit = Number(req.query.limit) || 30;
  res.json({ checkins: listMoodCheckins(userId, limit) });
}

export function getTaskBoardHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json(getTaskBoard(userId));
}

export function postTaskBoardTask(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const title = String(req.body?.title || '').trim();
  if (!title) {
    res.status(400).json({ error: '缺少任务标题' });
    return;
  }
  try {
    const task = addWellnessTask(userId, title, (req.body?.kind as TaskKind) || 'custom');
    res.json({ task: { ...task, kindLabel: taskKindLabel(task.kind) } });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '创建失败' });
  }
}

export function postTaskBoardToggle(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const taskId = Number(req.body?.taskId);
  if (!Number.isFinite(taskId)) {
    res.status(400).json({ error: '缺少 taskId' });
    return;
  }
  const task = toggleTaskDone(userId, taskId);
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  res.json({ task: { ...task, kindLabel: taskKindLabel(task.kind) } });
}

export function deleteTaskBoardTask(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const taskId = Number(req.body?.taskId);
  if (!Number.isFinite(taskId)) {
    res.status(400).json({ error: '缺少 taskId' });
    return;
  }
  const ok = archiveWellnessTask(userId, taskId);
  if (!ok) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  res.json({ message: '已删除' });
}

export function exportUserData(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const data = buildUserDataExport(userId);
  if (req.query.format === 'md') {
    res.type('text/markdown; charset=utf-8');
    res.send(exportToMarkdown(data));
    return;
  }
  res.json(data);
}
