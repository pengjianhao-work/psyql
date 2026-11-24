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
import {
  createJournal,
  deleteJournal,
  listJournals,
  updateJournal
} from '../services/user/journalService';
import { listMyBottles, pickBottle, throwBottle } from '../services/social/driftBottleService';

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

export function getJournals(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const limit = Number(req.query.limit) || 50;
  res.json({ journals: listJournals(userId, limit) });
}

export function postJournal(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const body = String(req.body?.body || '').trim();
  if (!body) {
    res.status(400).json({ error: '日记内容不能为空' });
    return;
  }
  try {
    const journal = createJournal(userId, {
      title: req.body?.title !== undefined ? String(req.body.title) : undefined,
      body,
      moodTag: req.body?.moodTag !== undefined ? String(req.body.moodTag) : undefined
    });
    res.json({ journal });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '保存失败' });
  }
}

export function patchJournal(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const journalId = Number(req.body?.journalId ?? req.body?.id);
  if (!Number.isFinite(journalId)) {
    res.status(400).json({ error: '缺少 journalId' });
    return;
  }
  try {
    const journal = updateJournal(userId, journalId, {
      title: req.body?.title !== undefined ? String(req.body.title) : undefined,
      body: req.body?.body !== undefined ? String(req.body.body) : undefined,
      // null 表示清除心情标签
      moodTag:
        req.body?.moodTag === null
          ? null
          : req.body?.moodTag !== undefined
            ? String(req.body.moodTag)
            : undefined
    });
    if (!journal) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }
    res.json({ journal });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '保存失败' });
  }
}

export function postDeleteJournal(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const journalId = Number(req.body?.journalId ?? req.body?.id);
  if (!Number.isFinite(journalId)) {
    res.status(400).json({ error: '缺少 journalId' });
    return;
  }
  const ok = deleteJournal(userId, journalId);
  if (!ok) {
    res.status(404).json({ error: '日记不存在' });
    return;
  }
  res.json({ message: '已删除' });
}

export function postThrowBottle(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const body = req.body?.body;
  if (typeof body !== 'string' || !body.trim()) {
    res.status(400).json({ error: '瓶子里的话不能为空' });
    return;
  }
  try {
    // intercepted / rate_limited / contact_info 都是合法业务结果，统一 200
    const result = throwBottle(userId, {
      body,
      moodTag: req.body?.moodTag !== undefined ? String(req.body.moodTag) : undefined
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '扔瓶子失败' });
  }
}

export function postPickBottle(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  res.json(pickBottle(userId));
}

export function getMyBottles(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json({ bottles: listMyBottles(userId, 20) });
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
