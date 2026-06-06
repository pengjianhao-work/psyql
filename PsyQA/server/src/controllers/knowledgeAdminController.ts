import { Response } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/authMiddleware';
import {
  readSchedulerState,
  triggerKnowledgeUpdate
} from '../services/knowledge/knowledgeScheduler';
import { getKnowledgeBaseCount } from '../services/knowledge/ragService';
import { vectorDb } from '../services/knowledge/vectorDBService';
import {
  appendKnowledgeEntry,
  listKnowledgeCatalog,
  KnowledgeCategoryFilter
} from '../services/knowledge/knowledgeCatalogService';

export const getKnowledgeItems = (req: AuthRequest, res: Response): void => {
  const category = (req.query.category as KnowledgeCategoryFilter) || 'all';
  const q = req.query.q ? String(req.query.q) : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
  res.json(listKnowledgeCatalog({ category, q, page, pageSize }));
};

export const postKnowledgeItem = (req: AuthRequest, res: Response): void => {
  try {
    const item = appendKnowledgeEntry({
      question: String(req.body?.question || ''),
      answer: String(req.body?.answer || ''),
      category: (req.body?.category as KnowledgeCategoryFilter) || 'academic_stress',
      emotions: req.body?.emotions
    });
    res.status(201).json({ message: '已添加知识条目并热重载', item });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : '添加失败' });
  }
};

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
