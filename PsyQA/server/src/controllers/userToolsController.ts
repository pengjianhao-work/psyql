import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import { addMoodCheckin, listMoodCheckins } from '../services/user/moodCheckinService';
import { listDiaries, upsertDiary } from '../services/user/diaryService';
import { buildUserDataExport, exportToMarkdown } from '../services/user/dataExportService';

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

export function getDiaryEntries(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const month = req.query.month ? String(req.query.month) : undefined;
  res.json({ entries: listDiaries(userId, month) });
}

export function postDiaryEntry(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const date = String(req.body?.date || '').trim();
  if (!date) {
    res.status(400).json({ error: '缺少 date' });
    return;
  }
  try {
    const entry = upsertDiary(userId, date, String(req.body?.content ?? ''));
    res.json({ entry });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '保存失败' });
  }
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
