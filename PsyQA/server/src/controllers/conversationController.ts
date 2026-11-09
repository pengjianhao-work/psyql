import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { resolveStudentUserId } from '../utils/resolveUserId';
import {
  archiveConversation,
  createConversation,
  listConversations
} from '../db/conversationStore';
import { getDialogsByConversation } from '../db/historyStore';

export function listConversationsHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  res.json({ conversations: listConversations(userId) });
}

export function createConversationHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  res.json({ conversation: createConversation(userId) });
}

export function archiveConversationHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.body?.userId);
  if (!userId) return;
  const id = String(req.params.id || '');
  if (!id) {
    res.status(400).json({ error: '缺少会话 id' });
    return;
  }
  const archived = archiveConversation(userId, id);
  if (!archived) {
    res.status(404).json({ error: '没有可结束的会话' });
    return;
  }
  res.json({ ok: true });
}

export function getConversationMessagesHandler(req: AuthRequest, res: Response): void {
  const userId = resolveStudentUserId(req, res, req.query.userId);
  if (!userId) return;
  const id = String(req.params.id || '');
  const owned = listConversations(userId).some((row) => row.id === id);
  if (!owned) {
    res.status(404).json({ error: '找不到这段对话' });
    return;
  }
  const history = getDialogsByConversation(userId, id).map((row) => ({
    time: row.time,
    user: row.user,
    bot: row.bot,
    summary: row.summary,
    report: row.report
  }));
  res.json({ history });
}
