import { Response } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/authMiddleware';
import {
  readSchedulerState,
  triggerKnowledgeUpdate
} from '../services/knowledge/knowledgeScheduler';
import { getKnowledgeBaseCount } from '../services/knowledge/ragService';
import { vectorDb } from '../services/knowledge/vectorDBService';

export const getKnowledgeUpdateStatus = (_req: AuthRequest, res: Response): void => {
  const state = readSchedulerState();
  res.json({
    state,
    live: {
      knowledgeBaseCount: getKnowledgeBaseCount(),
      vectorDbCount: vectorDb.getDocumentCount()
    },
    autoUpdateEnabled: process.env.KNOWLEDGE_AUTO_UPDATE === '1'
  });
};

export const postKnowledgeUpdate = async (req: AuthRequest, res: Response): Promise<void> => {
  const force = req.body?.force === true;
  const result = await triggerKnowledgeUpdate(force);
  res.status(result.ok ? 200 : 500).json(result);
};

export const knowledgeAdminMiddleware = [requireAuth, requireRole('admin')] as const;
